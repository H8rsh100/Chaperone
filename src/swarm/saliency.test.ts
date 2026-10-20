import { describe, expect, it } from 'vitest'
import { analyzeSaliency, withCarry } from './saliency'
import { BENIGN_PAGE, POISONED_PAGE, SWARM_TASK } from './fixtures'

async function analyze(page: string) {
  return analyzeSaliency({ trusted: SWARM_TASK, untrusted: page, bleed: 1, carry: 0 })
}

describe('neural context saliency', () => {
  it('separates a poisoned page from a benign status page', async () => {
    const poisoned = await analyze(POISONED_PAGE)
    const benign = await analyze(BENIGN_PAGE)

    expect(poisoned.contamination).toBeGreaterThan(benign.contamination + 20)
    expect(poisoned.contamination).toBeGreaterThanOrEqual(70)
    expect(benign.contamination).toBeLessThanOrEqual(55)
  })

  it('attributes saliency to the injected directive, not the benign boilerplate', async () => {
    const poisoned = await analyze(POISONED_PAGE)
    const top = poisoned.spans[0]?.text.toLowerCase() ?? ''
    expect(top).toMatch(/directive|execute|maintenance/)
    expect(poisoned.tokens.length).toBeGreaterThan(0)
    expect(poisoned.tokens[0].saliency).toBe(1)
    const topTokens = poisoned.tokens.slice(0, 5).map((t) => t.token.toLowerCase())
    expect(topTokens.some((t) => t === 'zq7xk2m9' || t === 'execute')).toBe(true)
  })

  it('raises the metric when the action carries the taint', async () => {
    const context = await analyze(POISONED_PAGE)
    const action = withCarry(context, 0.85)
    expect(action.contamination).toBeGreaterThan(context.contamination)
    expect(action.carry).toBe(0.85)
  })

  it('reports the hashing backend when no transformer is injected', async () => {
    const result = await analyze(POISONED_PAGE)
    expect(result.backend).toBe('hashing-512')
  })

  it('is deterministic for the same input', async () => {
    const a = await analyze(POISONED_PAGE)
    const b = await analyze(POISONED_PAGE)
    expect(a).toEqual(b)
  })
})
