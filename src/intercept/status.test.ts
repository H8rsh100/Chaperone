import { describe, expect, it } from 'vitest'
import { statusOf, stampOf, type GateStatus } from './status'
import type { Outcome } from './types'

const OUTCOME_TO_STATUS: Array<[Outcome, GateStatus]> = [
  ['executed', 'approved'],
  ['blocked_by_policy', 'blocked'],
  ['blocked_by_allowlist', 'blocked'],
  ['failed_closed', 'expired'],
  ['denied_by_human', 'denied'],
  ['failed', 'failed'],
]

describe('statusOf', () => {
  it.each(OUTCOME_TO_STATUS)('maps outcome %s to %s', (outcome, expected) => {
    expect(statusOf({ outcome })).toBe(expected)
  })

  it('falls back to the legacy heuristic for offline entries', () => {
    expect(statusOf({ decision: 'approved' })).toBe('approved')
    expect(statusOf({ decision: 'denied', decidedBy: 'human' })).toBe('denied')
    expect(statusOf({ decision: 'denied', decidedBy: 'auto', reason: 'fail-closed after 3s' })).toBe(
      'expired',
    )
    expect(statusOf({ decision: 'denied', decidedBy: 'auto' })).toBe('blocked')
  })

  it('prefers outcome over a contradictory legacy decision', () => {
    // The Encoded bug: the scorer allowed it, but the allowlist refused it.
    // The record must never render as "approved".
    expect(statusOf({ decision: 'allow', outcome: 'blocked_by_allowlist' })).toBe('blocked')
  })
})

describe('stampOf', () => {
  it('gives every status a distinct, non-empty stamp', () => {
    const statuses: GateStatus[] = ['approved', 'denied', 'blocked', 'expired', 'failed']
    const labels = statuses.map((s) => stampOf(s).label)
    expect(labels.every((l) => l.length > 0)).toBe(true)
    expect(new Set(labels).size).toBe(statuses.length)
  })
})
