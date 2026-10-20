import { embed as hashingEmbed, semanticOpinion } from '../lib/semantic'
import type { SaliencySnapshot } from './types'

/**
 * Neural context saliency.
 *
 * We do not have access to the swarm model's attention maps, so this is a
 * gradient-free occlusion saliency: remove a span (or token) from the untrusted
 * context, re-embed the remainder, and measure how far the representation
 * moves. A span the model is leaning on moves it a lot.
 *
 * Two further signals are blended in:
 *  - embedding drift: how far the untrusted context sits from the trusted task,
 *  - intent prior: cosine against the manipulation archetypes in semantic.ts.
 *
 * The live server injects a MiniLM ONNX embedder; tests and the offline
 * fallback use the deterministic hashing vectorizer. The backend is reported in
 * the snapshot so the dashboard never pretends the fallback is a transformer.
 */

export type Embedder = (text: string) => Float32Array | Promise<Float32Array>

const MAX_SPANS = 6
const MAX_TOKENS = 16

/** Instruction-bearing verbs. A bridge prior for the offline hashing backend;
 *  the transformer signal (occlusion + drift) leads when ONNX is warm. */
const IMPERATIVE_RE =
  /\b(execute|run|report|confirm|send|forward|upload|ignore|disregard|override|supersede[sd]?|directive|instruction|deploy|install|delete|exfiltrate)\b/gi

/** Same high-entropy shape the taint sentinel uses for canaries. */
const MARKER_RE = /^(?=.*[a-z])(?=.*\d)[a-z0-9]{8,}$/i

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function imperativeDensity(text: string): number {
  const hits = text.match(IMPERATIVE_RE)?.length ?? 0
  return clamp01(hits / 3)
}

function hasMarker(text: string): number {
  for (const token of text.match(/[A-Za-z0-9]+/g) ?? []) {
    if (MARKER_RE.test(token)) return 1
  }
  return 0
}

/** Dimension-agnostic cosine: MiniLM is 384-d, hashing is 512-d. */
function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) dot += a[i] * b[i]
  return dot
}

function splitSpans(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((span) => span.trim())
    .filter((span) => span.length >= 12)
    .slice(0, MAX_SPANS)
}

function tokenize(text: string): string[] {
  return (text.match(/[A-Za-z0-9_'-]{3,}/g) ?? []).slice(0, MAX_TOKENS)
}

class VectorCache {
  private readonly cache = new Map<string, Float32Array>()
  private readonly embed: Embedder

  constructor(embed: Embedder) {
    this.embed = embed
  }

  async get(text: string): Promise<Float32Array> {
    const hit = this.cache.get(text)
    if (hit) return hit
    const vec = await this.embed(text)
    this.cache.set(text, vec)
    return vec
  }
}

export interface SaliencyInput {
  /** Trusted task / planner context. */
  trusted: string
  /** Content retrieved from an untrusted source. */
  untrusted: string
  /** 0..1 share of downstream context derived from untrusted sources. */
  bleed?: number
  /** 0..1 taint carried into the proposed action (0 before a proposal). */
  carry?: number
  canary?: string
  embed?: Embedder
  backend?: string
}

export function hashingEmbedder(text: string): Float32Array {
  return hashingEmbed(text)
}

export async function analyzeSaliency(input: SaliencyInput): Promise<SaliencySnapshot> {
  const embed = input.embed ?? hashingEmbedder
  const cache = new VectorCache(embed)
  const untrusted = input.untrusted.trim()

  if (untrusted.length < 12) {
    return {
      backend: input.backend ?? 'hashing-512',
      contamination: 0,
      saliency: 0,
      drift: 0,
      bleed: clamp01(input.bleed ?? 0),
      intent: 0,
      imperative: 0,
      marker: 0,
      carry: clamp01(input.carry ?? 0),
      spans: [],
      tokens: [],
      canary: input.canary,
    }
  }

  const full = await cache.get(untrusted)
  const spans = splitSpans(untrusted)
  type SpanScore = {
    text: string
    raw: number
    saliency: number
    intent: number
    imperative: number
    risk: number
  }
  const scored: SpanScore[] = []

  for (const span of spans) {
    const without = untrusted.replace(span, ' ')
    const vec = await cache.get(without)
    const raw = clamp01(1 - cosine(full, vec))
    const opinion = semanticOpinion(span)
    const intent = clamp01((opinion.similarity - 0.05) / 0.25)
    const imperative = imperativeDensity(span)
    scored.push({ text: span, raw, saliency: 0, intent, imperative, risk: 0 })
  }

  const maxRaw = Math.max(0.0001, ...scored.map((s) => s.raw))
  for (const span of scored) {
    span.saliency = clamp01(span.raw / maxRaw)
    // Absolute occlusion, not just relative: a benign page can have a "most
    // salient" sentence without being directive.
    const absolute = clamp01((span.raw - 0.015) / 0.2)
    span.risk = clamp01(0.4 * absolute + 0.25 * span.intent + 0.35 * span.imperative)
  }
  scored.sort((a, b) => b.risk - a.risk)

  const top = scored[0]
  const tokens: Array<{ token: string; saliency: number }> = []
  if (top) {
    const rawTokens: Array<{ token: string; raw: number }> = []
    for (const token of tokenize(top.text)) {
      const withoutToken = top.text.replace(token, ' ')
      const without = untrusted.replace(top.text, withoutToken)
      const vec = await cache.get(without)
      rawTokens.push({ token, raw: clamp01(1 - cosine(full, vec)) })
    }
    const maxToken = Math.max(0.0001, ...rawTokens.map((t) => t.raw))
    for (const token of rawTokens) {
      tokens.push({ token: token.token, saliency: clamp01(token.raw / maxToken) })
    }
    tokens.sort((a, b) => b.saliency - a.saliency)
  }

  const trustedVec = await cache.get(input.trusted)
  const drift = clamp01(1 - cosine(trustedVec, full))
  const intent = top?.intent ?? 0
  const imperative = top?.imperative ?? 0
  const marker = hasMarker(untrusted)
  const saliency = top?.risk ?? 0
  const bleed = clamp01(input.bleed ?? 1)
  const carry = clamp01(input.carry ?? 0)

  const contamination = 100 * clamp01(
    0.45 * saliency +
      0.15 * bleed +
      0.15 * drift * saliency +
      0.2 * marker +
      0.05 * carry,
  )

  return {
    backend: input.backend ?? 'hashing-512',
    contamination: Math.round(contamination),
    saliency,
    drift,
    bleed,
    intent,
    imperative,
    marker,
    carry,
    spans: scored
      .slice(0, MAX_SPANS)
      .map(({ text, saliency: relative, raw }) => ({ text, saliency: relative, raw })),
    tokens,
    canary: input.canary,
  }
}

/**
 * Recompute the metric once the action carries taint. The dashboard shows the
 * metric rising as evidence accumulates, instead of a single static score.
 */
export function withCarry(
  snapshot: SaliencySnapshot,
  carry: number,
  bleed?: number,
): SaliencySnapshot {
  const nextCarry = clamp01(carry)
  const nextBleed = clamp01(bleed ?? snapshot.bleed)
  const contamination =
    100 *
    clamp01(
      0.45 * snapshot.saliency +
        0.15 * nextBleed +
        0.15 * snapshot.drift * snapshot.saliency +
        0.2 * snapshot.marker +
        0.05 * nextCarry,
    )
  return {
    ...snapshot,
    carry: nextCarry,
    bleed: nextBleed,
    contamination: Math.round(contamination),
  }
}
