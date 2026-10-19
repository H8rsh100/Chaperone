/**
 * Pre-fetch the embedding model into ./models so the server can run fully
 * offline (no network at demo time). Idempotent: run it once, commit ./models,
 * and the repo becomes self-contained.
 */
import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = true
env.allowRemoteModels = true
env.cacheDir = process.env.CHAPERONE_MODELS ?? 'models'

const model = process.env.CHAPERONE_ONNX_MODEL ?? 'Xenova/all-MiniLM-L6-v2'
await pipeline('feature-extraction', model, { dtype: 'q8' })
console.log(`model cached in ./${env.cacheDir} (${model})`)
