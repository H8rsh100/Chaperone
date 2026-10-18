export type InterceptDecision = 'allow' | 'deny'

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
  /** Demo mode: skip Anthropic and use scripted tool_use turns */
  demoScenario?:
    | 'destructive'
    | 'benign-http'
    | 'borderline'
    | 'adversarial'
    | 'encoded'
    | 'all'
}
