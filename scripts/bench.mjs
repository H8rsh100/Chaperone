/**
 * Benchmark harness. Scores the whole corpus through the live `/inspect` API
 * (no execution) and reports routing quality with confidence intervals and
 * threshold-free metrics.
 *
 * Start the dev server first, then: `npm run bench`
 */
import { writeFileSync } from 'node:fs'
import { CORPUS } from './corpus.mjs'
import {
  brier,
  confusion,
  falsePositiveRate,
  percentile,
  recall,
  recallAtFpr,
  rocAuc,
  wilson,
} from './metrics.mjs'

const BASE = process.env.CHAPERONE_URL ?? 'http://127.0.0.1:5174'
/** The engine routes to review/deny at score >= 25, so this is its operating point. */
const TAU = 0.25

const pct = (x) => `${(x * 100).toFixed(1)}%`

async function scoreOne(c) {
  const start = performance.now()
  const res = await fetch(`${BASE}/api/chaperone/inspect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toolName: c.toolName, input: c.input }),
  })
  const latency = performance.now() - start
  if (!res.ok) throw new Error(`inspect ${c.id} failed: ${res.status}`)
  const data = await res.json()
  return { latency, score: (data.verdict?.score ?? 0) / 100, recommendation: data.verdict?.recommendation ?? 'allow' }
}

async function main() {
  try {
    const probe = await fetch(`${BASE}/api/chaperone/pending`)
    if (!probe.ok) throw new Error(String(probe.status))
  } catch {
    console.error(`Chaperone API not reachable at ${BASE}. Start it first:`)
    console.error('  npm run dev -- --host 127.0.0.1 --port 5174 --strictPort')
    process.exit(1)
  }

  const results = []
  for (const c of CORPUS) results.push({ ...c, ...(await scoreOne(c)) })

  const scores = results.map((r) => r.score)
  const labels = results.map((r) => (r.expect === 'allow' ? 0 : 1))
  const c = confusion(scores, labels, TAU)
  const positives = labels.reduce((s, y) => s + y, 0)
  const ci = wilson(c.tp, positives)
  const auc = rocAuc(scores, labels)
  const at1 = recallAtFpr(scores, labels, 0.01)
  const at5 = recallAtFpr(scores, labels, 0.05)
  const latencies = results.map((r) => r.latency).sort((a, b) => a - b)

  const mismatches = results.filter((r) => r.recommendation !== r.expect)
  const byCategory = {}
  for (const r of results) {
    const g = (byCategory[r.category] ??= { total: 0, correct: 0 })
    g.total++
    if (r.recommendation === r.expect) g.correct++
  }

  console.log('\n=== Chaperone benchmark ===')
  console.log(`cases: ${results.length} (positives ${positives}, negatives ${results.length - positives})`)
  console.log(`operating point: score >= ${TAU * 100} (engine gate)`)

  console.log('\n-- routing confusion --')
  console.log(`TP ${c.tp}  FP ${c.fp}  TN ${c.tn}  FN ${c.fn}`)
  console.log(`recall    ${pct(recall(c))}  (Wilson 95%: ${pct(ci.low)}-${pct(ci.high)})`)
  console.log(`precision ${pct(c.tp / (c.tp + c.fp || 1))}`)
  console.log(`FPR       ${pct(falsePositiveRate(c))}`)

  console.log('\n-- threshold-free --')
  console.log(`ROC-AUC         ${auc.toFixed(3)}`)
  console.log(`recall@FPR<=1%  ${pct(at1.recall)} (tau ${at1.tau})`)
  console.log(`recall@FPR<=5%  ${pct(at5.recall)} (tau ${at5.tau})`)
  console.log(`Brier           ${brier(scores, labels).toFixed(3)}`)

  console.log('\n-- latency (round-trip ms) --')
  console.log(`p50 ${percentile(latencies, 50).toFixed(2)}  p95 ${percentile(latencies, 95).toFixed(2)}  max ${latencies[latencies.length - 1].toFixed(2)}`)

  console.log('\n-- per category --')
  for (const [cat, g] of Object.entries(byCategory)) console.log(`${cat.padEnd(14)} ${g.correct}/${g.total}`)

  if (mismatches.length) {
    console.log('\n-- mismatches (engine vs policy) --')
    for (const m of mismatches) {
      console.log(`${m.id} [${m.category}] expected ${m.expect}, got ${m.recommendation} (score ${Math.round(m.score * 100)})`)
    }
  } else {
    console.log('\n-- no mismatches --')
  }

  const report = {
    base: BASE,
    tau: TAU,
    generatedAt: new Date().toISOString(),
    metrics: {
      confusion: c,
      recall: recall(c),
      recallCi: ci,
      precision: c.tp / (c.tp + c.fp || 1),
      fpr: falsePositiveRate(c),
      rocAuc: auc,
      recallAtFpr1: at1,
      recallAtFpr5: at5,
      brier: brier(scores, labels),
      latency: {
        p50: percentile(latencies, 50),
        p95: percentile(latencies, 95),
        max: latencies[latencies.length - 1],
      },
    },
    byCategory,
    mismatches: mismatches.map((m) => ({
      id: m.id,
      category: m.category,
      expected: m.expect,
      got: m.recommendation,
      score: m.score,
    })),
    results,
  }
  writeFileSync('docs/bench-output.json', JSON.stringify(report, null, 2) + '\n')
  console.log('\nwrote docs/bench-output.json')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
