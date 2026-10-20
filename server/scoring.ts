import {
  finalizeVerdict,
  inspect,
  type Finding,
  type ToolCall,
  type Verdict,
} from '../src/lib/inspect'
import { EXEMPLARS, type Exemplar } from '../src/lib/semantic'

/**
 * Server-side transformer second opinion.
 *
 * The browser never touches this: the ONNX runtime is loaded lazily (dynamic
 * import) and only on the server. If the model is missing or fails to load, the
 * gate silently falls back to the deterministic + hashing layers, so the demo
 * can never be blocked by a model.
 */

type Embedder = (text: string) => Promise<Float32Array | null>

let embedder: Embedder | null = null
let exemplarVectors: Array<{ exemplar: Exemplar; vec: Float32Array }> = []
let backend = 'hashing-512'
let state: 'cold' | 'warming' | 'warm' | 'unavailable' = 'cold'
let warmPromise: Promise<boolean> | null = null

const MODELS_DIR = process.env.CHAPERONE_MODELS ?? 'models'
const ONNX_MODEL = process.env.CHAPERONE_ONNX_MODEL ?? 'Xenova/all-MiniLM-L6-v2'
/** Cosine at/above this is a moderate embedding match. Calibrated empirically. */
const ONNX_MODERATE = Number(process.env.CHAPERONE_ONNX_MODERATE ?? 0.3)
/** Cosine at/above this is a strong match. */
const ONNX_STRONG = Number(process.env.CHAPERONE_ONNX_STRONG ?? 0.55)

export function semanticStatus(): { state: string; backend: string } {
  return { state, backend }
}

/**
 * Embed text for the Aegis-Swarm saliency analyzer. Returns null until the
 * transformer is warm so callers can fall back to the deterministic vectorizer.
 */
export async function embedForAnalysis(text: string): Promise<Float32Array | null> {
  if (state !== 'warm' || !embedder) return null
  return embedder(text)
}

export async function warmup(): Promise<boolean> {
  if (state === 'warm') return true
  if (warmPromise) return warmPromise
  state = 'warming'
  warmPromise = (async () => {
    try {
      const tf = await import('@huggingface/transformers')
      tf.env.allowLocalModels = true
      tf.env.allowRemoteModels = true
      tf.env.cacheDir = MODELS_DIR
      const pipe = await tf.pipeline('feature-extraction', ONNX_MODEL, { dtype: 'q8' })
      embedder = async (text: string) => {
        const out = await pipe(text, { pooling: 'mean', normalize: true })
        return out.data as Float32Array
      }
      exemplarVectors = []
      for (const exemplar of EXEMPLARS) {
        const vec = await embedder(exemplar.text)
        if (vec) exemplarVectors.push({ exemplar, vec })
      }
      backend = `onnx-${ONNX_MODEL.split('/').pop()}`
      state = 'warm'
      return true
    } catch {
      state = 'unavailable'
      return false
    }
  })()
  return warmPromise
}

function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) s += a[i] * b[i]
  return s
}

/**
 * Score a call with the embedding second opinion layered over the synchronous
 * engine. Returns the sync verdict unchanged when the model is not warm, so
 * callers never have to block on the model.
 */
export async function inspectCallAsync(call: ToolCall): Promise<Verdict> {
  const base = inspect(call)
  if (state !== 'warm' || !embedder || !exemplarVectors.length) return base

  const vec = await embedder(`${call.summary}\n${call.payload}`)
  if (!vec) return base

  let best: { exemplar: Exemplar; similarity: number } | null = null
  for (const e of exemplarVectors) {
    const s = cosine(vec, e.vec)
    if (!best || s > best.similarity) best = { exemplar: e.exemplar, similarity: s }
  }
  if (!best || best.similarity < ONNX_MODERATE) return base

  // Only contribute when the deterministic layer has not already gated the call.
  // Otherwise we would stack weight on top of an existing review and turn it into
  // an over-eager deny (observed on secret_store and IAM calls during calibration).
  if (base.recommendation !== 'allow') return base

  const strong = best.similarity >= ONNX_STRONG
  const finding: Finding = {
    id: 'onnx-semantic',
    title: 'Embedding manipulation match',
    detail: `MiniLM embeddings place this text ${(best.similarity * 100).toFixed(0)}% close to a known "${best.exemplar.label}" pattern: "${best.exemplar.text}". No signature rule matched this call.`,
    weight: strong ? 32 : 26,
  }
  return finalizeVerdict([...base.findings, finding])
}
