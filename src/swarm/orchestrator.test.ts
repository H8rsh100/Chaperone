import { afterEach, describe, expect, it, vi } from 'vitest'
import { inspectPending } from '../intercept/mapCall'
import { sentinel } from '../intercept/sentinel'
import type { AuditRecord, ReviewResolution } from '../intercept/types'
import { BENIGN_PAGE, POISONED_PAGE } from './fixtures'
import { runAegisSwarm, type SwarmDeps } from './orchestrator'

function depsFor(
  mode: 'poisoned' | 'benign',
  hold?: (request: { contamination: number }) => Promise<ReviewResolution>,
): SwarmDeps {
  return {
    inspect: (call) => inspectPending(call),
    onReview: async () => ({ decision: 'allow', decidedBy: 'human' }),
    executeTool: async (name, input) => {
      if (name === 'http_fetch') {
        return {
          ok: true,
          status: 200,
          body: mode === 'poisoned' ? POISONED_PAGE : BENIGN_PAGE,
        }
      }
      return { ok: true, stdout: String(input.command ?? '') }
    },
    hold: hold
      ? async (request) => hold(request)
      : undefined,
  }
}

afterEach(() => {
  sentinel.reset()
})

describe('Aegis-Swarm orchestrator', () => {
  it('isolates the executor when a canary crosses from retrieval into a shell sink', async () => {
    const state = await runAegisSwarm(
      { mode: 'poisoned' },
      depsFor('poisoned', async () => ({
        decision: 'deny',
        decidedBy: 'human',
      })),
    )

    expect(state.phase).toBe('contained')
    expect(state.isolated).toContain('executor')
    expect(state.kernel?.outcome).toBe('blocked_by_policy')
    expect(state.kernel?.score).toBeGreaterThanOrEqual(50)
    expect(state.contamination).toBeGreaterThanOrEqual(65)
    expect(state.saliency?.carry).toBeGreaterThan(0.5)
    expect(state.events.some((e) => e.kind === 'isolation')).toBe(true)
    expect(state.events.some((e) => e.kind === 'hold')).toBe(true)
  })

  it('lets a clean retrieval complete without isolation', async () => {
    const state = await runAegisSwarm(
      { mode: 'benign' },
      depsFor('benign', async () => ({ decision: 'deny', decidedBy: 'human' })),
    )

    expect(state.phase).toBe('complete')
    expect(state.isolated).toEqual([])
    expect(state.kernel?.outcome).toBe('executed')
    expect(state.contamination).toBeLessThan(65)
    expect(state.saliency?.carry).toBe(0)
  })

  it.each([
    ['policy denial', 'blocked_by_policy'],
    ['human denial', 'denied_by_human'],
    ['automatic denial', 'failed_closed'],
    ['allowlist denial', 'blocked_by_allowlist'],
    ['tool failure', 'failed'],
    ['tool exception', 'failed'],
  ])('reports a clean action with %s as failed', async (scenario, outcome) => {
    const deps = depsFor('benign')
    const inspect = deps.inspect
    deps.inspect = async (call) => {
      const inspected = await inspect(call)
      if (call.toolName !== 'shell_command') return inspected
      if (scenario === 'policy denial') {
        return { ...inspected, verdict: { ...inspected.verdict, recommendation: 'deny' } }
      }
      if (scenario === 'human denial' || scenario === 'automatic denial') {
        return { ...inspected, verdict: { ...inspected.verdict, recommendation: 'review' } }
      }
      return inspected
    }
    deps.onReview = vi.fn(async () => ({
      decision: 'deny',
      decidedBy: scenario === 'automatic denial' ? 'auto' : 'human',
    }))
    const execute = deps.executeTool
    deps.executeTool = vi.fn(async (name, input) => {
      if (name !== 'shell_command') return execute(name, input)
      if (scenario === 'allowlist denial') return { blocked: true, reason: 'not allowed' }
      if (scenario === 'tool failure') return { ok: false, error: 'command failed' }
      if (scenario === 'tool exception') throw new Error('command threw')
      return execute(name, input)
    })
    const onState = vi.fn()
    deps.onState = onState

    const state = await runAegisSwarm({ mode: 'benign' }, deps)

    expect(state.phase).toBe('failed')
    expect(state.kernel?.outcome).toBe(outcome)
    expect(state.isolated).toEqual([])
    expect(state.nodes.find((n) => n.id === 'executor')).toMatchObject({
      status: 'idle',
      lastAction: `action ${outcome}`,
    })
    expect(state.result).toContain(outcome)
    expect(state.events.some((e) => e.kind === 'error' && e.message.includes(outcome))).toBe(true)
    expect(state.events.some((e) => e.kind === 'complete')).toBe(false)
    expect(onState).toHaveBeenLastCalledWith(state)
    if (scenario.endsWith('denial') && scenario !== 'allowlist denial') {
      expect(deps.executeTool).not.toHaveBeenCalledWith('shell_command', expect.anything())
    }
  })

  it('resumes on a sanitized context when the operator confirms containment', async () => {
    const state = await runAegisSwarm(
      { mode: 'poisoned' },
      depsFor('poisoned', async () => ({
        decision: 'allow',
        decidedBy: 'human',
      })),
    )

    expect(state.phase).toBe('complete')
    expect(state.isolated).toEqual([])
    expect(state.kernel?.outcome).toBe('blocked_by_policy')
    expect(state.kernel?.findings?.some((f) => f.id === 'taint-flow')).toBe(true)
    expect(state.events.some((e) => e.kind === 'resume')).toBe(true)
    expect(state.contamination).toBeLessThan(20)
    expect(state.result).toContain('replacement context')
  })

  it.each([
    ['allowlist denial', { blocked: true, reason: 'not allowed' }, 'blocked_by_allowlist', 'deny', 'not allowed'],
    ['tool failure', { ok: false, error: 'command failed' }, 'failed', 'allow', 'command failed'],
  ])('reports sanitized resume %s without claiming completion', async (_scenario, result, outcome, decision, reason) => {
    const deps = depsFor('poisoned', async () => ({ decision: 'allow', decidedBy: 'human' }))
    const execute = deps.executeTool
    deps.executeTool = vi.fn(async (name, input) =>
      name === 'shell_command' ? result : execute(name, input),
    )
    const onAudit = vi.fn<(record: AuditRecord) => void>()
    const onState = vi.fn()
    deps.onAudit = onAudit
    deps.onState = onState

    const state = await runAegisSwarm({ mode: 'poisoned' }, deps)

    expect(state.phase).toBe('failed')
    const safeAudit = onAudit.mock.lastCall?.[0]
    expect(safeAudit).toMatchObject({ toolName: 'shell_command', decision, outcome, reason })
    expect(state.kernel).toEqual({
      toolName: 'shell_command',
      decision,
      outcome,
      score: safeAudit?.riskScore,
      reason,
      findings: safeAudit?.findings,
    })
    expect(state.events.some((e) => e.kind === 'isolation')).toBe(true)
    expect(state.events.some((e) => e.kind === 'resume')).toBe(true)
    expect(state.events.some((e) => e.kind === 'kernel' && e.message.includes(`Sanitized action ${outcome}`))).toBe(true)
    expect(state.events.some((e) => e.kind === 'error' && e.message.includes(outcome))).toBe(true)
    expect(state.events.some((e) => e.kind === 'complete')).toBe(false)
    expect(state.nodes.find((n) => n.id === 'executor')).toMatchObject({
      status: 'idle',
      lastAction: `sanitized action ${outcome}`,
    })
    expect(state.result).toContain(outcome)
    expect(onAudit).toHaveBeenLastCalledWith(expect.objectContaining({ outcome }))
    expect(onState).toHaveBeenLastCalledWith(state)
    expect(deps.executeTool).toHaveBeenCalledWith('shell_command', { command: 'echo swarm-ok' })
  })

  it('fails closed when no human hold handler is wired', async () => {
    const state = await runAegisSwarm({ mode: 'poisoned' }, depsFor('poisoned'))

    expect(state.phase).toBe('contained')
    expect(state.isolated).toContain('executor')
    expect(state.result).toContain('Fail-closed')
  })

  it('preserves planner and retriever state when the executor is isolated', async () => {
    const state = await runAegisSwarm(
      { mode: 'poisoned' },
      depsFor('poisoned', async () => ({ decision: 'deny', decidedBy: 'human' })),
    )

    expect(state.nodes.find((n) => n.id === 'planner')?.status).toBe('done')
    expect(state.nodes.find((n) => n.id === 'retriever')?.status).toBe('done')
    expect(state.nodes.find((n) => n.id === 'executor')?.status).toBe('quarantined')
    expect(state.contexts.length).toBeGreaterThanOrEqual(3)
  })
})
