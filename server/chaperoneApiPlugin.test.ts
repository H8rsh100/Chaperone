import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chaperoneApiPlugin } from './chaperoneApiPlugin'
import { clearGate, listPending, type GatePendingItem } from './gateStore'
import { resetLedger } from './audit/ledger'
import { resetAnchors } from './audit/anchor'
import { swarmSnapshot } from './swarm/runtime'
import { sentinel } from '../src/intercept/sentinel'

vi.mock('./gateStore', () => ({
  clearGate: vi.fn(),
  listPending: vi.fn(),
  pushAudit: vi.fn(),
  readAuditLog: vi.fn(),
  requestHumanDecision: vi.fn(),
  resolveDecision: vi.fn(),
}))
vi.mock('./audit/ledger', () => ({
  ledgerPath: vi.fn(),
  resetLedger: vi.fn(),
  verifyChain: vi.fn(),
}))
vi.mock('./audit/anchor', () => ({
  anchorLedger: vi.fn(),
  anchorsPath: vi.fn(),
  readAnchors: vi.fn(),
  resetAnchors: vi.fn(),
  verifyAnchors: vi.fn(),
}))
vi.mock('./swarm/runtime', () => ({
  resetSwarm: vi.fn(),
  startSwarm: vi.fn(),
  swarmSnapshot: vi.fn(),
}))
vi.mock('./scoring', () => ({
  inspectCallAsync: vi.fn(),
  semanticStatus: vi.fn(),
  warmup: vi.fn(),
}))
vi.mock('../src/intercept/sentinel', () => ({ sentinel: { reset: vi.fn() } }))

describe('chaperone reset idle guard', () => {
  let middleware: (req: IncomingMessage, res: ServerResponse, next: () => void) => unknown

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listPending).mockReturnValue([])
    vi.mocked(swarmSnapshot).mockReturnValue({ state: null, running: false })
    const server = {
      middlewares: {
        use: (handler: typeof middleware) => { middleware = handler },
      },
    } as unknown as ViteDevServer
    const configureServer = chaperoneApiPlugin().configureServer
    if (typeof configureServer !== 'function') throw new Error('Expected configureServer hook')
    configureServer(server)
  })

  function reset(url: string) {
    const req = { method: 'POST', url } as IncomingMessage
    const res = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() } as unknown as ServerResponse
    void middleware(req, res, vi.fn())
    return res
  }

  function expectNoReset() {
    expect(clearGate).not.toHaveBeenCalled()
    expect(resetLedger).not.toHaveBeenCalled()
    expect(resetAnchors).not.toHaveBeenCalled()
    expect(sentinel.reset).not.toHaveBeenCalled()
  }

  function expectReset() {
    expect(clearGate).toHaveBeenCalledOnce()
    expect(resetLedger).toHaveBeenCalledOnce()
    expect(resetAnchors).toHaveBeenCalledOnce()
    expect(sentinel.reset).toHaveBeenCalledOnce()
  }

  it('refuses to reset when a review is pending', () => {
    vi.mocked(listPending).mockReturnValue([{} as GatePendingItem])
    const res = reset('/api/chaperone/reset?onlyIfIdle=1')
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(vi.mocked(res.end).mock.calls[0][0] as string).error).toMatch(/pending/i)
    expectNoReset()
  })

  it('refuses to reset while a swarm is running without pending reviews', () => {
    vi.mocked(swarmSnapshot).mockReturnValue({ state: null, running: true })
    const res = reset('/api/chaperone/reset?onlyIfIdle=1')
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(vi.mocked(res.end).mock.calls[0][0] as string).error).toMatch(/swarm/i)
    expectNoReset()
  })

  it('resets synchronously when idle', () => {
    const res = reset('/api/chaperone/reset?other=1&onlyIfIdle=1')
    expect(res.statusCode).toBe(200)
    expect(vi.mocked(res.end)).toHaveBeenCalledWith(JSON.stringify({ ok: true }))
    expect(listPending).toHaveBeenCalledOnce()
    expect(swarmSnapshot).toHaveBeenCalledOnce()
    expectReset()
  })

  it.each(['/api/chaperone/reset', '/api/chaperone/reset?onlyIfIdle=0'])(
    'preserves unguarded reset for %s', (url) => {
      vi.mocked(listPending).mockReturnValue([{} as GatePendingItem])
      vi.mocked(swarmSnapshot).mockReturnValue({ state: null, running: true })
      const res = reset(url)
      expect(res.statusCode).toBe(200)
      expect(listPending).not.toHaveBeenCalled()
      expect(swarmSnapshot).not.toHaveBeenCalled()
      expectReset()
    },
  )
})
