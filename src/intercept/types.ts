export type InterceptDecision = 'allow' | 'deny'

export interface PendingToolCall {
  id: string
  toolName: string
  input: Record<string, unknown>
  rawBlock: unknown
}

export type ToolCallHandler = (
  call: PendingToolCall,
) => Promise<InterceptDecision>

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
  demoScenario?: 'destructive' | 'benign-http' | 'borderline' | 'all'
}
