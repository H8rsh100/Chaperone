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

function ContaminationRing({ value, peak, analyzed, isolated, available }: { value: number; peak: number; analyzed: boolean; isolated: boolean; available: boolean }) {
  const tone = toneFor(value)
  return (
    <div className={`swarm__ring-wrap swarm__ring-wrap--${tone}`}>
      <div className="swarm__ring" style={{ '--p': value } as CSSProperties}>
        <div className="swarm__ring-inner">
          <strong>{available ? value : '—'}</strong>
          {available && <span className="mono">%</span>}
        </div>
      </div>
      <div className="swarm__ring-meta">
        <span className="swarm__ring-label mono">SWARM CONTAMINATION</span>
        <span className="swarm__ring-peak mono">{available ? `peak ${peak}% · composite estimate` : 'composite estimate · awaiting run'}</span>
        <span className={`swarm__ring-verdict swarm__ring-verdict--${tone}`}>
          {isolated
            ? 'executor isolated'
            : !analyzed
              ? 'awaiting analysis'
              : value >= 65
            ? 'elevated contamination estimate'
            : value >= 35
              ? 'untrusted context present'
              : 'low contamination estimate'}
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
  const [pendingHold, setPendingHold] = useState<{ runId: string; item: HoldPending } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [decisionError, setDecisionError] = useState('')
  const logRef = useRef<HTMLDivElement>(null)
  const pendingVersion = useRef(0)

  const state = snapshot.state
  const running = snapshot.running
  const nodes = state?.nodes ?? DEFAULT_NODES
  const phase = state?.phase ?? 'idle'
  const contamination = state?.contamination ?? 0
  const peak = state?.peakContamination ?? 0
  const saliency = state?.saliency
  const held = phase === 'held' && running
  const pending = held && pendingHold && pendingHold.runId === state?.runId ? pendingHold.item : null

  useEffect(() => {
    let alive = true
    let polling = false
    const tick = async () => {
      if (polling) return
      polling = true
      const version = pendingVersion.current
      try {
        const res = await fetch('/api/swarm/state')
        if (!res.ok) throw new Error(`state ${res.status}`)
        const data = (await res.json()) as Snapshot
        if (!alive) return
        setSnapshot(data)

        if (data.state?.phase === 'held' && data.running) {
          const p = await fetch('/api/chaperone/pending')
          if (!p.ok) throw new Error(`pending ${p.status}`)
          const pd = (await p.json()) as { pending?: HoldPending[] }
          if (!alive) return
          if (version === pendingVersion.current) {
            const item = pd.pending?.find(
              (candidate) => candidate.call.toolName === 'swarm_quarantine' &&
                candidate.call.input.runId === data.state?.runId,
            )
            setPendingHold(item ? { runId: data.state.runId, item } : null)
          }
        } else {
          setPendingHold(null)
        }
        setError('')
      } catch {
        if (alive) {
          setPendingHold(null)
          setError('Cannot reach the swarm API. Start it with `npm run dev`.')
        }
      } finally {
        polling = false
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
  const approvalReady = !!pending && (secondsLeft === null || secondsLeft > 0)

  const start = async (mode: 'poisoned' | 'benign') => {
    setBusy(true)
    setError('')
    setDecisionError('')
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
    if (!pending || (pending.expiresAt && new Date(pending.expiresAt).getTime() <= Date.now())) return
    pendingVersion.current++
    setPendingHold(null)
    setBusy(true)
    setDecisionError('')
    try {
      const res = await fetch('/api/chaperone/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: pending.call.id,
          decision,
          token: pending.decisionToken,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `Decision request failed (${res.status})`)
      }
    } catch (err) {
      setDecisionError(err instanceof Error ? err.message : String(err))
    } finally {
      pendingVersion.current++
      setPendingHold(null)
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
    <section className={`swarm${held ? ' swarm--held' : ''}`} aria-label="Chaperone live lab">
      <nav className="swarm__nav">
        <button type="button" className="swarm__back" onClick={onBack}>
          <span className="swarm__back-arrow">&larr;</span>
          Home
        </button>
        <span className="swarm__logo mono">CHAPERONE <span>// LIVE LAB</span></span>
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
          <p className="swarm__kicker mono">LIVE LAB / SCRIPTED THREE-ROLE DEMO</p>
          <h1 className="swarm__title">
            Follow the signal.<br /><em>Guard the boundary.</em>
          </h1>
          <p className="swarm__sub">
            Watch a scripted planner, retriever, and executor encounter a clean or poisoned page.
            Model analysis highlights evidence; the kernel gates the proposed call. On a hold,
            a human decides whether the isolated executor can resume on sanitized context.
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
              ? 'demo sequence streaming…'
              : state
                ? 'last run recorded'
                : 'no run yet — launch to begin'}
          </span>
        </div>
      </header>

      {error && (
        <div className="swarm__error" role="alert">
          {error}
        </div>
      )}

      <div className="swarm__announcement" role="alert" aria-atomic="true">
        {held ? 'Executor isolated. Human decision required. The hold expires and fails closed without a response.' : ''}
      </div>

      <div className="swarm__layout">
        <div className="swarm__col swarm__col--decision">
          {held && (
            <div className="swarm__card swarm__card--hold" role="region" aria-label="Human containment hold">
              <div className="swarm__hold-head">
                <span className="swarm__hold-kicker mono">HUMAN DECISION / CONTAINMENT HOLD</span>
              </div>
              <p className="swarm__hold-title">
                Executor isolated. Human decision required.
              </p>
              <p className="swarm__hold-note">
                Keep the executor isolated, or allow it to resume with sanitized context.
                No response fails closed.
              </p>
              {state?.hold?.reason && (
                <p className="swarm__hold-reason">{state.hold.reason}</p>
              )}
              <div className="swarm__hold-meta mono">
                {state?.hold && <span>{state.hold.contamination}% contamination estimate</span>}
                {state?.hold?.agent && <span>role {state.hold.agent}</span>}
                {saliency?.canary && <span>canary {saliency.canary}</span>}
              </div>
              <div className="swarm__hold-dock">
                <div className="swarm__hold-dock-head">
                  <span className="swarm__hold-dock-label mono">HUMAN DECISION · FAILS CLOSED</span>
                  {secondsLeft !== null ? (
                    <span
                      className={`swarm__hold-timer mono${
                        secondsLeft <= 3 ? ' swarm__hold-timer--urgent' : ''
                      }`}
                    >
                      {secondsLeft}s remaining
                    </span>
                  ) : (
                    <span className="swarm__hold-dock-status mono">
                      {busy ? 'Submitting decision' : pending ? 'Deadline unavailable' : error ? 'Review channel unavailable' : 'Opening review channel'}
                    </span>
                  )}
                </div>
                <div className="swarm__hold-actions">
                  <button
                    type="button"
                    className="swarm__btn swarm__btn--danger"
                    disabled={busy || !approvalReady}
                    onClick={() => void decide('deny')}
                  >
                    Keep isolated
                  </button>
                  <button
                    type="button"
                    className="swarm__btn swarm__btn--safe"
                    disabled={busy || !approvalReady}
                    onClick={() => void decide('allow')}
                  >
                    Sanitize &amp; resume
                  </button>
                </div>
                {decisionError && <p className="swarm__hold-error" role="alert">Decision not accepted: {decisionError}</p>}
                {!pending && (
                  <p className="swarm__hold-wait mono">{busy ? 'submitting decision…' : 'opening the human review channel…'}</p>
                )}
              </div>
            </div>
          )}
          {!held && state?.result && (
            <div className={`swarm__card swarm__card--result swarm__card--result-${resultTone}`} role="status">
              <span className={`swarm__phase swarm__phase--${phase}`}>{PHASE_LABEL[phase]}</span>
              <p className="swarm__result-title">
                {phase === 'contained'
                  ? 'Contained. Executor remains isolated.'
                  : phase === 'complete'
                    ? 'Demo complete.'
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
          <div className="swarm__card swarm__card--verdict">
            <div className="swarm__card-head">
              <div>
                <p className="swarm__eyebrow mono">LIVE PROOF / KERNEL</p>
                <p className="swarm__card-title">Proposed call verdict</p>
                <p className="swarm__card-note">taint sentinel + policy · not model saliency</p>
              </div>
              {kernel && (
                <span className={`swarm__kernel-badge swarm__kernel-badge--${kernel.outcome}`}>
                  {kernel.outcome.replaceAll('_', ' ')}
                </span>
              )}
            </div>

            {kernel ? (
              <>
                <div className="swarm__kernel-row">
                  <span className="swarm__kernel-tool mono">{kernel.toolName}</span>
                  <span className={`swarm__kernel-score swarm__kernel-score--${toneFor(kernel.score)}`}>
                    <span className="swarm__kernel-score-label mono">RISK SCORE</span>{kernel.score}
                  </span>
                </div>
                <p className="swarm__kernel-reason">{kernel.reason}</p>
                {kernel.findings && kernel.findings.length > 0 && (
                  <div className="swarm__kernel-findings">
                    {kernel.findings.map((f: Finding) => (
                      <span key={f.id} className="swarm__finding" title={f.detail}>
                        <span className="swarm__finding-tag mono">{FINDING_LABEL[f.id] ?? 'Rule'}</span>
                        {f.title}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="swarm__empty">
                Awaiting the proposed call. The kernel's taint sentinel checks whether
                untrusted values reach a sensitive sink; model saliency does not block it.
              </p>
            )}
          </div>
        </div>
        <div className="swarm__col swarm__col--graph">
          <div className="swarm__card swarm__card--stage">
            <div className="swarm__card-head">
              <div>
                <p className="swarm__eyebrow mono">01 / SIGNAL FLOW</p>
                <p className="swarm__card-title">Role provenance graph</p>
                <p className="swarm__card-note">
                  planner → retrieval → execution · observed context and taint
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
                          {tainted ? 'taint present' : edge ? 'no taint' : '—'}
                        </span>
                        <span className="swarm__link-line">
                          <span className="swarm__link-dot" />
                        </span>
                      </div>
                    )}
                      <article
                        className={`swarm__node swarm__node--${node.status}`}
                        aria-label={`${node.role} role, ${node.status}, ${state ? `${node.contamination}% taint estimate` : 'awaiting run'}`}
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
                        <span className="mono">{state ? `${node.contamination}% taint` : 'awaiting run'}</span>
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
              <ContaminationRing value={contamination} peak={peak} analyzed={!!saliency} isolated={!!state?.isolated.length} available={!!state} />
              <div className="swarm__counts">
                <div className="swarm__count">
                  <span className="swarm__count-value mono">
                    {state?.contexts.length ?? '—'}
                  </span>
                  <span className="swarm__count-label">context items</span>
                </div>
                <div className="swarm__count">
                  <span className="swarm__count-value mono">
                    {state?.edges.length ?? '—'}
                  </span>
                  <span className="swarm__count-label">provenance edges</span>
                </div>
                <div className="swarm__count">
                  <span className="swarm__count-value mono">
                    {state?.isolated.length ?? '—'}
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
                <p className="swarm__eyebrow mono">02 / EVIDENCE</p>
                <p className="swarm__card-title">Model analysis</p>
                <p className="swarm__card-note">
                  contextual evidence · not the blocking decision
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
                    TOP-RANKED SPAN
                    {topSpan ? ` · RELATIVE OCCLUSION ${Math.round(topSpan.saliency * 100)}%` : ''}
                  </span>
                  <p className="swarm__span-text">
                    <MarkCanary
                      text={topSpan?.text ?? 'No span available for analysis.'}
                      canary={saliency.canary}
                    />
                  </p>
                  {topSpan && (
                    <p className="swarm__span-method">
                      Ranked by composite risk, not occlusion alone. Raw span occlusion: <strong>{topSpan.raw.toFixed(4)}</strong> = 1 − cosine(full page, page without span).
                      This measures embedding change, not causality or a contamination difference.
                    </p>
                  )}
                </div>

                <div className="swarm__metrics">
                  <Metric
                    label="Composite span risk"
                    value={saliency.saliency}
                    hint="blends absolute occlusion, intent, and instruction density"
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
                    hint={kernel ? 'sentinel confidence for untrusted value in the proposed action' : 'awaiting the kernel verdict on the proposed action'}
                  />
                </div>

                <div className="swarm__tokens">
                  <span className="swarm__tokens-label mono">RELATIVE TOKEN OCCLUSION · TOP SPAN</span>
                  <div className="swarm__token-row">
                    {tokenHeat.map((t, i) => (
                      <span
                        key={`${t.token}-${i}`}
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
                No analysis yet. The retriever must fetch untrusted content before Chaperone can
                score it.
              </p>
            )}
          </div>

        </div>

        <div className="swarm__col swarm__col--log">
          <div className="swarm__card swarm__card--log">
            <div className="swarm__card-head">
              <div>
                <p className="swarm__eyebrow mono">03 / RUN RECORD</p>
                <p className="swarm__card-title">Event stream</p>
                <p className="swarm__card-note">run events · decisions recorded separately in the ledger</p>
              </div>
              <span className="swarm__backend mono">{state?.events.length ?? '—'}</span>
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
                      <span className="swarm__event-agent mono">{event.agent === 'aegis' ? 'Chaperone' : event.agent}</span>
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
