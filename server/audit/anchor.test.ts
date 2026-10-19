import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendAudit, readLedger } from './ledger'
import {
  anchorLedger,
  anchorsPath,
  merkleProof,
  merkleRoot,
  readAnchors,
  resetAnchors,
  verifyAnchors,
  verifyMerkleProof,
} from './anchor'

let dir: string
const prevLedger = process.env.CHAPERONE_LEDGER
const prevAnchors = process.env.CHAPERONE_ANCHORS
const prevKey = process.env.CHAPERONE_LEDGER_KEY
const prevKeyFile = process.env.CHAPERONE_LEDGER_KEY_FILE

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chaperone-anchor-'))
  process.env.CHAPERONE_LEDGER = join(dir, 'ledger.jsonl')
  process.env.CHAPERONE_ANCHORS = join(dir, 'anchors.jsonl')
  process.env.CHAPERONE_LEDGER_KEY_FILE = join(dir, 'key.pem')
  delete process.env.CHAPERONE_LEDGER_KEY
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  if (prevLedger === undefined) delete process.env.CHAPERONE_LEDGER
  else process.env.CHAPERONE_LEDGER = prevLedger
  if (prevAnchors === undefined) delete process.env.CHAPERONE_ANCHORS
  else process.env.CHAPERONE_ANCHORS = prevAnchors
  if (prevKey === undefined) delete process.env.CHAPERONE_LEDGER_KEY
  else process.env.CHAPERONE_LEDGER_KEY = prevKey
  if (prevKeyFile === undefined) delete process.env.CHAPERONE_LEDGER_KEY_FILE
  else process.env.CHAPERONE_LEDGER_KEY_FILE = prevKeyFile
})

describe('merkleRoot', () => {
  it('is deterministic and order-sensitive', () => {
    expect(merkleRoot(['a', 'b', 'c'])).toBe(merkleRoot(['a', 'b', 'c']))
    expect(merkleRoot(['a', 'b', 'c'])).not.toBe(merkleRoot(['c', 'b', 'a']))
  })

  it('handles odd levels by promotion, not duplication', () => {
    const h = (s: string) => createHash('sha256').update(s).digest('hex')
    const promoted = merkleRoot(['a', 'b', 'c'])
    const duplicated = h(h('a' + 'b') + h('c' + 'c'))
    expect(promoted).toBe(h(h('a' + 'b') + 'c'))
    expect(promoted).not.toBe(duplicated)
  })
})

describe('merkleProof', () => {
  it('verifies membership for every leaf', () => {
    const leaves = ['a', 'b', 'c', 'd', 'e']
    const root = merkleRoot(leaves)
    leaves.forEach((leaf, i) => {
      expect(verifyMerkleProof(leaf, merkleProof(leaves, i), root)).toBe(true)
    })
  })

  it('rejects a forged leaf', () => {
    const leaves = ['a', 'b', 'c', 'd']
    const root = merkleRoot(leaves)
    expect(verifyMerkleProof('evil', merkleProof(leaves, 2), root)).toBe(false)
  })
})

describe('anchoring', () => {
  it('signs the chain and verifies', () => {
    appendAudit({ kind: 'decision', payload: { n: 1 } })
    appendAudit({ kind: 'decision', payload: { n: 2 } })
    const anchor = anchorLedger()
    expect(anchor.entries).toBe(2)
    expect(anchor.alg).toBe('ed25519')

    const v = verifyAnchors()
    expect(v.ok).toBe(true)
    expect(v.count).toBe(1)
    expect(v.fingerprint).toBeTruthy()

    const stored = readAnchors()
    expect(stored).toHaveLength(1)
    expect(anchorsPath().endsWith('anchors.jsonl')).toBe(true)
  })

  it('detects a rewritten ledger hash after signing', () => {
    appendAudit({ kind: 'decision', payload: { n: 1 } })
    appendAudit({ kind: 'decision', payload: { n: 2 } })
    anchorLedger()

    // Tamper: flip an entry hash in the on-disk chain without re-signing.
    const file = process.env.CHAPERONE_LEDGER as string
    const lines = readFileSync(file, 'utf8').trim().split('\n')
    const entry = JSON.parse(lines[0])
    entry.hash = 'f'.repeat(64)
    lines[0] = JSON.stringify(entry)
    writeFileSync(file, lines.join('\n') + '\n')

    const v = verifyAnchors()
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/Merkle root mismatch/i)
  })

  it('detects a forged signature', () => {
    appendAudit({ kind: 'decision', payload: { n: 1 } })
    anchorLedger()

    const file = anchorsPath()
    const a = JSON.parse(readFileSync(file, 'utf8').trim())
    a.sig = Buffer.from('not-a-real-signature').toString('base64')
    writeFileSync(file, JSON.stringify(a) + '\n')

    expect(verifyAnchors().ok).toBe(false)
    expect(readLedger()).toHaveLength(1)
  })

  it('reset clears anchors', () => {
    appendAudit({ kind: 'decision', payload: { n: 1 } })
    anchorLedger()
    resetAnchors()
    expect(readAnchors()).toHaveLength(0)
    expect(verifyAnchors()).toEqual({ ok: true, count: 0 })
  })
})
