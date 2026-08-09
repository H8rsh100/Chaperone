import type { PendingToolCall, InterceptDecision } from '../src/intercept/types'
import type { ToolCall, Verdict } from '../src/lib/inspect'
import { inspectPending } from '../src/intercept/mapCall'

export type GatePendingItem = {
  call: PendingToolCall
  toolCall: ToolCall
  verdict: Verdict
  createdAt: string
}

type Waiter = {
  item: GatePendingItem
  resolve: (decision: InterceptDecision) => void
}

const waiters = new Map<string, Waiter>()
const auditLog: Array<Record<string, unknown>> = []

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
): Promise<InterceptDecision> {
  const { toolCall, verdict } = inspectPending(call)
  const item: GatePendingItem = {
    call,
    toolCall,
    verdict,
    createdAt: new Date().toISOString(),
  }

  return new Promise((resolve) => {
    waiters.set(call.id, { item, resolve })
  })
}

export function resolveDecision(
  id: string,
  decision: InterceptDecision,
): boolean {
  const waiter = waiters.get(id)
  if (!waiter) return false
  waiters.delete(id)
  waiter.resolve(decision)
  return true
}

export function clearGate() {
  for (const [, w] of waiters) {
    w.resolve('deny')
  }
  waiters.clear()
  auditLog.length = 0
}
