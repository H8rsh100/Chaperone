import { describe, expect, it } from 'vitest'
import {
  callHashOf,
  consumeToken,
  mintDecisionToken,
  verifyDecisionToken,
} from './token'

const call = { id: 'c1', toolName: 'shell_command', input: { command: 'npm test' } }
const claims = { callId: call.id, callHash: callHashOf(call), sub: 'operator' }

describe('call-bound decision tokens', () => {
  it('verifies a freshly minted token for the right call', () => {
    const { token } = mintDecisionToken(claims)
    const result = verifyDecisionToken(token, { callHash: claims.callHash, sub: 'operator' })
    expect(result.ok).toBe(true)
  })

  it('rejects a token presented for a different call', () => {
    const { token } = mintDecisionToken(claims)
    const result = verifyDecisionToken(token, { callHash: callHashOf({ ...call, id: 'other' }) })
    expect(result.ok).toBe(false)
  })

  it('rejects a tampered signature', () => {
    const { token } = mintDecisionToken(claims)
    const [payload] = token.split('.')
    const result = verifyDecisionToken(`${payload}.AAAA`, { callHash: claims.callHash })
    expect(result.ok).toBe(false)
  })

  it('rejects an expired token', () => {
    const { token } = mintDecisionToken(claims, -1000)
    const result = verifyDecisionToken(token, { callHash: claims.callHash })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/expired/)
  })

  it('treats a token id as single-use', () => {
    const { jti } = mintDecisionToken(claims)
    const exp = Date.now() + 60_000
    expect(consumeToken(jti, exp)).toBe(true)
    expect(consumeToken(jti, exp)).toBe(false)
  })
})
