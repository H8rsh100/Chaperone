import { describe, expect, it, vi } from 'vitest'
import { finalizeVerdict } from '../src/lib/inspect'
import { reconstruct, runAblation, summarize } from './onnx-ablation.mjs'

const finding = (id, weight) => ({ id, weight, title: id, detail: 'test' })
const warm = { model: 'warm', backend: 'onnx-all-MiniLM-L6-v2' }
const response = (data, status = 200) => ({ ok: status === 200, status, json: async () => data })

describe('reconstruct', () => {
  it.each([0, 24, 25, 49, 50, 74, 75, 99, 100, 130])(
    'matches finalizeVerdict at weight %i', (weight) => {
      const base = [finding('destructive', weight)]
      const live = finalizeVerdict([...base, finding('onnx-semantic', 32)])
      const expected = finalizeVerdict(base)
      expect(reconstruct(live)).toEqual({
        score: expected.score, level: expected.level, recommendation: expected.recommendation,
      })
    },
  )

  it('handles no findings, no overlay, multiple findings and capped live scores', () => {
    expect(reconstruct(finalizeVerdict([]))).toEqual({ score: 0, level: 'low', recommendation: 'allow' })
    const base = [finding('destructive', 50), finding('secret-exfil', 34)]
    expect(reconstruct(finalizeVerdict(base))).toEqual({ score: 84, level: 'critical', recommendation: 'deny' })
    expect(reconstruct(finalizeVerdict([...base, finding('onnx-semantic', 32)])))
      .toEqual({ score: 84, level: 'critical', recommendation: 'deny' })
    expect(reconstruct(finalizeVerdict([finding('onnx-semantic', 26)])))
      .toEqual({ score: 0, level: 'low', recommendation: 'allow' })
  })

  it('rejects malformed, duplicate and inconsistent verdicts rather than defaulting to allow', () => {
    const valid = finalizeVerdict([finding('onnx-semantic', 26)])
    const invalid = [
      null, {}, { ...valid, findings: null }, { ...valid, headline: '' },
      { ...valid, score: 0 }, { ...valid, score: '26' },
      { ...valid, level: 'low' }, { ...valid, recommendation: 'allow' },
      { ...valid, findings: [finding('onnx-semantic', NaN)] },
      { ...valid, findings: [finding('onnx-semantic', Infinity)] },
      { ...valid, findings: [finding('onnx-semantic', -1)] },
      { ...valid, findings: [finding('unknown', 26)] },
      { ...valid, findings: [{ id: 'onnx-semantic', weight: 26 }] },
      { ...valid, findings: [finding('onnx-semantic', 13), finding('onnx-semantic', 13)] },
    ]
    for (const verdict of invalid) expect(() => reconstruct(verdict)).toThrow()
  })
})

describe('paired run', () => {
  const corpus = [
    { id: 'a', expect: 'review', toolName: 'shell_command', input: { command: 'test' } },
    { id: 'b', expect: 'allow', toolName: 'read_file', input: { path: 'test' } },
  ]

  it('uses each case once, checks health at both ends and reports paired confusion', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(warm))
      .mockResolvedValueOnce(response({ verdict: finalizeVerdict([finding('onnx-semantic', 26)]) }))
      .mockResolvedValueOnce(response({ verdict: finalizeVerdict([]) }))
      .mockResolvedValueOnce(response(warm))
    const results = await runAblation(corpus, 'http://example.test', fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    expect(fetchImpl.mock.calls[0][0]).toBe('http://example.test/healthz')
    expect(fetchImpl.mock.calls[3][0]).toBe('http://example.test/healthz')
    for (let i = 0; i < corpus.length; i++) {
      expect(fetchImpl.mock.calls[i + 1][0]).toBe('http://example.test/api/chaperone/inspect')
      expect(JSON.parse(fetchImpl.mock.calls[i + 1][1].body)).toEqual({ toolName: corpus[i].toolName, input: corpus[i].input })
    }
    expect(results[0]).toMatchObject({ id: 'a', overlay: true, baseline: { recommendation: 'allow' }, observed: { recommendation: 'review' } })
    expect(summarize(results, 'baseline')).toEqual({ tp: 0, fp: 0, tn: 1, fn: 1, exact: 1 })
    expect(summarize(results, 'observed')).toEqual({ tp: 1, fp: 0, tn: 1, fn: 0, exact: 2 })
  })

  it.each([{ model: 'warming', backend: warm.backend }, { model: 'warm', backend: 'hashing-512' }, { model: 'warm', backend: 'onnx-other' }])(
    'rejects an invalid backend before inspection', async (status) => {
      const fetchImpl = vi.fn().mockResolvedValue(response(status))
      await expect(runAblation(corpus, 'http://example.test', fetchImpl)).rejects.toThrow('healthz requires warm')
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    },
  )

  it('rejects an unhealthy backend after inspection instead of reporting results', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(warm))
      .mockResolvedValueOnce(response({ verdict: finalizeVerdict([]) }))
      .mockResolvedValueOnce(response({ model: 'unavailable', backend: 'hashing-512' }))
    await expect(runAblation(corpus.slice(0, 1), 'http://example.test', fetchImpl)).rejects.toThrow('healthz requires warm')
  })

  it('rejects malformed inspect data with the case ID', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response(warm)).mockResolvedValueOnce(response({}))
    await expect(runAblation(corpus, 'http://example.test', fetchImpl)).rejects.toThrow('inspect a: malformed verdict')
  })
})
