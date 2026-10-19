import type { ToolCall, Verdict } from '../lib/inspect'

export type InterceptDecision = 'allow' | 'deny'

/**
 * The single source of truth for what actually happened to a tool call. Written
 * AFTER execution so a call that the scorer approved but the hard allowlist
 * refused is recorded as `blocked_by_allowlist`, never as an executed `allow`.
 */
export type Outcome =
  | 'executed'
  | 'blocked_by_policy'
  | 'blocked_by_allowlist'
  | 'denied_by_human'
  | 'failed_closed'
  | 'failed'

export interface PendingToolCall {
  id: string
  toolName: string
  input: Record<string, unknown>
  rawBlock: unknown
}

/**
 * Outcome of a review-tier tool call. `decidedBy` distinguishes a real human
 * verdict from the fail-closed auto-deny that fires when nobody responds.
 */
export interface ReviewResolution {
  decision: InterceptDecision
  decidedBy: 'human' | 'auto'
  reason?: string
}

export type ToolCallHandler = (
  call: PendingToolCall,
) => Promise<ReviewResolution>

/**
 * Pluggable scorer. The default is the synchronous engine; the server injects an
 * embedding-augmented asynchronous scorer without core code depending on it.
 */
export type AsyncInspector = (
  call: PendingToolCall,
) => Promise<{ toolCall: ToolCall; verdict: Verdict }>

export interface AuditRecord {
  id: string
  timestamp: string
  toolName: string
  inputSummary: string
  riskScore: number
  riskLevel: string
  decision: InterceptDecision | 'review'
  decidedBy: 'auto' | 'human'
  finalDecision?: InterceptDecision
  /** Authoritative result of the call, written after execution. */
  outcome: Outcome
  reason?: string
}

export interface AnthropicToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface RunWithChaperoneOptions {
  apiKey?: string
  model?: string
  maxRounds?: number
  tools: AnthropicToolDefinition[]
  /** Resolve review-tier calls. Required when recommendation is review. */
  onReview: ToolCallHandler
  /** Optional hook after every adjudicated call */
  onAudit?: (record: AuditRecord) => void
  /** Optional async scorer (e.g. server-side embeddings). Defaults to the sync engine. */
  inspectPending?: AsyncInspector
  /** Demo mode: skip Anthropic and use scripted tool_use turns */
  demoScenario?:
    | 'destructive'
    | 'benign-http'
    | 'borderline'
    | 'adversarial'
    | 'encoded'
    | 'all'
}
