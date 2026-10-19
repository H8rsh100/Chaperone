import type { Finding } from '../lib/inspect'

/**
 * Indirect Prompt Injection Sentinel — runtime data-flow taint tracking for
 * agent tool chains.
 *
 * The gap this closes: a model fetches a page (untrusted), the page says "run
 * `echo <canary>`", and the model emits a *harmless-looking* tool call. Keyword
 * and intent scoring see nothing wrong, because the call itself is benign.
 * What is wrong is its **provenance**: data that entered from an untrusted
 * source is now driving a high-risk sink.
 *
 * We cannot instrument the model's weights, so we track provenance at the tool
 * boundary — a content-taint model:
 *
 *   observe(untrusted tool result)  → fingerprint (tokens, 5-gram shingles,
 *                                     distinctive markers)
 *   scan(high-risk call arguments)  → shingle containment + longest contiguous
 *                                     token run + marker hits
 *   findings(...)                   → weighted Finding[] merged into the verdict
 *
 * This is deliberately *not* a keyword blocklist: a paraphrased or truncated
 * bleed is caught by overlap, and a short high-entropy canary is caught by the
 * marker rule. Pure JS, no dependencies, so it runs in the gate hot path.
 */

const SHINGLE_SIZE = 5
const MIN_CHARS = 24
const MAX_CHARS = 64_000
const MAX_RECORDS = 64
const MAX_SCAN_TOKENS = 600
const MIN_CONFIDENCE = 0.34
const MIN_RUN = 6
/** High-entropy, letter+digit token (canary, build id, API-ish value). */
const MARKER_RE = /^(?=.*[a-z])(?=.*\d)[a-z0-9]{8,}$/

/** Tools whose output is attacker-controlled and must be tracked. */
const UNTRUSTED_SOURCES = new Set([
  'http_fetch',
  'http',
  'fetch',
  'web_search',
  'web_fetch',
  'file_read',
  'fs.read',
  'read_file',
])

/** Tools that can cause real damage or exfiltration. */
const HIGH_RISK_SINKS = new Set([
  'shell_command',
  'shell',
  'bash',
  'exec',
  'run_command',
  'db_write',
  'database_write',
  'sql_exec',
  'file_write',
  'fs.write',
  'write_file',
  'email_send',
  'send_email',
  'http_fetch',
  'http',
  'fetch',
])

export interface TaintRecord {
  id: string
  digest: string
  origin: string
  tool: string
  capturedAt: string
  normalized: string
  tokens: string[]
  shingles: Set<number>
  markers: Set<string>
  preview: string
}

export interface TaintMatch {
  record: TaintRecord
  sink: string
  signal: 'marker' | 'exact' | 'overlap'
  confidence: number
  containment: number
  run: number
}

// ── text primitives ─────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function tokenize(text: string): string[] {
  const norm = normalize(text)
  return norm ? norm.split(' ') : []
}

/** FNV-1a. Deterministic 32-bit hash; we only need equality, not crypto. */
function hash32(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function shingleSet(tokens: string[]): Set<number> {
  const set = new Set<number>()
  if (tokens.length === 0) return set
  if (tokens.length < SHINGLE_SIZE) {
    set.add(hash32(tokens.join(' ')))
    return set
  }
  for (let i = 0; i + SHINGLE_SIZE <= tokens.length; i++) {
    set.add(hash32(tokens.slice(i, i + SHINGLE_SIZE).join(' ')))
  }
  return set
}

function markersOf(tokens: string[]): Set<string> {
  const markers = new Set<string>()
  for (const token of tokens) if (MARKER_RE.test(token)) markers.add(token)
  return markers
}

/** Longest contiguous run of identical tokens (classic LCS-on-tokens DP). */
function longestRun(a: string[], b: string[]): number {
  const A = a.slice(0, MAX_SCAN_TOKENS)
  const B = b.slice(0, MAX_SCAN_TOKENS)
  let previous = new Array<number>(B.length + 1).fill(0)
  let best = 0
  for (let i = 1; i <= A.length; i++) {
    const current = new Array<number>(B.length + 1).fill(0)
    for (let j = 1; j <= B.length; j++) {
      if (A[i - 1] === B[j - 1]) {
        current[j] = previous[j - 1] + 1
        if (current[j] > best) best = current[j]
      }
    }
    previous = current
  }
  return best
}

function collectStrings(value: unknown, out: string[], depth = 0): void {
  if (depth > 4 || out.length >= 200) return
  if (typeof value === 'string') {
    out.push(value.slice(0, 8000))
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out, depth + 1)
    return
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectStrings(item, out, depth + 1)
    }
  }
}

/** Pull the readable payload out of a tool result. */
function resultText(result: unknown): string {
  if (typeof result === 'string') return result
  if (!result || typeof result !== 'object') return ''
  const record = result as Record<string, unknown>
  if (record.blocked === true || record.ok === false) return ''
  for (const key of ['body', 'stdout', 'text', 'content', 'result', 'data']) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  try {
    return JSON.stringify(result)
  } catch {
    return ''
  }
}

