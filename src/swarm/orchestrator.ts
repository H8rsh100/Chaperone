import { adjudicate, type Adjudication } from '../intercept/adjudicate'
import type {
  AuditRecord,
  PendingToolCall,
  ReviewResolution,
  ToolCallHandler,
} from '../intercept/types'
import type { Verdict } from '../lib/inspect'
import { fixtureFor, SWARM_TASK, CANARY } from './fixtures'
import { SwarmGraph } from './graph'
import { analyzeSaliency, withCarry, type Embedder } from './saliency'
import type { AgentId, SwarmState } from './types'

/**
 * Aegis-Swarm orchestrator.
 *
 * Planner → Retrieval → Execution. Every tool call still crosses the Chaperone
 * kernel (`adjudicate`). Aegis visualizes context lineage and embedding-based
 * analysis, then marks the executor isolated when the kernel reports taint carry.
 */

export interface IsolationHoldRequest {
  runId: string
  agent: AgentId
  reason: string
  contamination: number
  canary?: string
  verdict: Verdict
}

export interface SwarmDeps {
  inspect: (
    call: PendingToolCall,
  ) =>
    | { toolCall: import('../lib/inspect').ToolCall; verdict: Verdict }
    | Promise<{ toolCall: import('../lib/inspect').ToolCall; verdict: Verdict }>
  onReview: ToolCallHandler
  executeTool: (name: string, input: Record<string, unknown>) => Promise<unknown>
  /** Human hold for containment. Omitted in tests that do not exercise it. */
  hold?: (request: IsolationHoldRequest) => Promise<ReviewResolution>
  onAudit?: (record: AuditRecord) => void
  onState?: (state: SwarmState) => void
  embed?: Embedder
  backend?: string
}

export interface SwarmRunInput {
  mode: 'poisoned' | 'benign'
  task?: string
  runId?: string
}

function summarize(input: Record<string, unknown>): string {
  if (typeof input.command === 'string') return input.command.slice(0, 160)
  if (typeof input.url === 'string') {
    return `HTTP ${String(input.method ?? 'GET')} ${input.url}`.slice(0, 160)
  }
  return JSON.stringify(input).slice(0, 160)
}

