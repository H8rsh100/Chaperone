import type { Finding } from '../lib/inspect'
import type { Outcome } from '../intercept/types'

/**
 * Aegis-Swarm — real-time taint graph and neural execution defense for
 * multi-agent swarms. These types are plain JSON so the orchestrator can run
 * in-process (tests) or behind the Vite API (dashboard) without adapters.
 */

export type AgentId = 'planner' | 'retriever' | 'executor'

export type AgentStatus = 'idle' | 'active' | 'tainted' | 'quarantined' | 'done'

export type SwarmPhase =
  | 'idle'
  | 'planning'
  | 'retrieving'
  | 'analyzing'
  | 'executing'
  | 'held'
  | 'contained'
  | 'resumed'
  | 'complete'
  | 'failed'

export type SwarmEventKind =
  | 'plan'
  | 'fetch'
  | 'analyze'
  | 'propagate'
  | 'propose'
  | 'isolation'
  | 'kernel'
  | 'hold'
  | 'resume'
  | 'complete'
  | 'error'

export interface SwarmEdge {
  from: AgentId
  to: AgentId
  contextId: string
  /** 0..1 share of the edge's payload that is tainted. */
  taint: number
}

export interface ContextItem {
  id: string
  agent: AgentId
  text: string
  origin: string
  trusted: boolean
  /** Context ids this item was derived from. */
  parents: string[]
  /** 0..1 inherited taint at this node. */
  taint: number
  /** 0..1 neural saliency of the item's most suspicious span. */
  saliency: number
  createdAt: number
}

export interface AgentNode {
  id: AgentId
  role: string
  model: string
  status: AgentStatus
  /** 0..100 contamination for this agent. */
  contamination: number
  contextIds: string[]
  lastAction?: string
  quarantinedAt?: string
  quarantineReason?: string
}

export interface SwarmEvent {
  id: string
  at: string
  kind: SwarmEventKind
  agent: AgentId | 'aegis' | 'kernel'
  message: string
  score?: number
}

export interface SaliencySnapshot {
  backend: string
  /** 0..100 swarm-level contamination metric. */
  contamination: number
  /** 0..1 normalized occlusion saliency of the strongest span. */
  saliency: number
  /** 0..1 embedding drift between trusted task context and untrusted content. */
  drift: number
  /** 0..1 share of downstream context derived from untrusted sources. */
  bleed: number
  /** 0..1 intent prior from the semantic archetype layer. */
  intent: number
  /** 0..1 density of imperative/instruction verbs in the top span. */
  imperative: number
  /** 1 when a high-entropy marker is present in the untrusted content. */
  marker: number
  /** 0..1 taint carried into the proposed action. */
  carry: number
  spans: Array<{ text: string; saliency: number; raw: number }>
  tokens: Array<{ token: string; saliency: number }>
  canary?: string
}

export interface KernelRecord {
  toolName: string
  decision: string
  outcome: Outcome
  score: number
  reason?: string
  findings?: Finding[]
}

export interface SwarmHold {
  reason: string
  contamination: number
  agent: AgentId
}

export interface SwarmState {
  runId: string
  task: string
  mode: 'poisoned' | 'benign'
  phase: SwarmPhase
  startedAt: string
  nodes: AgentNode[]
  contexts: ContextItem[]
  edges: SwarmEdge[]
  events: SwarmEvent[]
  contamination: number
  peakContamination: number
  saliency?: SaliencySnapshot
  isolated: AgentId[]
  kernel?: KernelRecord
  hold?: SwarmHold
  result?: string
}
