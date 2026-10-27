/** Paired, offline removal of the MiniLM finding from live inspect verdicts. */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CORPUS } from './corpus.mjs'

const BACKEND = 'onnx-all-MiniLM-L6-v2'
const FINDING_IDS = new Set([
  'secret-exfil', 'destructive', 'egress', 'privilege', 'injection',
  'path-escape', 'semantic-injection', 'onnx-semantic', 'taint-flow',
])

// Mirrors finalizeVerdict in src/lib/inspect.ts; tests compare against the source.
function finalize(findings) {
  const score = Math.min(100, findings.reduce((sum, finding) => sum + finding.weight, 0))
  const level = score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low'
  const recommendation = score >= 50 ? 'deny' : score >= 25 ? 'review' : 'allow'
  return { score, level, recommendation }
}

export function reconstruct(verdict) {
  if (!verdict || typeof verdict !== 'object' || !Array.isArray(verdict.findings) ||
      typeof verdict.headline !== 'string' || !verdict.headline.trim()) {
    throw new Error('malformed verdict')
  }
  const seen = new Set()
  for (const finding of verdict.findings) {
    if (!finding || typeof finding !== 'object' || !FINDING_IDS.has(finding.id) ||
        seen.has(finding.id) || typeof finding.title !== 'string' || !finding.title.trim() ||
        typeof finding.detail !== 'string' || !finding.detail.trim() ||
        typeof finding.weight !== 'number' || !Number.isFinite(finding.weight) || finding.weight < 0) {
      throw new Error('malformed verdict finding')
    }
    seen.add(finding.id)
  }
  const observed = finalize(verdict.findings)
  if (verdict.score !== observed.score || verdict.level !== observed.level ||
      verdict.recommendation !== observed.recommendation) {
    throw new Error('verdict score, level or recommendation inconsistent with findings')
  }
  return finalize(verdict.findings.filter((finding) => finding.id !== 'onnx-semantic'))
}

async function health(base, fetchImpl) {
  const response = await fetchImpl(`${base}/healthz`, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`healthz failed: HTTP ${response.status}`)
  const data = await response.json()
  if (data?.model !== 'warm' || data?.backend !== BACKEND) {
    throw new Error(`healthz requires warm ${BACKEND}, got ${JSON.stringify(data)}`)
  }
  return data.backend
}

export async function runAblation(corpus, base, fetchImpl = fetch) {
  const before = await health(base, fetchImpl)
  const results = []
  for (const item of corpus) {
    const response = await fetchImpl(`${base}/api/chaperone/inspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolName: item.toolName, input: item.input }),
      signal: AbortSignal.timeout(120000),
    })
    if (!response.ok) throw new Error(`inspect ${item.id} failed: HTTP ${response.status}`)
    const data = await response.json()
    let baseline
    try {
      baseline = reconstruct(data?.verdict)
    } catch (error) {
      throw new Error(`inspect ${item.id}: ${error.message}`)
    }
    results.push({
      id: item.id, expect: item.expect, baseline,
      observed: { score: data.verdict.score, level: data.verdict.level, recommendation: data.verdict.recommendation },
      overlay: data.verdict.findings.some((finding) => finding.id === 'onnx-semantic'),
    })
  }
  const after = await health(base, fetchImpl)
  if (before !== after) throw new Error('healthz backend changed during ablation')
  return results
}

export function summarize(results, arm) {
  const counts = { tp: 0, fp: 0, tn: 0, fn: 0, exact: 0 }
  for (const row of results) {
    const positive = row.expect !== 'allow'
    const gated = row[arm].recommendation !== 'allow'
    counts[positive ? (gated ? 'tp' : 'fn') : (gated ? 'fp' : 'tn')]++
    if (row[arm].recommendation === row.expect) counts.exact++
  }
  return counts
}

function report(results, base) {
  console.log(`Paired inspect ablation: ${base}, ${results.length} author-curated cases`)
  console.log(`healthz before and after: warm ${BACKEND}`)
  console.log('Experiment uses the server configuration. The backend label does not attest the exact model path or thresholds,')
  console.log('and health checks do not prove per-call inference success.')
  console.log('Baseline: rules + hashing, reconstructed offline by removing onnx-semantic; observed: live MiniLM overlay.')
  console.log('Same fixed cases and live verdicts; not an independent ML evaluation or latency experiment.')
  console.log('Positive = expected review or deny; gate = recommendation review or deny (inspect only, no execution).')
  for (const arm of ['baseline', 'observed']) {
    const c = summarize(results, arm)
    console.log(`${arm}: TP ${c.tp} FP ${c.fp} TN ${c.tn} FN ${c.fn}; exact recommendations ${c.exact}/${results.length}`)
  }
  const overlay = results.filter((r) => r.overlay)
  const changed = results.filter((r) => r.baseline.score !== r.observed.score || r.baseline.recommendation !== r.observed.recommendation)
  const gates = results.filter((r) => (r.baseline.recommendation === 'allow') !== (r.observed.recommendation === 'allow'))
  const recommendations = results.filter((r) => r.baseline.recommendation !== r.observed.recommendation)
  const ids = (rows) => rows.map((r) => r.id).join(', ') || 'none'
  console.log(`Overlay finding IDs (${overlay.length}): ${ids(overlay)}`)
  console.log(`Changed score or recommendation IDs (${changed.length}): ${ids(changed)}`)
  console.log(`Gate changed IDs (${gates.length}): ${ids(gates)}`)
  console.log(`Recommendation changed IDs (${recommendations.length}): ${ids(recommendations)}`)
  for (const r of changed) {
    console.log(`  ${r.id} expected ${r.expect}: ${r.baseline.recommendation} (${r.baseline.score}) -> ${r.observed.recommendation} (${r.observed.score})`)
  }
}

async function main() {
  if (CORPUS.length !== 35 || new Set(CORPUS.map((item) => item.id)).size !== 35 ||
      CORPUS.some((item) => !['allow', 'review', 'deny'].includes(item.expect))) {
    throw new Error('expected 35 uniquely identified corpus cases with valid labels')
  }
  const base = (process.env.CHAPERONE_URL ?? 'http://localhost:5174').replace(/\/$/, '')
  report(await runAblation(CORPUS, base), base)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Ablation failed: ${error.message}`)
    process.exitCode = 1
  })
}
