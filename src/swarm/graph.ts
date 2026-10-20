import type {
  AgentId,
  AgentNode,
  AgentStatus,
  ContextItem,
  SwarmEdge,
  SwarmEvent,
  SwarmEventKind,
  SwarmState,
} from './types'

/**
 * The swarm's provenance graph. Every context item records its parents, so a
 * tainted token can be followed from the agent that fetched it to every agent
 * that later consumed it. Quarantine is a node-local operation: the rest of the
 * swarm keeps its state, which is what makes containment non-destructive.
 */

const AGENTS: Array<Pick<AgentNode, 'id' | 'role' | 'model'>> = [
  { id: 'planner', role: 'Planner', model: 'planner/policy-v3' },
  { id: 'retriever', role: 'Retrieval', model: 'retriever/tool-use' },
  { id: 'executor', role: 'Execution', model: 'executor/tool-use' },
]

function nowIso(): string {
  return new Date().toISOString()
}

export class SwarmGraph {
  readonly state: SwarmState
  private seq = 0

  constructor(task: string, mode: 'poisoned' | 'benign', runId: string) {
    this.state = {
      runId,
      task,
      mode,
      phase: 'idle',
      startedAt: nowIso(),
      nodes: AGENTS.map((agent) => ({
        ...agent,
        status: 'idle',
        contamination: 0,
        contextIds: [],
      })),
      contexts: [],
      edges: [],
      events: [],
      contamination: 0,
      peakContamination: 0,
      isolated: [],
    }
  }

  agent(id: AgentId): AgentNode {
    const node = this.state.nodes.find((n) => n.id === id)
    if (!node) throw new Error(`unknown agent ${id}`)
    return node
  }

  context(id: string): ContextItem | undefined {
    return this.state.contexts.find((c) => c.id === id)
  }

  setPhase(phase: SwarmState['phase']): void {
    this.state.phase = phase
  }

  setStatus(id: AgentId, status: AgentStatus, action?: string): void {
    const node = this.agent(id)
    node.status = status
    if (action) node.lastAction = action
  }

  addContext(input: {
    agent: AgentId
    text: string
    origin: string
    trusted: boolean
    parents?: string[]
    saliency?: number
  }): ContextItem {
    const parents = input.parents ?? []
    let inherited = 0
    for (const parentId of parents) {
      const parent = this.context(parentId)
      if (parent) inherited = Math.max(inherited, parent.taint)
    }
    const taint = input.trusted ? 0 : Math.max(inherited, 1)

    const item: ContextItem = {
      id: `ctx-${++this.seq}`,
      agent: input.agent,
      text: input.text,
      origin: input.origin,
      trusted: input.trusted,
      parents,
      taint,
      saliency: input.saliency ?? 0,
      createdAt: Date.now(),
    }
    this.state.contexts.push(item)
    this.agent(input.agent).contextIds.push(item.id)

    for (const parentId of parents) {
      const parent = this.context(parentId)
      if (!parent) continue
      const edge: SwarmEdge = {
        from: parent.agent,
        to: input.agent,
        contextId: item.id,
        taint: item.taint,
      }
      const duplicate = this.state.edges.some(
        (e) => e.from === edge.from && e.to === edge.to && e.contextId === edge.contextId,
      )
      if (!duplicate) this.state.edges.push(edge)
    }

    this.recompute()
    return item
  }

  setSaliency(contextId: string, saliency: number): void {
    const item = this.context(contextId)
    if (!item) return
    item.saliency = Math.max(0, Math.min(1, saliency))
    this.recompute()
  }

  /** Set the authoritative metric (from the saliency analyzer) and track the peak. */
  setContamination(value: number): void {
    const clamped = Math.max(0, Math.min(100, Math.round(value)))
    this.state.contamination = clamped
    this.state.peakContamination = Math.max(this.state.peakContamination, clamped)
  }

  quarantine(id: AgentId, reason: string): void {
    const node = this.agent(id)
    if (node.status === 'quarantined') return
    node.status = 'quarantined'
    node.quarantinedAt = nowIso()
    node.quarantineReason = reason
    if (!this.state.isolated.includes(id)) this.state.isolated.push(id)
  }

  release(id: AgentId, action?: string): void {
    const node = this.agent(id)
    node.status = 'active'
    node.quarantinedAt = undefined
    node.quarantineReason = undefined
    this.state.isolated = this.state.isolated.filter((agent) => agent !== id)
    if (action) node.lastAction = action
  }

  event(
    kind: SwarmEventKind,
    agent: SwarmEvent['agent'],
    message: string,
    score?: number,
  ): SwarmEvent {
    const event: SwarmEvent = {
      id: `evt-${this.state.events.length + 1}`,
      at: nowIso(),
      kind,
      agent,
      message,
      score,
    }
    this.state.events.push(event)
    return event
  }

  /** Per-agent contamination = worst tainted item, discounted by saliency. */
  recompute(): void {
    for (const node of this.state.nodes) {
      let worst = 0
      for (const contextId of node.contextIds) {
        const item = this.context(contextId)
        if (!item || item.taint <= 0) continue
        const value = 100 * item.taint * (0.55 + 0.45 * item.saliency)
        worst = Math.max(worst, value)
      }
      node.contamination = Math.round(worst)
    }
  }

  snapshot(): SwarmState {
    return structuredClone(this.state)
  }
}