function originOf(tool: string, input: Record<string, unknown>): string {
  for (const key of ['url', 'path', 'file', 'target']) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) return value.slice(0, 200)
  }
  return tool
}

// ── the sentinel ────────────────────────────────────────────────────────────

export class TaintSentinel {
  private records: TaintRecord[] = []
  private byDigest = new Map<string, TaintRecord>()

  /** Record an untrusted tool result as a provenance source. */
  observe(
    toolName: string,
    input: Record<string, unknown>,
    result: unknown,
  ): TaintRecord | null {
    if (!UNTRUSTED_SOURCES.has(toolName)) return null

    const text = resultText(result)
    if (text.length < MIN_CHARS) return null

    const normalized = normalize(text.slice(0, MAX_CHARS))
    if (normalized.length < MIN_CHARS) return null

    const digest = `${hash32(normalized).toString(16)}:${normalized.length}`
    const known = this.byDigest.get(digest)
    if (known) {
      known.capturedAt = new Date().toISOString()
      this.records = this.records.filter((r) => r !== known)
      this.records.push(known)
      return known
    }

    const tokens = tokenize(normalized)
    const record: TaintRecord = {
      id: `taint-${this.records.length + 1}-${Date.now()}`,
      digest,
      origin: originOf(toolName, input),
      tool: toolName,
      capturedAt: new Date().toISOString(),
      normalized,
      tokens,
      shingles: shingleSet(tokens),
      markers: markersOf(tokens),
      preview: normalized.slice(0, 160),
    }

    this.records.push(record)
    this.byDigest.set(digest, record)
    while (this.records.length > MAX_RECORDS) {
      const evicted = this.records.shift()
      if (evicted) this.byDigest.delete(evicted.digest)
    }
    return record
  }

  /** Does this call's data derive from untrusted content? */
  scan(toolName: string, input: Record<string, unknown>): TaintMatch[] {
    if (!HIGH_RISK_SINKS.has(toolName) || this.records.length === 0) return []

    const strings: string[] = []
    collectStrings(input, strings)
    const candidate = normalize(strings.join(' \n '))
    if (candidate.length < 8) return []

    const candidateTokens = tokenize(candidate)
    if (candidateTokens.length === 0) return []
    const candidateShingles = shingleSet(candidateTokens)
    const candidateSet = new Set(candidateTokens)

    const matches: TaintMatch[] = []

    for (const record of this.records) {
      let markerHit = false
      for (const marker of record.markers) {
        if (candidateSet.has(marker)) {
          markerHit = true
          break
        }
      }

      let overlap = 0
      for (const shingle of candidateShingles) {
        if (record.shingles.has(shingle)) overlap++
      }
      const containment = candidateShingles.size ? overlap / candidateShingles.size : 0

      const exact = record.normalized.length >= 24 && candidate.includes(record.normalized)
      if (!markerHit && !exact && containment < 0.12) continue

      const run = longestRun(candidateTokens, record.tokens)
      if (!markerHit && !exact && run < MIN_RUN && containment < 0.5) continue

      let confidence = 0.65 * containment + 0.35 * Math.min(run / 12, 1)
      if (markerHit) confidence = Math.max(confidence, 0.85)
      if (exact) confidence = Math.max(confidence, 0.98)
      if (confidence < MIN_CONFIDENCE) continue

      matches.push({
        record,
        sink: toolName,
        signal: markerHit ? 'marker' : exact ? 'exact' : 'overlap',
        confidence: Math.min(0.99, confidence),
        containment,
        run,
      })
    }

    return matches.sort((a, b) => b.confidence - a.confidence).slice(0, 3)
  }

  /** Weighted findings ready to merge into a Verdict. */
  findings(toolName: string, input: Record<string, unknown>): Finding[] {
    return this.scan(toolName, input).map((match) => {
      const signal =
        match.signal === 'marker'
          ? 'distinctive canary'
          : match.signal === 'exact'
            ? 'whole-source match'
            : 'phrase overlap'
      return {
        id: 'taint-flow',
        title: 'Indirect prompt injection: untrusted data reached a sink',
        detail: `${match.record.tool} content from ${match.record.origin} re-entered ${match.sink} at ${Math.round(
          match.confidence * 100,
        )}% confidence (${signal}; ${match.run}-token run; ${Math.round(
          match.containment * 100,
        )}% shingle overlap). Blocked on provenance, not keywords.`,
        weight: Math.min(60, 34 + Math.round(26 * match.confidence)),
      }
    })
  }

  reset(): void {
    this.records = []
    this.byDigest.clear()
  }

  snapshot(): readonly TaintRecord[] {
    return this.records
  }

  get size(): number {
    return this.records.length
  }
}

/** Process-wide instance: provenance must persist across tool calls. */
export const sentinel = new TaintSentinel()
