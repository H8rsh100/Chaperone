import { createHash } from 'node:crypto'
import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'

/** Hash of the imaginary entry before the first real one. */
export const GENESIS = '0'.repeat(64)

export interface LedgerInput {
  kind: string
  payload: unknown
}

export interface LedgerEntry {
  seq: number
  ts: string
  prev: string
  kind: string
  payload: unknown
}

export interface SealedLedgerEntry extends LedgerEntry {
  hash: string
}

/** Where the durable ledger lives. Overridable for tests via CHAPERONE_LEDGER. */
export function ledgerPath(): string {
  return resolve(process.env.CHAPERONE_LEDGER ?? 'var/chaperone/ledger.jsonl')
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/**
 * Deterministic serialization: object keys are sorted so the same logical entry
 * always hashes the same, regardless of insertion order.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null'
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`
  }
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(',')}}`
}

function hashEntry(prev: string, entry: LedgerEntry): string {
  return sha256(prev + canonical(entry))
}

/** Read every sealed entry, oldest first. */
export function readLedger(): SealedLedgerEntry[] {
  const file = ledgerPath()
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as SealedLedgerEntry)
}

/**
 * Append one entry to the tamper-evident chain. Each entry commits to the hash
 * of the previous one, so mutating any earlier byte invalidates everything after
 * it. Written with fsync so a crash cannot silently drop an audit record.
 */
export function appendAudit(input: LedgerInput): SealedLedgerEntry {
  const file = ledgerPath()
  mkdirSync(dirname(file), { recursive: true })

  const entries = readLedger()
  const prev = entries.length ? entries[entries.length - 1].hash : GENESIS

  // Normalize through JSON so the hash matches exactly what a reader will
  // reconstruct (drops `undefined`-valued keys, matches number formatting).
  const body = JSON.parse(
    JSON.stringify({
      seq: entries.length + 1,
      ts: new Date().toISOString(),
      prev,
      kind: input.kind,
      payload: input.payload,
    }),
  ) as LedgerEntry

  const hash = hashEntry(prev, body)
  const sealed: SealedLedgerEntry = { ...body, hash }

  const fd = openSync(file, 'a')
  try {
    appendFileSync(fd, JSON.stringify(sealed) + '\n')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }

  return sealed
}

export interface ChainVerification {
  ok: boolean
  entries: number
  /** Sequence number of the first entry that failed to verify. */
  at?: number
}

/**
 * Re-walk the whole chain. Returns the first broken sequence number if any entry
 * was altered, reordered, or removed.
 */
export function verifyChain(): ChainVerification {
  const entries = readLedger()
  let prev = GENESIS
  for (const entry of entries) {
    const { hash, ...body } = entry
    if (body.prev !== prev || hashEntry(prev, body as LedgerEntry) !== hash) {
      return { ok: false, entries: entries.length, at: entry.seq }
    }
    prev = hash
  }
  return { ok: true, entries: entries.length }
}

/** Truncate the ledger. Used only by tests and explicit demo resets. */
export function resetLedger(): void {
  const file = ledgerPath()
  if (existsSync(file)) unlinkSync(file)
}
