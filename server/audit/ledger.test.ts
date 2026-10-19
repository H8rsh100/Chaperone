import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GENESIS, appendAudit, readLedger, verifyChain } from './ledger'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chaperone-ledger-'))
  process.env.CHAPERONE_LEDGER = join(dir, 'ledger.jsonl')
})

afterEach(() => {
  delete process.env.CHAPERONE_LEDGER
})

function file(): string {
  return process.env.CHAPERONE_LEDGER as string
}

describe('hash-chained audit ledger', () => {
  it('chains each entry to the previous hash', () => {
    appendAudit({ kind: 'decision', payload: { call: 'a', decision: 'allow' } })
    appendAudit({ kind: 'decision', payload: { call: 'b', decision: 'deny' } })

    const entries = readLedger()
    expect(entries).toHaveLength(2)
    expect(entries[0].prev).toBe(GENESIS)
    expect(entries[1].prev).toBe(entries[0].hash)
    expect(verifyChain()).toEqual({ ok: true, entries: 2 })
  })

  it('detects a rewritten payload', () => {
    appendAudit({ kind: 'decision', payload: { call: 'a', decision: 'allow' } })
    appendAudit({ kind: 'decision', payload: { call: 'b', decision: 'deny' } })

    const lines = readFileSync(file(), 'utf8').trim().split('\n')
    const first = JSON.parse(lines[0])
    first.payload.decision = 'deny'
    lines[0] = JSON.stringify(first)
    writeFileSync(file(), lines.join('\n') + '\n')

    const result = verifyChain()
    expect(result.ok).toBe(false)
    expect(result.at).toBe(1)
  })

  it('detects a removed entry', () => {
    appendAudit({ kind: 'decision', payload: { n: 1 } })
    appendAudit({ kind: 'decision', payload: { n: 2 } })
    appendAudit({ kind: 'decision', payload: { n: 3 } })

    const lines = readFileSync(file(), 'utf8').trim().split('\n')
    writeFileSync(file(), [lines[0], lines[2]].join('\n') + '\n')

    const result = verifyChain()
    expect(result.ok).toBe(false)
    expect(result.at).toBe(3)
  })
})
