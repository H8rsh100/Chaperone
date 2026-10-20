import { pendingToToolCall } from '../../src/intercept/mapCall'
import { sentinel } from '../../src/intercept/sentinel'
import type { PendingToolCall } from '../../src/intercept/types'
import { embed as hashingEmbed } from '../../src/lib/semantic'
import { runAegisSwarm, type IsolationHoldRequest } from '../../src/swarm/orchestrator'
import type { Embedder } from '../../src/swarm/saliency'
import type { SwarmState } from '../../src/swarm/types'
import { toolRegistry } from '../toolRegistry'
import { clearGate, pushAudit, requestHumanDecision } from '../gateStore'
import { embedForAnalysis, inspectCallAsync, semanticStatus } from '../scoring'

/**
 * In-process runtime for the dashboard. One active swarm at a time keeps the
 * demo legible and the provenance graph authoritative.
 */

export type SwarmRunMode = 'poisoned' | 'benign'

let current: SwarmState | null = null
let running = false

export function swarmSnapshot(): { state: SwarmState | null; running: boolean } {
  return { state: current, running }
}

export function resetSwarm(): boolean {
  if (running) return false
  current = null
  return true
}

function holdPending(request: IsolationHoldRequest): PendingToolCall {
  return {
    id: `aegis-hold-${request.runId}`,
    toolName: 'swarm_quarantine',
    input: {
      agent: request.agent,
      reason: request.reason,
      contamination: Math.round(request.contamination),
      canary: request.canary,
      runId: request.runId,
    },
    rawBlock: { type: 'aegis_hold', agent: request.agent },
  }
}

export function startSwarm(mode: SwarmRunMode): { started: boolean; error?: string } {
  if (running) return { started: false, error: 'a swarm run is already active' }

  running = true
  current = null
  clearGate()
  sentinel.reset()

  const status = semanticStatus()
  const backend = status.state === 'warm' ? status.backend : 'hashing-512'
  const embed: Embedder = async (text) =>
    (await embedForAnalysis(text)) ?? hashingEmbed(text)

  void runAegisSwarm(
    { mode },
    {
      inspect: async (call) => {
        const toolCall = pendingToToolCall(call, 'aegis-swarm')
        const verdict = await inspectCallAsync(toolCall)
        return { toolCall, verdict }
      },
      onReview: (call, verdict) => requestHumanDecision(call, verdict),
      executeTool: async (name, input) => {
        const fn = toolRegistry[name]
        if (!fn) return { ok: false, error: `Unknown tool ${name}` }
        return fn(input)
      },
      // Give the operator a readable window for an isolation decision; the
      // kernel's own review tier keeps the global timeout.
      hold: (request) =>
        requestHumanDecision(holdPending(request), request.verdict, 20_000),
      onAudit: (record) => pushAudit({ ...record }),
      onState: (state) => {
        current = state
      },
      embed,
      backend,
    },
  )
    .then((final) => {
      current = final
      running = false
    })
    .catch((err) => {
      running = false
      if (current) {
        current.phase = 'failed'
        current.result = err instanceof Error ? err.message : String(err)
      }
    })

  return { started: true }
}
