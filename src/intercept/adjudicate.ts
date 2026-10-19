import type {
  InterceptDecision,
  Outcome,
  PendingToolCall,
  ReviewResolution,
} from './types'
import type { ToolCall, Verdict } from '../lib/inspect'

/**
 * Single-call gate. Both the Anthropic agent loop and the MCP gateway route
 * through this so their decisions, outcomes, and reasons can never diverge.
 */

export interface AdjudicateDeps {
  inspect: (
    call: PendingToolCall,
  ) =>
    | { toolCall: ToolCall; verdict: Verdict }
    | Promise<{ toolCall: ToolCall; verdict: Verdict }>
  onReview: (call: PendingToolCall) => Promise<ReviewResolution>
  executeTool: (name: string, input: Record<string, unknown>) => Promise<unknown>
}

export interface Adjudication {
  toolCall: ToolCall
  verdict: Verdict
  decision: InterceptDecision
  decidedBy: 'auto' | 'human'
  outcome: Outcome
  reason?: string
  /** Present when the tool actually ran (outcome 'executed' or 'failed'). */
  result?: unknown
  /** True when the call was stopped and never ran. */
  blocked: boolean
}

export async function adjudicate(
  pending: PendingToolCall,
  deps: AdjudicateDeps,
): Promise<Adjudication> {
  const { toolCall, verdict } = await deps.inspect(pending)

  if (verdict.recommendation === 'deny') {
    return {
      toolCall,
      verdict,
      decision: 'deny',
      decidedBy: 'auto',
      outcome: 'blocked_by_policy',
      reason: verdict.headline,
      blocked: true,
    }
  }

  if (verdict.recommendation === 'review') {
    const resolution = await deps.onReview(pending)
    if (resolution.decision === 'deny') {
      const failClosed = resolution.decidedBy === 'auto'
      return {
        toolCall,
        verdict,
        decision: 'deny',
        decidedBy: resolution.decidedBy,
        outcome: failClosed ? 'failed_closed' : 'denied_by_human',
        reason: resolution.reason,
        blocked: true,
      }
    }
  }

  const decidedBy: 'auto' | 'human' = verdict.recommendation === 'review' ? 'human' : 'auto'

  try {
    const result = await deps.executeTool(pending.toolName, pending.input)
    if (result && typeof result === 'object' && (result as { blocked?: unknown }).blocked === true) {
      return {
        toolCall,
        verdict,
        decision: 'deny',
        decidedBy,
        outcome: 'blocked_by_allowlist',
        reason: String((result as { reason?: unknown }).reason ?? 'blocked by execution allowlist'),
        result,
        blocked: true,
      }
    }
    if (result && typeof result === 'object' && (result as { ok?: unknown }).ok === false) {
      return {
        toolCall,
        verdict,
        decision: 'allow',
        decidedBy,
        outcome: 'failed',
        reason: String((result as { error?: unknown }).error ?? 'tool execution failed'),
        result,
        blocked: false,
      }
    }
    return { toolCall, verdict, decision: 'allow', decidedBy, outcome: 'executed', result, blocked: false }
  } catch (err) {
    return {
      toolCall,
      verdict,
      decision: 'allow',
      decidedBy,
      outcome: 'failed',
      reason: err instanceof Error ? err.message : String(err),
      blocked: false,
    }
  }
}
