import type {
  PendingToolCall,
  InterceptDecision,
  ReviewResolution,
} from '../src/intercept/types'
import type { ToolCall, Verdict } from '../src/lib/inspect'
import { inspectPending } from '../src/intercept/mapCall'

export type GatePendingItem = {
  call: PendingToolCall
  toolCall: ToolCall
  verdict: Verdict
  createdAt: string
  expiresAt: string
  timeoutMs: number
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
  auditLog.unshift(record)
  if (auditLog.length > 200) auditLog.pop()
}

export function requestHumanDecision(
  call: PendingToolCall,
): Promise<ReviewResolution> {
  const { toolCall, verdict } = inspectPending(call)
  const timeoutMs = reviewTimeoutMs()
  const now = Date.now()
  const item: GatePendingItem = {
    call,
    toolCall,
    verdict,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + timeoutMs).toISOString(),
    timeoutMs,
  }

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

export function resolveDecision(
  id: string,
  decision: InterceptDecision,
): boolean {
  const waiter = waiters.get(id)
  if (!waiter) return false
  clearTimeout(waiter.timer)
  waiters.delete(id)
  waiter.resolve({ decision, decidedBy: 'human' })
  return true
}

export function clearGate() {
  for (const [, w] of waiters) {
    clearTimeout(w.timer)
    w.resolve({ decision: 'deny', decidedBy: 'auto', reason: 'gate was reset' })
  }
  waiters.clear()
  auditLog.length = 0
}
