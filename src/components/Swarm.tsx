import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Finding } from '../lib/inspect'
import type { AgentId, AgentNode, SwarmEvent, SwarmState } from '../swarm/types'
import { setFluid } from '../visual/state'
import './Swarm.css'

type Props = {
  onBack: () => void
  onKernel: () => void
}

type Snapshot = { state: SwarmState | null; running: boolean }

type HoldPending = {
  call: { id: string; toolName: string; input: Record<string, unknown> }
  verdict: { score: number; level: string; headline: string }
  createdAt: string
  expiresAt?: string
  timeoutMs?: number
  decisionToken?: string
}

const DEFAULT_NODES: AgentNode[] = [
  {
    id: 'planner',
    role: 'Planner',
    model: 'planner/policy-v3',
    status: 'idle',
    contamination: 0,
    contextIds: [],
  },
  {
    id: 'retriever',
    role: 'Retrieval',
    model: 'retriever/tool-use',
    status: 'idle',
    contamination: 0,
    contextIds: [],
  },
  {
    id: 'executor',
    role: 'Execution',
    model: 'executor/tool-use',
    status: 'idle',
    contamination: 0,
    contextIds: [],
  },
]

const PHASE_LABEL: Record<SwarmState['phase'], string> = {
  idle: 'IDLE',
  planning: 'PLANNING',
  retrieving: 'RETRIEVING',
  analyzing: 'ANALYZING',
  executing: 'EXECUTING',
  held: 'CONTAINMENT HOLD',
  contained: 'CONTAINED',
  resumed: 'RESUMED',
  complete: 'COMPLETE',
  failed: 'FAILED',
}

const STATUS_LABEL: Record<AgentNode['status'], string> = {
  idle: 'idle',
  active: 'active',
  tainted: 'tainted',
  quarantined: 'isolated',
  done: 'done',
}

const FINDING_LABEL: Record<string, string> = {
  'taint-flow': 'Taint Sentinel',
  'semantic-injection': 'Semantic',
  'onnx-semantic': 'ONNX Semantic',
}

const EVENT_LABEL: Record<SwarmEvent['kind'], string> = {
  plan: 'PLAN',
  fetch: 'FETCH',
  analyze: 'ANALYZE',
  propagate: 'PROPAGATE',
  propose: 'PROPOSE',
  isolation: 'ISOLATE',
  kernel: 'KERNEL',
  hold: 'HOLD',
  resume: 'RESUME',
  complete: 'DONE',
  error: 'ERROR',
}

function clock(iso: string): string {
  return iso.length >= 19 ? iso.slice(11, 19) : iso
}

function toneFor(value: number): 'low' | 'mid' | 'high' {
  if (value >= 65) return 'high'
  if (value >= 35) return 'mid'
  return 'low'
}

function MarkCanary({ text, canary }: { text: string; canary?: string }) {
  if (!canary) return <>{text}</>
  const at = text.toLowerCase().indexOf(canary.toLowerCase())
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark className="swarm__hit">{text.slice(at, at + canary.length)}</mark>
      {text.slice(at + canary.length)}
    </>
  )
}

