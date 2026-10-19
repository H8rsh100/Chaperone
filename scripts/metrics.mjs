/**
 * Pure evaluation math. No dependencies, no I/O — so it can be unit-tested and
 * reused by `bench.mjs`, a future dashboard, or teammate A's dataset runners.
 *
 * A "score" is a continuous risk signal in [0,1]; a "label" is 1 for a call that
 * should be gated (review or deny) and 0 for one that should be allowed.
 */

export function confusion(scores, labels, tau) {
  let tp = 0
  let fp = 0
  let tn = 0
  let fn = 0
  for (let i = 0; i < scores.length; i++) {
    const predicted = scores[i] >= tau
    if (predicted && labels[i]) tp++
    else if (predicted && !labels[i]) fp++
    else if (!predicted && labels[i]) fn++
    else tn++
  }
  return { tp, fp, tn, fn }
}

export const recall = (c) => c.tp / (c.tp + c.fn || 1)
export const falsePositiveRate = (c) => c.fp / (c.fp + c.tn || 1)
export const precision = (c) => c.tp / (c.tp + c.fp || 1)

/** Highest recall achievable at or below a false-positive budget. */
export function recallAtFpr(scores, labels, budget) {
  let best = { recall: 0, tau: 1, fpr: 0 }
  for (let i = 0; i <= 100; i++) {
    const tau = i / 100
    const c = confusion(scores, labels, tau)
    const f = falsePositiveRate(c)
    const r = recall(c)
    if (f <= budget && r >= best.recall) best = { recall: r, tau, fpr: f }
  }
  return best
}

/** Rank-based AUC (Mann–Whitney U), robust to score scale. */
export function rocAuc(scores, labels) {
  const pos = []
  const neg = []
  for (let i = 0; i < scores.length; i++) (labels[i] ? pos : neg).push(scores[i])
  if (!pos.length || !neg.length) return 0.5
  let wins = 0
  for (const p of pos) {
    for (const n of neg) {
      if (p > n) wins++
      else if (p === n) wins += 0.5
    }
  }
  return wins / (pos.length * neg.length)
}

/** Wilson score interval — the honest way to report a rate on a small N. */
export function wilson(successes, total, z = 1.96) {
  if (total === 0) return { point: 0, low: 0, high: 0 }
  const p = successes / total
  const denom = 1 + (z * z) / total
  const center = (p + (z * z) / (2 * total)) / denom
  const margin = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / denom
  return { point: p, low: Math.max(0, center - margin), high: Math.min(1, center + margin) }
}

export function percentile(ascending, p) {
  if (!ascending.length) return 0
  const idx = Math.min(
    ascending.length - 1,
    Math.max(0, Math.ceil((p / 100) * ascending.length) - 1),
  )
  return ascending[idx]
}

export function brier(scores, labels) {
  if (!scores.length) return 0
  let sum = 0
  for (let i = 0; i < scores.length; i++) {
    const d = scores[i] - labels[i]
    sum += d * d
  }
  return sum / scores.length
}
