import { afterEach, describe, expect, it } from 'vitest'
import { inspectPending } from '../intercept/mapCall'
import { sentinel } from '../intercept/sentinel'
import type { ReviewResolution } from '../intercept/types'
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
    expect(state.events.some((e) => e.kind === 'resume')).toBe(true)
    expect(state.contamination).toBeLessThan(20)
    expect(state.result).toContain('sanitized')
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
    expect(state.nodes.find((n) => n.id === 'retriever')?.status).toBe('active')
    expect(state.nodes.find((n) => n.id === 'executor')?.status).toBe('quarantined')
    expect(state.contexts.length).toBeGreaterThanOrEqual(3)
  })
})
