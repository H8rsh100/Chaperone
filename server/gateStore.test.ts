import { afterEach, describe, expect, it } from 'vitest'
import {
  listPending,
  requestHumanDecision,
  resolveDecision,
  clearGate,
} from './gateStore'
import type { PendingToolCall } from '../src/intercept/types'

function pending(id: string): PendingToolCall {
  return {
    id,
    toolName: 'shell_command',
    input: { command: 'cat .env' },
    rawBlock: {},
  }
}

afterEach(() => {
  clearGate()
  delete process.env.CHAPERONE_REVIEW_TIMEOUT_MS
})

describe('fail-closed review gate', () => {
  it('auto-denies when no human responds within the window', async () => {
    process.env.CHAPERONE_REVIEW_TIMEOUT_MS = '40'
    const res = await requestHumanDecision(pending('t1'))
    expect(res.decision).toBe('deny')
    expect(res.decidedBy).toBe('auto')
    expect(res.reason).toContain('fail-closed')
  })

  it('resolves with a human decision when the call-bound token is presented', async () => {
    process.env.CHAPERONE_REVIEW_TIMEOUT_MS = '5000'
    const promise = requestHumanDecision(pending('t2'))
    const item = listPending().find((i) => i.call.id === 't2')!
    expect(resolveDecision('t2', 'allow', item.decisionToken)).toEqual({ ok: true })
    const res = await promise
    expect(res.decision).toBe('allow')
    expect(res.decidedBy).toBe('human')
  })

  it('rejects a decision with no token', () => {
    process.env.CHAPERONE_REVIEW_TIMEOUT_MS = '5000'
    void requestHumanDecision(pending('t4'))
    const result = resolveDecision('t4', 'allow')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(401)
  })

  it("rejects a token minted for a different call", () => {
    process.env.CHAPERONE_REVIEW_TIMEOUT_MS = '5000'
    void requestHumanDecision(pending('t5'))
    void requestHumanDecision(pending('t6'))
    const other = listPending().find((i) => i.call.id === 't6')!
    const result = resolveDecision('t5', 'allow', other.decisionToken)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(403)
  })

  it('exposes an expiry timestamp so the UI can count down', () => {
    process.env.CHAPERONE_REVIEW_TIMEOUT_MS = '5000'
    void requestHumanDecision(pending('t3'))
    const item = listPending().find((i) => i.call.id === 't3')
    expect(item?.expiresAt).toBeTruthy()
    expect(new Date(item!.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })
})
