import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'

const TOKEN_TTL_MS = 60_000

let devSecret: Buffer | null = null

/**
 * 32-byte signing key. Set `CHAPERONE_APPROVAL_SECRET` (64 hex chars) in any real
 * deployment; falls back to a per-process random key for local dev/tests.
 */
function secret(): Buffer {
  const raw = process.env.CHAPERONE_APPROVAL_SECRET
  if (raw && /^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex')
  if (!devSecret) devSecret = randomBytes(32)
  return devSecret
}

export function operator(): string {
  return process.env.CHAPERONE_OPERATOR ?? 'operator'
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(',')}}`
}

/** Content hash of the exact call being approved — binds a token to one call. */
export function callHashOf(call: { id: string; toolName: string; input: unknown }): string {
  return sha256(canonical({ id: call.id, toolName: call.toolName, input: call.input }))
}

export interface DecisionTokenClaims {
  callId: string
  callHash: string
  sub: string
}

interface TokenBody extends DecisionTokenClaims {
  v: 1
  jti: string
  exp: number
}

const b64 = (buf: Buffer) => buf.toString('base64url')

export function mintDecisionToken(
  claims: DecisionTokenClaims,
  ttlMs: number = TOKEN_TTL_MS,
): { token: string; expiresAt: string; jti: string } {
  const body: TokenBody = { v: 1, ...claims, jti: randomUUID(), exp: Date.now() + ttlMs }
  const payload = b64(Buffer.from(JSON.stringify(body)))
  const mac = createHmac('sha256', secret()).update(payload).digest()
  return { token: `${payload}.${b64(mac)}`, expiresAt: new Date(body.exp).toISOString(), jti: body.jti }
}

export type TokenVerification =
  | { ok: true; body: TokenBody }
  | { ok: false; reason: string }

export function verifyDecisionToken(
  token: string,
  expected: { callHash: string; sub?: string },
): TokenVerification {
  const [payload, mac] = token.split('.')
  if (!payload || !mac) return { ok: false, reason: 'malformed token' }

  const want = createHmac('sha256', secret()).update(payload).digest()
  const got = Buffer.from(mac, 'base64url')
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    return { ok: false, reason: 'signature mismatch' }
  }

  let body: TokenBody
  try {
    body = JSON.parse(Buffer.from(payload, 'base64url').toString()) as TokenBody
  } catch {
    return { ok: false, reason: 'malformed payload' }
  }

  if (body.exp < Date.now()) return { ok: false, reason: 'token expired' }
  if (body.callHash !== expected.callHash) return { ok: false, reason: 'token is for a different call' }
  if (expected.sub && body.sub !== expected.sub) return { ok: false, reason: 'wrong operator' }
  return { ok: true, body }
}

const consumed = new Map<string, number>()

/** Single-use guard. Returns false if this token id was already spent. */
export function consumeToken(jti: string, exp: number): boolean {
  const now = Date.now()
  for (const [key, expiry] of consumed) if (expiry < now) consumed.delete(key)
  if (consumed.has(jti)) return false
  consumed.set(jti, exp)
  return true
}
