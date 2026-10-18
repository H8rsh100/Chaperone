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

  it('resolves with a human decision before the timeout fires', async () => {
    process.env.CHAPERONE_REVIEW_TIMEOUT_MS = '5000'
    const promise = requestHumanDecision(pending('t2'))
    expect(resolveDecision('t2', 'allow')).toBe(true)
    const res = await promise
    expect(res.decision).toBe('allow')
    expect(res.decidedBy).toBe('human')
  })

  it('exposes an expiry timestamp so the UI can count down', () => {
    process.env.CHAPERONE_REVIEW_TIMEOUT_MS = '5000'
    void requestHumanDecision(pending('t3'))
    const item = listPending().find((i) => i.call.id === 't3')
    expect(item?.expiresAt).toBeTruthy()
    expect(new Date(item!.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })
})
