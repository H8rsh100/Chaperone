import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { GENESIS, readLedger, type SealedLedgerEntry } from './ledger'

/**
 * Signed anchoring.
 *
 * The hash chain proves *integrity* — no earlier entry can be altered without
 * breaking every later one. Anchoring adds *authenticity and point-in-time
 * proof*: we Merkle-root the current chain and sign that root with an Ed25519
 * key. A verifier holding the public key can then prove, offline, that a given
 * prefix of the ledger existed at a given moment and has not been rewritten
 * since — even against an operator who controls the ledger file.
 */

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** Where signed checkpoints live. Overridable for tests via CHAPERONE_ANCHORS. */
export function anchorsPath(): string {
  return resolve(process.env.CHAPERONE_ANCHORS ?? 'var/chaperone/anchors.jsonl')
}

/** Where the signing key is persisted when not supplied via the environment. */
function keyPath(): string {
  return resolve(process.env.CHAPERONE_LEDGER_KEY_FILE ?? 'var/chaperone/ledger-key.pem')
}

// ── Merkle tree ─────────────────────────────────────────────────────────────

/**
 * Binary Merkle root over the entry hashes. An odd node is promoted unchanged
 * to the next level (never duplicated) — duplication is the known second-preimage
 * foot-gun in Bitcoin-style trees.
 */
export function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return sha256('')
  let level = leaves.slice()
  while (level.length > 1) {
    const next: string[] = []
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? sha256(level[i] + level[i + 1]) : level[i])
    }
    level = next
  }
  return level[0]
}

export interface ProofStep {
  hash: string
  side: 'left' | 'right'
}

/** Inclusion proof for one leaf, so a single entry can be verified without the rest. */
export function merkleProof(leaves: string[], index: number): ProofStep[] {
  const proof: ProofStep[] = []
  let idx = index
  let level = leaves.slice()
  while (level.length > 1) {
    const isRight = idx % 2 === 1
    const sibling = isRight ? idx - 1 : idx + 1
    if (sibling < level.length) {
      proof.push({ hash: level[sibling], side: isRight ? 'left' : 'right' })
    }
    const next: string[] = []
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? sha256(level[i] + level[i + 1]) : level[i])
    }
    level = next
    idx = Math.floor(idx / 2)
  }
  return proof
}

export function verifyMerkleProof(leaf: string, proof: ProofStep[], root: string): boolean {
  let h = leaf
  for (const step of proof) {
    h = step.side === 'left' ? sha256(step.hash + h) : sha256(h + step.hash)
  }
  return h === root
}

// ── Keys ────────────────────────────────────────────────────────────────────

function loadPrivateKey(): KeyObject {
  const fromEnv = process.env.CHAPERONE_LEDGER_KEY
  if (fromEnv) {
    const pem = fromEnv.includes('BEGIN')
      ? fromEnv
      : Buffer.from(fromEnv, 'base64').toString('utf8')
    return createPrivateKey(pem)
  }
  const file = keyPath()
  if (existsSync(file)) return createPrivateKey(readFileSync(file, 'utf8'))
  const { privateKey } = generateKeyPairSync('ed25519')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }))
  return privateKey
}

function publicKeyB64(priv: KeyObject): string {
  return createPublicKey(priv).export({ type: 'spki', format: 'der' }).toString('base64')
}

// ── Anchors ─────────────────────────────────────────────────────────────────

export interface Anchor {
  seq: number
  ts: string
  /** Number of ledger entries covered (a prefix of the chain). */
  entries: number
  /** Hash of the last covered entry — pins the exact chain state. */
  head: string
  root: string
  alg: 'ed25519'
  /** Base64 SPKI public key of the signer. */
  pub: string
  /** Base64 Ed25519 signature over the canonical message. */
  sig: string
}

function anchorMessage(a: Pick<Anchor, 'ts' | 'entries' | 'head' | 'root'>): string {
  return `chaperone-anchor-v1\n${a.ts}\n${a.entries}\n${a.head}\n${a.root}`
}

export function readAnchors(): Anchor[] {
  const file = anchorsPath()
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Anchor)
}

/** Merkle-root the current chain and sign it. */
export function anchorLedger(): Anchor {
  const entries = readLedger()
  const leaves = entries.map((e) => e.hash)
  const head = entries.length ? entries[entries.length - 1].hash : GENESIS
  const root = merkleRoot(leaves)
  const ts = new Date().toISOString()

  const priv = loadPrivateKey()
  const sig = sign(null, Buffer.from(anchorMessage({ ts, entries: entries.length, head, root })), priv)

  const anchor: Anchor = {
    seq: readAnchors().length + 1,
    ts,
    entries: entries.length,
    head,
    root,
    alg: 'ed25519',
    pub: publicKeyB64(priv),
    sig: sig.toString('base64'),
  }

  const file = anchorsPath()
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, JSON.stringify(anchor) + '\n')
  return anchor
}

export interface AnchorVerification {
  ok: boolean
  count: number
  root?: string
  fingerprint?: string
  at?: number
  reason?: string
}

/**
 * Verify every signed checkpoint against the live ledger. Fails if a signature
 * is invalid, if a covered prefix no longer exists, or if the recomputed Merkle
 * root no longer matches what was signed.
 */
export function verifyAnchors(): AnchorVerification {
  const anchors = readAnchors()
  if (anchors.length === 0) return { ok: true, count: 0 }

  const entries: SealedLedgerEntry[] = readLedger()

  for (const a of anchors) {
    const pub = createPublicKey({ key: Buffer.from(a.pub, 'base64'), format: 'der', type: 'spki' })
    const signed = verify(
      null,
      Buffer.from(anchorMessage(a)),
      pub,
      Buffer.from(a.sig, 'base64'),
    )
    if (!signed) {
      return { ok: false, count: anchors.length, at: a.seq, reason: 'invalid signature' }
    }
    if (a.entries > entries.length) {
      return {
        ok: false,
        count: anchors.length,
        at: a.seq,
        reason: 'ledger is shorter than the anchored prefix',
      }
    }
    const head = a.entries ? entries[a.entries - 1].hash : GENESIS
    if (head !== a.head) {
      return { ok: false, count: anchors.length, at: a.seq, reason: 'chain head mismatch' }
    }
    if (merkleRoot(entries.slice(0, a.entries).map((e) => e.hash)) !== a.root) {
      return {
        ok: false,
        count: anchors.length,
        at: a.seq,
        reason: 'Merkle root mismatch — ledger was altered after signing',
      }
    }
  }

  const last = anchors[anchors.length - 1]
  return { ok: true, count: anchors.length, root: last.root, fingerprint: sha256(last.pub) }
}

/** Remove all anchors. Used only by explicit demo resets. */
export function resetAnchors(): void {
  const file = anchorsPath()
  if (existsSync(file)) unlinkSync(file)
}
