import type {
  PendingToolCall,
  InterceptDecision,
  ReviewResolution,
} from '../src/intercept/types'
import type { ToolCall, Verdict } from '../src/lib/inspect'
import { inspectPending } from '../src/intercept/mapCall'
import { appendAudit } from './audit/ledger'
import { inspectCallAsync } from './scoring'
import {
  callHashOf,
  consumeToken,
  mintDecisionToken,
  operator,
  verifyDecisionToken,
} from './approval/token'

export type GatePendingItem = {
  call: PendingToolCall
  toolCall: ToolCall
  verdict: Verdict
  createdAt: string
  expiresAt: string
  timeoutMs: number
  /** Content hash the decision token is bound to. */
  callHash: string
  /** Signed, single-use, call-bound token the operator must present to decide. */
  decisionToken: string
}

type Waiter = {
  item: GatePendingItem
  resolve: (resolution: ReviewResolution) => void
  timer: ReturnType<typeof setTimeout>
}

const waiters = new Map<string, Waiter>()
const auditLog: Array<Record<string, unknown>> = []

const DEFAULT_REVIEW_TIMEOUT_MS = 30_000

/**
 * Fail-closed window. If a human does not respond before this elapses the call
 * is auto-denied. Overridable for demos/tests via CHAPERONE_REVIEW_TIMEOUT_MS.
 */
export function reviewTimeoutMs(): number {
  const raw = Number(process.env.CHAPERONE_REVIEW_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_REVIEW_TIMEOUT_MS
}

export function listPending(): GatePendingItem[] {
  return [...waiters.values()].map((w) => w.item)
}

export function getAuditLog() {
  return [...auditLog]
}

export function pushAudit(record: Record<string, unknown>) {
  // Durable, tamper-evident trail first — the in-memory window is just a cache
  // for the UI. If the ledger write throws we still surface the record.
  try {
    appendAudit({ kind: 'decision', payload: record })
  } catch {
    // Never let an audit-write failure take down the gate.
  }
  auditLog.unshift(record)
  if (auditLog.length > 200) auditLog.pop()
}

/** Approval tokens are required by default; set to "false" to disable (never in prod). */
function approvalTokenRequired(): boolean {
  return process.env.CHAPERONE_REQUIRE_APPROVAL_TOKEN !== 'false'
}

export function requestHumanDecision(
  call: PendingToolCall,
): Promise<ReviewResolution> {
  const { toolCall, verdict } = inspectPending(call)
  const timeoutMs = reviewTimeoutMs()
  const now = Date.now()
  const callHash = callHashOf(call)
  const { token } = mintDecisionToken({ callId: call.id, callHash, sub: operator() }, timeoutMs)
  const item: GatePendingItem = {
    call,
    toolCall,
    verdict,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + timeoutMs).toISOString(),
    timeoutMs,
    callHash,
    decisionToken: token,
  }

  // Upgrade to the embedding second opinion once the model is warm. Never
  // blocks the gate: the sync verdict is shown immediately and swapped in place.
  void inspectCallAsync(toolCall)
    .then((augmented) => {
      item.verdict = augmented
    })
    .catch(() => {})

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiters.delete(call.id)
      resolve({
        decision: 'deny',
        decidedBy: 'auto',
        reason: `fail-closed after ${Math.round(timeoutMs / 1000)}s with no human response`,
      })
    }, timeoutMs)
    // Do not hold the process open on account of a pending review timer.
    timer.unref?.()
    waiters.set(call.id, { item, resolve, timer })
  })
}

export type ResolveResult =
  | { ok: true }
  | { ok: false; status: number; reason: string }

/**
 * Resolve a held call. The caller must present the signed, call-bound, single-use
 * token minted for this exact pending item, or the approval is rejected.
 */
export function resolveDecision(
  id: string,
  decision: InterceptDecision,
  token?: string,
): ResolveResult {
  const waiter = waiters.get(id)
  if (!waiter) return { ok: false, status: 404, reason: 'no pending call with that id' }

  if (approvalTokenRequired()) {
    if (!token) return { ok: false, status: 401, reason: 'missing approval token' }
    const verified = verifyDecisionToken(token, {
      callHash: waiter.item.callHash,
      sub: operator(),
    })
    if (!verified.ok) return { ok: false, status: 403, reason: verified.reason }
    if (!consumeToken(verified.body.jti, verified.body.exp)) {
      return { ok: false, status: 409, reason: 'approval token already used' }
    }
  }

  clearTimeout(waiter.timer)
  waiters.delete(id)
  waiter.resolve({ decision, decidedBy: 'human' })
  return { ok: true }
}

export function clearGate() {
  for (const [, w] of waiters) {
    clearTimeout(w.timer)
    w.resolve({ decision: 'deny', decidedBy: 'auto', reason: 'gate was reset' })
  }
  waiters.clear()
  auditLog.length = 0
}