function ContaminationRing({ value, peak }: { value: number; peak: number }) {
  const tone = toneFor(value)
  return (
    <div className={`swarm__ring-wrap swarm__ring-wrap--${tone}`}>
      <div className="swarm__ring" style={{ '--p': value } as CSSProperties}>
        <div className="swarm__ring-inner">
          <strong>{value}</strong>
          <span className="mono">%</span>
        </div>
      </div>
      <div className="swarm__ring-meta">
        <span className="swarm__ring-label mono">SWARM CONTAMINATION</span>
        <span className="swarm__ring-peak mono">peak {peak}% · isolate on taint carry</span>
        <span className={`swarm__ring-verdict swarm__ring-verdict--${tone}`}>
          {value >= 65
            ? 'tainted lineage isolated'
            : value >= 35
              ? 'untrusted context present'
              : 'context clean'}
        </span>
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string
  value: number
  hint?: string
}) {
  const pct = Math.round(value * 100)
  return (
    <div className="swarm__metric">
      <div className="swarm__metric-top">
        <span className="swarm__metric-label">{label}</span>
        <span className={`swarm__metric-value mono swarm__metric-value--${toneFor(pct)}`}>
          {pct}%
        </span>
      </div>
      <div className="swarm__metric-track">
        <span
          className={`swarm__metric-fill swarm__metric-fill--${toneFor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {hint && <span className="swarm__metric-hint">{hint}</span>}
    </div>
  )
}

export function Swarm({ onBack, onKernel }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ state: null, running: false })
  const [pending, setPending] = useState<HoldPending | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const logRef = useRef<HTMLDivElement>(null)

  const state = snapshot.state
  const running = snapshot.running
  const nodes = state?.nodes ?? DEFAULT_NODES
  const phase = state?.phase ?? 'idle'
  const contamination = state?.contamination ?? 0
  const peak = state?.peakContamination ?? 0
  const saliency = state?.saliency
  const held = phase === 'held' && running

  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const res = await fetch('/api/swarm/state')
        if (!res.ok) throw new Error(`state ${res.status}`)
        const data = (await res.json()) as Snapshot
        if (!alive) return
        setSnapshot(data)
        setError('')

        if (data.state?.phase === 'held' && data.running) {
          const p = await fetch('/api/chaperone/pending')
          const pd = (await p.json()) as { pending?: HoldPending[] }
          if (!alive) return
          setPending(
            pd.pending?.find((item) => item.call.toolName === 'swarm_quarantine') ?? null,
          )
        } else {
          setPending(null)
        }
      } catch {
        if (alive) setError('Cannot reach the swarm API. Start it with `npm run dev`.')
      }
    }
    void tick()
    const timer = window.setInterval(() => void tick(), 500)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const mode =
      contamination >= 65 ? 'deny' : contamination >= 35 ? 'review' : 'allow'
    setFluid({ mode, risk: Math.min(1, contamination / 100), field: 1, surface: 'gate' })
  }, [contamination])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [state?.events.length])

  const secondsLeft = pending?.expiresAt
    ? Math.max(0, Math.ceil((new Date(pending.expiresAt).getTime() - now) / 1000))
    : null

  const start = async (mode: 'poisoned' | 'benign') => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/swarm/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? `run ${res.status}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const decide = async (decision: 'allow' | 'deny') => {
    if (!pending) return
    setBusy(true)
    try {
      await fetch('/api/chaperone/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: pending.call.id,
          decision,
          token: pending.decisionToken,
        }),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const edgeOf = (from: AgentId, to: AgentId) =>
    state?.edges.find((e) => e.from === from && e.to === to)

  const topSpan = saliency?.spans[0]
  const kernel = state?.kernel
  const resultTone =
    phase === 'contained'
      ? 'high'
      : phase === 'complete'
        ? 'low'
        : phase === 'failed'
          ? 'mid'
          : 'mid'

  const tokenHeat = useMemo(() => saliency?.tokens.slice(0, 14) ?? [], [saliency])

  return (
    <section className="swarm" aria-label="Aegis swarm defense">
      <nav className="swarm__nav">
        <button type="button" className="swarm__back" onClick={onBack}>
          <span className="swarm__back-arrow">&larr;</span>
          Home
        </button>
        <span className="swarm__logo mono">AEGIS // SWARM</span>
        <div className="swarm__nav-status">
          <span
            className={`swarm__nav-dot${running ? ' swarm__nav-dot--live' : ''}`}
            aria-hidden
          />
          <span className="mono">
            {running ? 'SWARM LIVE' : 'CONTROL PLANE'} · {phase.toUpperCase()}
          </span>
          <button type="button" className="swarm__kernel-link" onClick={onKernel}>
            Chaperone kernel &rarr;
          </button>
        </div>
      </nav>

      <header className="swarm__header">
        <div>
          <p className="swarm__kicker mono">REAL-TIME TAINT GRAPH · NEURAL EXECUTION DEFENSE</p>
          <h1 className="swarm__title">
            Three agents. One poisoned page. <em>Zero</em> unapproved execution.
          </h1>
          <p className="swarm__sub">
            Aegis watches provenance across the swarm, scores untrusted context with an
            embedding model, and isolates the agent — not the whole run — before the
            dangerous call reaches the kernel.
          </p>
        </div>

        <div className="swarm__controls">
          <button
            type="button"
            className="swarm__btn swarm__btn--danger"
            disabled={running || busy}
            onClick={() => void start('poisoned')}
          >
            Launch poisoned swarm
          </button>
          <button
            type="button"
            className="swarm__btn swarm__btn--safe"
            disabled={running || busy}
            onClick={() => void start('benign')}
          >
            Run clean control
          </button>
          <span className="swarm__controls-note mono">
            {running
              ? 'agent graph streaming…'
              : state
                ? `last run ${state.runId}`
                : 'no run yet — launch to begin'}
          </span>
        </div>
      </header>

      {error && (
        <div className="swarm__error" role="alert">
          {error}
        </div>
      )}

      <div className="swarm__layout">
        <div className="swarm__col swarm__col--graph">
          <div className="swarm__card swarm__card--stage">
            <div className="swarm__card-head">
              <div>
                <p className="swarm__card-title">Agent provenance graph</p>
                <p className="swarm__card-note">
                  planner → retrieval → execution · live taint on every edge
                </p>
              </div>
              <span
                className={`swarm__phase swarm__phase--${phase}`}
                aria-live="polite"
              >
                {PHASE_LABEL[phase]}
              </span>
            </div>

            <div className="swarm__graph">
              {nodes.map((node, i) => {
                const prev = i > 0 ? nodes[i - 1] : null
                const edge = prev ? edgeOf(prev.id, node.id) : undefined
                const tainted = !!edge && edge.taint > 0
                return (
                  <div className="swarm__graph-seg" key={node.id}>
                    {prev && (
                      <div
                        className={`swarm__link${tainted ? ' swarm__link--tainted' : ''}`}
                      >
                        <span className="swarm__link-label mono">
                          {tainted ? 'untrusted' : edge ? 'trusted' : '—'}
                        </span>
                        <span className="swarm__link-line">
                          <span className="swarm__link-dot" />
                        </span>
                      </div>
                    )}
                    <article
                      className={`swarm__node swarm__node--${node.status}`}
                      aria-label={`${node.role} agent, ${node.contamination}% contaminated`}
                    >
                      <div className="swarm__node-head">
                        <span className="swarm__node-role">{node.role}</span>
                        <span
                          className={`swarm__node-status swarm__node-status--${node.status}`}
                        >
                          {STATUS_LABEL[node.status]}
                        </span>
                      </div>
                      <span className="swarm__node-model mono">{node.model}</span>
                      <div className="swarm__node-track">
                        <span
                          className={`swarm__node-fill swarm__node-fill--${toneFor(
                            node.contamination,
                          )}`}
                          style={{ width: `${node.contamination}%` }}
                        />
                      </div>
                      <div className="swarm__node-meta">
                        <span className="mono">{node.contamination}% taint</span>
                        <span className="swarm__node-action">
                          {node.status === 'quarantined'
                            ? 'frozen — state preserved'
                            : node.lastAction ?? 'waiting'}
                        </span>
                      </div>
                      {node.status === 'quarantined' && (
                        <div className="swarm__node-lock mono">
                          ISOLATED · lineage frozen
                        </div>
                      )}
                    </article>
                  </div>
                )
              })}
            </div>

            <div className="swarm__stage-foot">
              <ContaminationRing value={contamination} peak={peak} />
              <div className="swarm__counts">
                <div className="swarm__count">
                  <span className="swarm__count-value mono">
                    {state?.contexts.length ?? 0}
                  </span>
                  <span className="swarm__count-label">context items</span>
                </div>
                <div className="swarm__count">
                  <span className="swarm__count-value mono">
                    {state?.edges.length ?? 0}
                  </span>
                  <span className="swarm__count-label">taint edges</span>
                </div>
                <div className="swarm__count">
                  <span className="swarm__count-value mono">
                    {state?.isolated.length ?? 0}
                  </span>
                  <span className="swarm__count-label">agents isolated</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="swarm__col swarm__col--inspect">
          <div className="swarm__card">
            <div className="swarm__card-head">
              <div>
                <p className="swarm__card-title">Neural provenance analysis</p>
                <p className="swarm__card-note">
                  occlusion saliency · embedding drift · taint carry-over
                </p>
              </div>
              <span className="swarm__backend mono">
                {saliency?.backend ?? 'awaiting context'}
              </span>
            </div>

            {saliency ? (
              <>
                <div className="swarm__span">
                  <span className="swarm__span-label mono">
                    MOST SUSPICIOUS SPAN
                    {topSpan ? ` · ${Math.round(topSpan.saliency * 100)}%` : ''}
                  </span>
                  <p className="swarm__span-text">
                    <MarkCanary
                      text={topSpan?.text ?? 'No span cleared the analysis threshold.'}
                      canary={saliency.canary}
                    />
                  </p>
                </div>

                <div className="swarm__metrics">
                  <Metric
                    label="Occlusion saliency"
                    value={saliency.saliency}
                    hint="drop in evidence when the span is removed"
                  />
                  <Metric
                    label="Embedding drift"
                    value={saliency.drift}
                    hint="distance from the trusted task context"
                  />
                  <Metric
                    label="Context bleed"
                    value={saliency.bleed}
                    hint="share of downstream context from untrusted sources"
                  />
                  <Metric
                    label="Marker signal"
                    value={saliency.marker}
                    hint="high-entropy value present in untrusted content"
                  />
                  <Metric
                    label="Taint carry-over"
                    value={saliency.carry}
                    hint="untrusted value reappears in the proposed action"
                  />
                </div>

                <div className="swarm__tokens">
                  <span className="swarm__tokens-label mono">TOKEN SALIENCY</span>
                  <div className="swarm__token-row">
                    {tokenHeat.map((t) => (
                      <span
                        key={t.token}
                        className="swarm__token"
                        style={{
                          backgroundColor: `rgba(255, 82, 82, ${(
                            0.08 +
                            t.saliency * 0.5
                          ).toFixed(3)})`,
                        }}
                      >
                        {t.token}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="swarm__empty">
                No analysis yet. The retriever must fetch untrusted content before Aegis can
                score it.
              </p>
            )}
          </div>

          <div className="swarm__card">
            <div className="swarm__card-head">
              <div>
                <p className="swarm__card-title">Chaperone kernel</p>
                <p className="swarm__card-note">fail-closed gate on the executor's call</p>
              </div>
              {kernel && (
                <span className={`swarm__kernel-badge swarm__kernel-badge--${kernel.outcome}`}>
                  {kernel.outcome}
                </span>
              )}
            </div>

            {kernel ? (
              <>
                <div className="swarm__kernel-row">
                  <span className="swarm__kernel-tool mono">{kernel.toolName}</span>
                  <span className={`swarm__kernel-score swarm__kernel-score--${toneFor(kernel.score)}`}>
                    {kernel.score}
                  </span>
                </div>
                <p className="swarm__kernel-reason">{kernel.reason}</p>
                {kernel.findings && kernel.findings.length > 0 && (
                  <div className="swarm__kernel-findings">
                    {kernel.findings.map((f: Finding) => (
                      <span
                        key={f.id}
                        className="swarm__finding"
                        title={f.detail}
                      >
                        <span className="swarm__finding-tag mono">
                          {FINDING_LABEL[f.id] ?? 'Rule'}
                        </span>
                        {f.title}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="swarm__empty">
                Nothing has reached the gate yet. The kernel sees only the final call; Aegis
                supplies the provenance it cannot see.
              </p>
            )}
          </div>
        </div>

        <div className="swarm__col swarm__col--log">
          {held && (
            <div className="swarm__card swarm__card--hold" role="alert" aria-live="assertive">
              <div className="swarm__hold-head">
                <span className="swarm__hold-kicker mono">CONTAINMENT HOLD</span>
                {secondsLeft !== null && (
                  <span
                    className={`swarm__hold-timer mono${
                      secondsLeft <= 3 ? ' swarm__hold-timer--urgent' : ''
                    }`}
                  >
                    {secondsLeft}s
                  </span>
                )}
              </div>
              <p className="swarm__hold-title">
                The executor is isolated. The rest of the swarm keeps its state.
              </p>
              <p className="swarm__hold-note">
                Confirm containment to resume on a sanitized context, or leave it frozen.
                No response fails closed.
              </p>
              {state?.hold?.reason && (
                <p className="swarm__hold-reason">{state.hold.reason}</p>
              )}
              <div className="swarm__hold-meta mono">
                <span>{state?.hold?.contamination ?? 0}% contamination</span>
                <span>agent {state?.hold?.agent}</span>
                {saliency?.canary && <span>canary {saliency.canary}</span>}
              </div>
              <div className="swarm__hold-actions">
                <button
                  type="button"
                  className="swarm__btn swarm__btn--danger"
                  disabled={busy || !pending}
                  onClick={() => void decide('deny')}
                >
                  Keep isolated
                </button>
                <button
                  type="button"
                  className="swarm__btn swarm__btn--safe"
                  disabled={busy || !pending}
                  onClick={() => void decide('allow')}
                >
                  Sanitize &amp; resume
                </button>
              </div>
              {!pending && (
                <p className="swarm__hold-wait mono">opening the human review channel…</p>
              )}
            </div>
          )}

          {!held && state?.result && (
            <div className={`swarm__card swarm__card--result swarm__card--result-${resultTone}`}>
              <span className={`swarm__phase swarm__phase--${phase}`}>{PHASE_LABEL[phase]}</span>
              <p className="swarm__result-title">
                {phase === 'contained'
                  ? 'Contained. Tainted lineage discarded.'
                  : phase === 'complete'
                    ? 'Swarm complete.'
                    : 'Run ended.'}
              </p>
              <p className="swarm__result-text">{state.result}</p>
              <p className="swarm__result-note mono">
                {state.isolated.length > 0
                  ? `isolated: ${state.isolated.join(', ')} · peak ${state.peakContamination}%`
                  : `no isolation · peak ${state.peakContamination}%`}
              </p>
            </div>
          )}

          <div className="swarm__card swarm__card--log">
            <div className="swarm__card-head">
              <div>
                <p className="swarm__card-title">Event stream</p>
                <p className="swarm__card-note">append-only · mirrored into the ledger</p>
              </div>
              <span className="swarm__backend mono">{state?.events.length ?? 0}</span>
            </div>
            <div className="swarm__log" ref={logRef} aria-live="polite">
              {state?.events.length ? (
                state.events.map((event) => (
                  <div key={event.id} className={`swarm__event swarm__event--${event.kind}`}>
                    <div className="swarm__event-top">
                      <span className="swarm__event-time mono">{clock(event.at)}</span>
                      <span className={`swarm__event-kind swarm__event-kind--${event.kind} mono`}>
                        {EVENT_LABEL[event.kind]}
                      </span>
                      <span className="swarm__event-agent mono">{event.agent}</span>
                      {typeof event.score === 'number' && (
                        <span className="swarm__event-score mono">{event.score}</span>
                      )}
                    </div>
                    <p className="swarm__event-msg">{event.message}</p>
                  </div>
                ))
              ) : (
                <p className="swarm__empty">
                  Launch a run to stream planning, retrieval, analysis, isolation, and kernel
                  decisions.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
