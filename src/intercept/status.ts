import type { Outcome } from './types'

export type GateStatus =
  | 'pending'
  | 'approved'
  | 'denied'
  | 'blocked'
  | 'expired'
  | 'failed'

export interface StatusInput {
  outcome?: Outcome
  decision?: 'allow' | 'deny' | 'review' | 'approved' | 'denied'
  decidedBy?: 'auto' | 'human'
  reason?: string
}

/**
 * Derives the operator-facing status from the engine's authoritative `outcome`
 * first. The legacy `decision`/`decidedBy` heuristic is only used for offline
 * (no-server) entries that never pass through the engine.
 */
export function statusOf(e: StatusInput): GateStatus {
  switch (e.outcome) {
    case 'executed':
      return 'approved'
    case 'blocked_by_policy':
    case 'blocked_by_allowlist':
      return 'blocked'
    case 'failed_closed':
      return 'expired'
    case 'denied_by_human':
      return 'denied'
    case 'failed':
      return 'failed'
  }

  const denied = e.decision === 'deny' || e.decision === 'denied'
  if (!denied) return 'approved'
  if (e.decidedBy === 'human') return 'denied'
  if (e.reason?.includes('fail-closed')) return 'expired'
  return 'blocked'
}

export function stampOf(status: GateStatus): {
  label: string
  tone: 'allow' | 'deny' | 'review'
} {
  switch (status) {
    case 'approved':
      return { label: 'APPROVED', tone: 'allow' }
    case 'denied':
      return { label: 'DENIED', tone: 'deny' }
    case 'expired':
      return { label: 'AUTO-DENIED', tone: 'review' }
    case 'failed':
      return { label: 'FAILED', tone: 'deny' }
    case 'blocked':
      return { label: 'BLOCKED', tone: 'deny' }
    default:
      return { label: 'PENDING', tone: 'review' }
  }
}
