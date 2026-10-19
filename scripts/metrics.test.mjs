import { describe, expect, it } from 'vitest'
import {
  brier,
  confusion,
  percentile,
  recallAtFpr,
  rocAuc,
  wilson,
} from './metrics.mjs'

describe('confusion', () => {
  it('splits predictions at the threshold', () => {
    const c = confusion([0.9, 0.8, 0.2, 0.1], [1, 0, 1, 0], 0.5)
    expect(c).toEqual({ tp: 1, fp: 1, tn: 1, fn: 1 })
  })
})

describe('recallAtFpr', () => {
  it('finds perfect separation at zero false positives', () => {
    const result = recallAtFpr([0.9, 0.8, 0.2, 0.1], [1, 1, 0, 0], 0.01)
    expect(result.recall).toBe(1)
    expect(result.fpr).toBe(0)
  })

  it('trades recall for the false-positive budget', () => {
    // One positive scores below a negative: no threshold separates cleanly.
    const scores = [0.9, 0.4, 0.6, 0.1]
    const labels = [1, 1, 0, 0]
    const zero = recallAtFpr(scores, labels, 0)
    expect(zero.recall).toBeLessThan(1)
  })
})

describe('rocAuc', () => {
  it('is 1 for perfect separation and 0.5 for a coin flip', () => {
    expect(rocAuc([0.9, 0.8, 0.2, 0.1], [1, 1, 0, 0])).toBe(1)
    expect(rocAuc([0.5, 0.5, 0.5, 0.5], [1, 0, 1, 0])).toBe(0.5)
  })
})

describe('wilson', () => {
  it('brackets the point estimate and stays within [0,1]', () => {
    const { point, low, high } = wilson(9, 10)
    expect(point).toBeCloseTo(0.9, 5)
    expect(low).toBeLessThan(point)
    expect(high).toBeGreaterThan(point)
    expect(low).toBeGreaterThanOrEqual(0)
    expect(high).toBeLessThanOrEqual(1)
  })

  it('widens as the sample shrinks', () => {
    const wide = wilson(9, 10)
    const narrow = wilson(900, 1000)
    expect(wide.high - wide.low).toBeGreaterThan(narrow.high - narrow.low)
  })
})

describe('percentile', () => {
  it('returns the p95 of a sorted latency list', () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1)
    expect(percentile(sorted, 50)).toBe(50)
    expect(percentile(sorted, 95)).toBe(95)
    expect(percentile(sorted, 100)).toBe(100)
  })
})

describe('brier', () => {
  it('is zero for perfect probabilities and positive otherwise', () => {
    expect(brier([1, 0, 1, 0], [1, 0, 1, 0])).toBe(0)
    expect(brier([0.5, 0.5], [1, 0])).toBeCloseTo(0.25, 5)
  })
})
