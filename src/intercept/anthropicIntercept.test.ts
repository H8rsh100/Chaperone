import { describe, expect, it } from 'vitest'
import { runWithChaperone, type ExecuteTool } from './anthropicIntercept'
import type { AuditRecord, ReviewResolution, RunWithChaperoneOptions } from './types'

type Scenario = NonNullable<RunWithChaperoneOptions['demoScenario']>

const okExecutor: ExecuteTool = async () => ({ ok: true, stdout: 'fine' })

async function run(
  scenario: Scenario,
  executeTool: ExecuteTool = okExecutor,
  onReview: () => Promise<ReviewResolution> = async () => ({
    decision: 'allow',
    decidedBy: 'human',
  }),
) {
  const audits: AuditRecord[] = []
  await runWithChaperone([{ role: 'user', content: 'go' }], {
    demoScenario: scenario,
    tools: [],
    onReview,
    onAudit: (record) => audits.push(record),
    executeTool,
  })
  return audits
}

/**
 * Invariant: every adjudicated call carries exactly one authoritative outcome,
 * and the decision always agrees with it. This is what keeps the UI, the audit
 * log, and the engine from ever disagreeing again.
 */
function assertInvariant(audits: AuditRecord[]) {
  expect(audits.length).toBeGreaterThan(0)
  for (const a of audits) {
    expect(a.outcome).toBeDefined()
    if (a.outcome === 'executed') {
      expect(a.decision).toBe('allow')
    } else if (a.outcome === 'failed') {
      expect(a.decision).toBe('allow')
    } else {
      expect(a.decision).toBe('deny')
      expect(a.finalDecision).toBe('deny')
    }
  }
}

describe('runWithChaperone outcomes', () => {
  it('records a policy deny as blocked_by_policy and never executes', async () => {
    let executed = false
    const audits = await run('destructive', async () => {
      executed = true
      return { ok: true }
    })
    assertInvariant(audits)
    expect(audits[0].outcome).toBe('blocked_by_policy')
    expect(executed).toBe(false)
  })

  it('records an allowed, successful call as executed', async () => {
    const audits = await run('benign-http')
    assertInvariant(audits)
    expect(audits[0].outcome).toBe('executed')
  })

  it('records a human denial as denied_by_human', async () => {
    const audits = await run('borderline', okExecutor, async () => ({
      decision: 'deny',
      decidedBy: 'human',
    }))
    assertInvariant(audits)
    expect(audits[0].outcome).toBe('denied_by_human')
  })

  it('records a fail-closed auto-deny as failed_closed', async () => {
    const audits = await run('borderline', okExecutor, async () => ({
      decision: 'deny',
      decidedBy: 'auto',
      reason: 'fail-closed after 3s with no human response',
    }))
    assertInvariant(audits)
    expect(audits[0].outcome).toBe('failed_closed')
  })

  it('the Encoded bug: scorer allows, allowlist blocks, outcome is blocked_by_allowlist', async () => {
    const audits = await run('encoded', async () => ({
      ok: false,
      blocked: true,
      reason: 'Blocked by Chaperone allowlist: shell metacharacters.',
    }))
    assertInvariant(audits)
    expect(audits[0].outcome).toBe('blocked_by_allowlist')
    expect(audits[0].finalDecision).toBe('deny')
  })

  it('records a thrown executor error as failed', async () => {
    const audits = await run('benign-http', async () => {
      throw new Error('network down')
    })
    assertInvariant(audits)
    expect(audits[0].outcome).toBe('failed')
    expect(audits[0].reason).toContain('network down')
  })

  it('holds the invariant across every scenario', async () => {
    for (const scenario of [
      'destructive',
      'benign-http',
      'borderline',
      'adversarial',
      'encoded',
    ] as Scenario[]) {
      const audits = await run(scenario)
      assertInvariant(audits)
      expect(audits[0].outcome).toBeDefined()
    }
  })
})
