import { randomUUID } from 'node:crypto'
import { adjudicate } from '../../src/intercept/adjudicate'
import { summarizeInput } from '../../src/intercept/anthropicIntercept'
import { pendingToToolCall } from '../../src/intercept/mapCall'
import type { PendingToolCall } from '../../src/intercept/types'
import { chaperoneToolDefs, toolRegistry } from '../toolRegistry'
import { inspectCallAsync } from '../scoring'
import { pushAudit, requestHumanDecision } from '../gateStore'

/**
 * Model Context Protocol surface. The gateway process speaks JSON-RPC over
 * stdio and delegates here, so every MCP tool call passes through the exact
 * same gate, approval tokens, and ledger as the in-app agent loop.
 */

export type McpToolDef = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export function mcpTools(): McpToolDef[] {
  return chaperoneToolDefs.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.input_schema as Record<string, unknown>,
  }))
}

export type McpContent = { type: 'text'; text: string }

export type McpCallResult = {
  content: McpContent[]
  isError?: boolean
  outcome: string
  decision: string
  decidedBy: string
}

function text(value: unknown): McpContent[] {
  return [{ type: 'text', text: JSON.stringify(value).slice(0, 8000) }]
}

export async function callMcpTool(
  name: string,
  args: Record<string, unknown>,
): Promise<McpCallResult> {
  const pending: PendingToolCall = {
    id: `mcp-${randomUUID()}`,
    toolName: name,
    input: args ?? {},
    rawBlock: null,
  }

  const adj = await adjudicate(pending, {
    inspect: async (call) => {
      const toolCall = pendingToToolCall(call)
      return { toolCall, verdict: await inspectCallAsync(toolCall) }
    },
    onReview: (call, verdict) => requestHumanDecision(call, verdict),
    executeTool: async (n, input) => {
      const fn = toolRegistry[n]
      if (!fn) return { error: `Unknown tool ${n}` }
      return fn(input)
    },
  })

  pushAudit({
    id: `${pending.id}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    toolName: pending.toolName,
    inputSummary: summarizeInput(pending.input),
    riskScore: adj.verdict.score,
    riskLevel: adj.verdict.level,
    decision: adj.decision,
    decidedBy: adj.decidedBy,
    finalDecision: adj.decision,
    outcome: adj.outcome,
    reason: adj.reason,
    findings: adj.verdict.findings,
    channel: 'mcp',
  })

  const base = {
    outcome: adj.outcome,
    decision: adj.decision,
    decidedBy: adj.decidedBy,
  }

  switch (adj.outcome) {
    case 'executed':
      return { ...base, content: text(adj.result) }
    case 'blocked_by_policy':
      return {
        ...base,
        isError: true,
        content: text({
          blocked: true,
          by: 'chaperone',
          reason: adj.verdict.headline,
          findings: adj.verdict.findings.map((f) => f.title),
          riskScore: adj.verdict.score,
        }),
      }
    case 'blocked_by_allowlist':
      return {
        ...base,
        isError: true,
        content: text({
          blocked: true,
          by: 'chaperone-allowlist',
          reason: adj.reason,
          tool: adj.toolCall.tool,
        }),
      }
    case 'denied_by_human':
    case 'failed_closed': {
      const failClosed = adj.outcome === 'failed_closed'
      return {
        ...base,
        isError: true,
        content: text({
          blocked: true,
          by: failClosed ? 'chaperone-fail-closed' : 'chaperone-human',
          reason: failClosed
            ? `Fail-closed: ${adj.reason ?? 'no human response within the review window'}.`
            : 'Human denied this tool call at the checkpoint.',
          tool: adj.toolCall.tool,
        }),
      }
    }
    default:
      return { ...base, isError: true, content: text({ error: adj.reason ?? adj.outcome }) }
  }
}