function auditOf(pending: PendingToolCall, result: Adjudication): AuditRecord {
  return {
    id: `${pending.id}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    toolName: pending.toolName,
    inputSummary: summarize(pending.input),
    riskScore: result.verdict.score,
    riskLevel: result.verdict.level,
    decision: result.decision,
    decidedBy: result.decidedBy,
    findings: result.verdict.findings,
    finalDecision: result.decision,
    outcome: result.outcome,
    reason: result.reason,
  }
}

export async function runAegisSwarm(
  input: SwarmRunInput,
  deps: SwarmDeps,
): Promise<SwarmState> {
  const task = input.task ?? SWARM_TASK
  const runId = input.runId ?? `aegis-${Date.now().toString(36)}`
  const fixture = fixtureFor(input.mode)

  const graph = new SwarmGraph(task, input.mode, runId)
  const publish = () => deps.onState?.(graph.snapshot())

  // ── planner ──────────────────────────────────────────────────────────────
  graph.setPhase('planning')
  graph.setStatus('planner', 'active', 'draft plan')
  graph.event('plan', 'planner', `Plan: retrieve the vendor notes, then confirm the deployment.`)
  const planText = `Task: ${task}\nPlan: 1) fetch ${fixture.url}  2) summarize  3) confirm deployment.`
  const plan = graph.addContext({
    agent: 'planner',
    text: planText,
    origin: 'operator',
    trusted: true,
  })
  graph.setStatus('planner', 'done', 'plan published')
  graph.event('propagate', 'retriever', 'Trusted plan handed to the retrieval agent')
  publish()

  // ── retrieval (real tool call through the kernel) ────────────────────────
  graph.setPhase('retrieving')
  graph.setStatus('retriever', 'active', 'http_fetch')
  const fetchPending: PendingToolCall = {
    id: `swarm-fetch-${runId}`,
    toolName: 'http_fetch',
    input: { url: fixture.url, method: 'GET' },
    rawBlock: { type: 'aegis_tool_use', agent: 'retriever', name: 'http_fetch' },
  }
  const fetched = await adjudicate(fetchPending, deps)
  deps.onAudit?.(auditOf(fetchPending, fetched))

  if (fetched.outcome !== 'executed') {
    graph.setPhase('failed')
    graph.event('error', 'retriever', `Retrieval did not execute: ${fetched.outcome}`, fetched.verdict.score)
    graph.state.kernel = {
      toolName: 'http_fetch',
      decision: fetched.decision,
      outcome: fetched.outcome,
      score: fetched.verdict.score,
      reason: fetched.reason,
      findings: fetched.verdict.findings,
    }
    graph.state.result = 'Retrieval failed; the swarm never reached the executor.'
    publish()
    return graph.snapshot()
  }

  const body =
    fetched.result && typeof fetched.result === 'object'
      ? String((fetched.result as { body?: unknown }).body ?? fixture.page)
      : fixture.page
  const page = body.slice(0, 4000)
  graph.setStatus('retriever', 'done', 'http_fetch executed')
  graph.event('fetch', 'retriever', `Retrieved ${fixture.url} (${page.length} chars)`, 0)

  const retrieved = graph.addContext({
    agent: 'retriever',
    text: page,
    origin: fixture.url,
    trusted: false,
    parents: [plan.id],
  })

  // ── neural analysis ─────────────────────────────────────────────────────
  graph.setPhase('analyzing')
  const bleed = Math.max(0.2, Math.min(1, page.length / (page.length + planText.length)))
  const saliency = await analyzeSaliency({
    trusted: planText,
    untrusted: page,
    bleed,
    carry: 0,
    canary: input.mode === 'poisoned' ? CANARY : undefined,
    embed: deps.embed,
    backend: deps.backend,
  })
  graph.setSaliency(retrieved.id, saliency.saliency)
  graph.state.saliency = saliency
  graph.setContamination(saliency.contamination)
  graph.event(
    'analyze',
    'aegis',
    `Saliency ${Math.round(saliency.saliency * 100)}% · drift ${Math.round(
      saliency.drift * 100,
    )}% · ${saliency.backend} → contamination ${saliency.contamination}%`,
    saliency.contamination,
  )
  publish()

  // ── propagate into the executor window ─────────────────────────────────
  const executorCtx = graph.addContext({
    agent: 'executor',
    text: page,
    origin: fixture.url,
    trusted: false,
    parents: [retrieved.id],
    saliency: saliency.saliency,
  })
  graph.event(
    'propagate',
    'executor',
    `Untrusted context crossed the retriever → executor boundary (${saliency.contamination}% contamination)`,
    saliency.contamination,
  )
  publish()

  // ── execution proposal (kernel-gated) ───────────────────────────────────
  graph.setPhase('executing')
  graph.setStatus('executor', 'active', fixture.command)
  graph.event('propose', 'executor', `Proposed call: ${fixture.command}`, saliency.contamination)

  const execPending: PendingToolCall = {
    id: `swarm-exec-${runId}`,
    toolName: 'shell_command',
    input: { command: fixture.command },
    rawBlock: { type: 'aegis_tool_use', agent: 'executor', name: 'shell_command' },
  }
  const executed = await adjudicate(execPending, deps)
  deps.onAudit?.(auditOf(execPending, executed))

  graph.state.kernel = {
    toolName: 'shell_command',
    decision: executed.decision,
    outcome: executed.outcome,
    score: executed.verdict.score,
    reason: executed.reason,
    findings: executed.verdict.findings,
  }
  graph.event(
    'kernel',
    'kernel',
    `Chaperone ${executed.outcome} · score ${executed.verdict.score}${
      executed.reason ? ` · ${executed.reason.slice(0, 120)}` : ''
    }`,
    executed.verdict.score,
  )

  const taint = executed.verdict.findings.find((f) => f.id === 'taint-flow')
  const carry = taint?.evidence?.confidence ?? (taint ? 0.85 : 0)
  const evolved = withCarry(saliency, carry, bleed)
  graph.state.saliency = evolved
  graph.setContamination(Math.max(evolved.contamination, saliency.contamination))
  if (carry > 0) {
    graph.event(
      'analyze',
      'aegis',
      `Taint carry-over ${Math.round(carry * 100)}% → contamination ${evolved.contamination}%`,
      evolved.contamination,
    )
  }

  // The circuit breaker is provenance, not a fuzzy score: isolate when a value
  // from untrusted context demonstrably reaches the sink.
  const shouldIsolate = carry >= 0.5
  if (!shouldIsolate) {
    if (executed.outcome !== 'executed') {
      graph.setStatus('executor', 'idle', `action ${executed.outcome}`)
      graph.setPhase('failed')
      graph.state.result = `Executor action did not complete: ${executed.outcome}.`
      graph.event('error', 'executor', graph.state.result, executed.verdict.score)
      publish()
      return graph.snapshot()
    }
    graph.setStatus('executor', 'done', 'executed')
    graph.setPhase('complete')
    graph.state.result = `Executor ran ${fixture.command}; no isolation was triggered.`
    graph.event('complete', 'aegis', 'Swarm completed without isolation', evolved.contamination)
    publish()
    return graph.snapshot()
  }

  // ── circuit breaker ─────────────────────────────────────────────────────
  const reason =
    'An untrusted retrieval value crossed into a shell command. The executor is isolated; its tainted lineage is frozen.'
  graph.quarantine('executor', reason)
  graph.event(
    'isolation',
    'aegis',
    `Carry-over ${Math.round(carry * 100)}% · contamination ${
      evolved.contamination
    }%. Executor isolated; planner and retriever state preserved.`,
    evolved.contamination,
  )
  graph.setPhase('held')
  graph.state.hold = { reason, contamination: evolved.contamination, agent: 'executor' }
  graph.event(
    'hold',
    'aegis',
    'Human hold opened: confirm containment to resume on a sanitized context, or the gate fails closed.',
    evolved.contamination,
  )
  publish()

  const holdVerdict: Verdict = {
    level: evolved.contamination >= 75 ? 'critical' : 'high',
    score: evolved.contamination,
    findings: executed.verdict.findings,
    recommendation: 'review',
    headline: 'Aegis isolated an agent. Confirm containment to resume the swarm.',
  }

  const resolution = deps.hold
    ? await deps.hold({
        runId,
        agent: 'executor',
        reason,
        contamination: evolved.contamination,
        canary: input.mode === 'poisoned' ? CANARY : undefined,
        verdict: holdVerdict,
      })
    : { decision: 'deny' as const, decidedBy: 'auto' as const, reason: 'no human hold handler' }

  deps.onAudit?.({
    id: `aegis-hold-${runId}`,
    timestamp: new Date().toISOString(),
    toolName: 'swarm_quarantine',
    inputSummary: `executor isolation · ${evolved.contamination}% contamination`,
    riskScore: evolved.contamination,
    riskLevel: holdVerdict.level,
    decision: resolution.decision,
    decidedBy: resolution.decidedBy,
    finalDecision: resolution.decision,
    outcome:
      resolution.decision === 'allow'
        ? 'executed'
        : resolution.decidedBy === 'auto'
          ? 'failed_closed'
          : 'denied_by_human',
    reason: resolution.reason ?? reason,
    findings: holdVerdict.findings,
  })

  if (resolution.decision === 'deny') {
    graph.setPhase('contained')
    graph.state.result =
      resolution.decidedBy === 'auto'
        ? 'No operator response. Fail-closed: the executor stays isolated; its prior context remains visible in the graph.'
        : 'Operator kept the executor isolated; prior context remains visible in the graph.'
    graph.event('complete', 'aegis', graph.state.result, evolved.contamination)
    publish()
    return graph.snapshot()
  }

  // ── sanitized resume ────────────────────────────────────────────────────
  graph.release('executor', 'sanitized context granted')
  const sanitized = graph.addContext({
    agent: 'executor',
    text: `Sanitized task: ${task}\nExternal directives were stripped.`,
    origin: 'aegis-sanitizer',
    trusted: true,
  })
  graph.setSaliency(executorCtx.id, 0)
  graph.setContamination(Math.min(15, evolved.contamination))
  graph.event(
    'resume',
    'executor',
    `Operator confirmed containment. Replacement context ${sanitized.id} granted for the fixed safe action.`,
  )

  const safePending: PendingToolCall = {
    id: `swarm-safe-${runId}`,
    toolName: 'shell_command',
    input: { command: 'echo swarm-ok' },
    rawBlock: { type: 'aegis_tool_use', agent: 'executor', name: 'shell_command' },
  }
  const safe = await adjudicate(safePending, deps)
  deps.onAudit?.(auditOf(safePending, safe))
  graph.event(
    'kernel',
    'kernel',
    `Sanitized action ${safe.outcome} · score ${safe.verdict.score}`,
    safe.verdict.score,
  )

  if (safe.outcome !== 'executed') {
    graph.state.kernel = {
      toolName: safePending.toolName,
      decision: safe.decision,
      outcome: safe.outcome,
      score: safe.verdict.score,
      reason: safe.reason,
      findings: safe.verdict.findings,
    }
    graph.setStatus('executor', 'idle', `sanitized action ${safe.outcome}`)
    graph.setPhase('failed')
    graph.state.result = `Sanitized action did not complete: ${safe.outcome}.`
    graph.event('error', 'executor', graph.state.result, safe.verdict.score)
    publish()
    return graph.snapshot()
  }

  graph.setStatus('executor', 'done', 'sanitized resume executed')
  graph.setPhase('complete')
  graph.state.result =
    'Operator released the executor with replacement context for the fixed safe action. Earlier context remains visible in the graph.'
  graph.event('complete', 'aegis', 'Replacement action executed; earlier context remains in the graph', 0)
  publish()
  return graph.snapshot()
}
