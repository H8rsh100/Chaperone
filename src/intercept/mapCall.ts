import {
  inspect,
  type ToolCall,
  type ToolKind,
  type Verdict,
} from '../lib/inspect'
import type { PendingToolCall } from './types'

export function toolNameToKind(toolName: string): ToolKind {
  const n = toolName.toLowerCase()
  if (n.includes('swarm')) return 'swarm'
  if (n.includes('http') || n.includes('fetch') || n.includes('curl')) return 'http'
  if (n.includes('shell') || n.includes('exec') || n.includes('bash')) return 'shell'
  if (n.includes('write')) return 'fs.write'
  if (n.includes('read')) return 'fs.read'
  if (n.includes('sql') || n.includes('db')) return 'db'
  if (n.includes('secret')) return 'secrets'
  return 'shell'
}

export function pendingToToolCall(call: PendingToolCall, agent = 'live-agent'): ToolCall {
  const payload =
    typeof call.input === 'object'
      ? JSON.stringify(call.input, null, 2)
      : String(call.input)
  const summary =
    typeof call.input.command === 'string'
      ? call.input.command
      : typeof call.input.url === 'string'
        ? `HTTP ${String(call.input.method ?? 'GET')} ${call.input.url}`
        : `${call.toolName} invocation`

  return {
    id: call.id,
    agent,
    tool: toolNameToKind(call.toolName),
    summary: String(summary).slice(0, 120),
    payload,
    requestedAt: new Date().toISOString().slice(11, 19),
  }
}

export function inspectPending(call: PendingToolCall): {
  toolCall: ToolCall
  verdict: Verdict
} {
  const toolCall = pendingToToolCall(call)
  return { toolCall, verdict: inspect(toolCall) }
}
