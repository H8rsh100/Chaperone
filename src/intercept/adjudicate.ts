import type {
  InterceptDecision,
  Outcome,
  PendingToolCall,
  ReviewResolution,
} from './types'
import { finalizeVerdict, type ToolCall, type Verdict } from '../lib/inspect'
import { sentinel } from './sentinel'

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
  const inspected = await deps.inspect(pending)
  const toolCall = inspected.toolCall

  // Layer 4: provenance. If this call is a high-risk sink and its arguments
  // carry content previously fetched from an untrusted source, merge a
  // data-flow finding before policy is applied. This is what catches indirect
  // injection whose final tool call looks harmless in isolation.
  let verdict = inspected.verdict
  const taint = sentinel.findings(pending.toolName, pending.input)
  if (taint.length > 0) {
    verdict = finalizeVerdict([...verdict.findings, ...taint])
  }

  if (verdict.recommendation === 'deny') {
    const taintFinding = verdict.findings.find((f) => f.id === 'taint-flow')
    return {
      toolCall,
      verdict,
      decision: 'deny',
      decidedBy: 'auto',
      outcome: 'blocked_by_policy',
      reason: taintFinding ? `${taintFinding.title}: ${taintFinding.detail}` : verdict.headline,
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
    // Learn provenance from untrusted tool output (HTTP, file reads, …) so the
    // next call can be judged on where its data came from.
    sentinel.observe(pending.toolName, pending.input, result)
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
