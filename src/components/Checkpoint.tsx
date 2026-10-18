import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  SCENARIOS,
  inspect,
  type ToolCall,
  type Verdict,
} from '../lib/inspect'
import './Checkpoint.css'

type Props = {
  onBack: () => void
}

type Decision = 'approved' | 'denied'

type AuditEntry = {
  id: string
  call: ToolCall
  decision: Decision
  at: string
  score: number
  decidedBy?: 'auto' | 'human'
}

type LivePending = {
  call: {
    id: string
    toolName: string
    input: Record<string, unknown>
  }
  toolCall: ToolCall
  verdict: Verdict
  createdAt: string
  expiresAt?: string
  timeoutMs?: number
}

export function Checkpoint({ onBack }: Props) {
  const [mode, setMode] = useState<'scenarios' | 'live'>('live')
  const [queue, setQueue] = useState<ToolCall[]>([])
  const [livePending, setLivePending] = useState<LivePending[]>([])
  const [activeId, setActiveId] = useState('')
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(t)
  }, [])

  const activeLive = livePending.find((p) => p.call.id === activeId) ?? livePending[0]
  const activeScenario = queue.find((c) => c.id === activeId) ?? queue[0]
  const active = mode === 'live' ? activeLive?.toolCall : activeScenario
  const verdict: Verdict | null = useMemo(() => {
    if (mode === 'live') return activeLive?.verdict ?? null
    return active ? inspect(active) : null
  }, [mode, active, activeLive])

  const isReviewLive =
    mode === 'live' &&
    !!activeLive &&
    activeLive.verdict.recommendation === 'review' &&
    !!activeLive.expiresAt
  const secondsLeft = isReviewLive
    ? Math.max(
        0,
        Math.ceil((new Date(activeLive!.expiresAt!).getTime() - now) / 1000),
      )
    : null

  const refreshLive = useCallback(async () => {
    const res = await fetch('/api/chaperone/pending')
    const data = (await res.json()) as {
      pending: LivePending[]
      audit: Array<Record<string, unknown>>
    }
    setLivePending(data.pending)
    if (data.pending.length && !data.pending.some((p) => p.call.id === activeId)) {
      setActiveId(data.pending[0].call.id)
    }
    if (data.audit?.length) {
      setAudit(
        data.audit
          .filter((a) => a.toolName && a.toolName !== '(run)')
          .map((a, i) => ({
            id: String(a.id ?? `a-${i}`),
            call: {
              id: String(a.id ?? i),
              agent: 'live-agent',
              tool: 'shell',
              summary: String(a.inputSummary ?? a.toolName),
              payload: String(a.inputSummary ?? ''),
              requestedAt: String(a.timestamp ?? '').slice(11, 19),
            },
            decision:
              a.finalDecision === 'deny' || a.decision === 'deny'
                ? 'denied'
                : 'approved',
            at: String(a.timestamp ?? '').slice(11, 19),
            score: Number(a.riskScore ?? 0),
            decidedBy: (a.decidedBy as 'auto' | 'human') ?? 'auto',
          })),
      )
    }
  }, [activeId])

  useEffect(() => {
    if (mode !== 'live') return
    void refreshLive()
    const t = window.setInterval(() => void refreshLive(), 800)
    return () => window.clearInterval(t)
  }, [mode, refreshLive])

  const decide = async (decision: Decision) => {
    if (!active || !verdict) return

    if (mode === 'live' && activeLive) {
      await fetch('/api/chaperone/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activeLive.call.id,
          decision: decision === 'approved' ? 'allow' : 'deny',
        }),
      })
      await refreshLive()
      return
    }

    setAudit((prev) => [
      {
        id: `${active.id}-${Date.now()}`,
        call: active,
        decision,
        at: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        score: verdict.score,
        decidedBy: 'human',
      },
      ...prev,
    ])
    setQueue((prev) => {
      const next = prev.filter((c) => c.id !== active.id)
      setActiveId(next[0]?.id ?? '')
      return next
    })
  }

  const loadScenarios = () => {
    setMode('scenarios')
    setQueue(SCENARIOS)
    setActiveId(SCENARIOS[0].id)
    setAudit([])
  }

  const startLive = async (
    scenario:
      | 'destructive'
      | 'benign-http'
      | 'borderline'
      | 'adversarial'
      | 'encoded'
      | 'all',
  ) => {
    setMode('live')
    setBusy(true)
    setAudit([])
    await fetch('/api/chaperone/reset', { method: 'POST' })
    await fetch('/api/chaperone/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario, useLiveModel: false }),
    })
    setBusy(false)
    await refreshLive()
  }

  const pendingList =
    mode === 'live'
      ? livePending.map((p) => ({
          id: p.call.id,
          label: p.toolCall.summary,
          agent: p.toolCall.agent,
          tool: p.toolCall.tool,
          level: p.verdict.level,
        }))
      : queue.map((c) => ({
          id: c.id,
          label: c.summary,
          agent: c.agent,
          tool: c.tool,
          level: inspect(c).level,
        }))

  return (
    <section className="gate" aria-label="Agent checkpoint">
      <nav className="gate__nav">
        <button type="button" className="gate__back" onClick={onBack}>
          <span className="gate__back-arrow">&larr;</span>
          Home
        </button>
        <span className="gate__logo">CHAPERONE</span>
        <div className="gate__chips">
          <button type="button" className="gate__chip" disabled={busy} onClick={() => void startLive('destructive')}>
            Destructive
          </button>
          <button type="button" className="gate__chip" disabled={busy} onClick={() => void startLive('benign-http')}>
            Benign
          </button>
          <button type="button" className="gate__chip" disabled={busy} onClick={() => void startLive('borderline')}>
            Borderline
          </button>
          <button type="button" className="gate__chip" disabled={busy} onClick={() => void startLive('adversarial')}>
            Adversarial
          </button>
          <button type="button" className="gate__chip" disabled={busy} onClick={() => void startLive('encoded')}>
            Encoded
          </button>
          <button type="button" className="gate__chip gate__chip--active" disabled={busy} onClick={() => void startLive('all')}>
            Run All
          </button>
          <button type="button" className="gate__chip" onClick={loadScenarios}>
            Offline
          </button>
        </div>
      </nav>

      <div className="gate__layout">
        {pendingList.length > 0 && (
          <aside className="gate__sidebar">
            <p className="gate__sidebar-title">Pending Queue</p>
            <div className="gate__queue">
              {pendingList.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={
                    p.id === (activeLive?.call.id ?? active?.id)
                      ? `gate__queue-item gate__queue-item--active gate__queue-item--${p.level}`
                      : `gate__queue-item gate__queue-item--${p.level}`
                  }
                  onClick={() => setActiveId(p.id)}
                >
                  <span className="gate__queue-agent">{p.agent}</span>
                  <span className="gate__queue-label">{p.label}</span>
                  <span className={`gate__queue-badge gate__queue-badge--${p.level}`}>
                    {p.level}
                  </span>
                </button>
              ))}
            </div>
          </aside>
        )}

        <main className="gate__main">
          {active && verdict ? (
            <div className="gate__card" key={active.id}>
              <div className="gate__card-header">
                <div className="gate__tool-pill">{active.tool}</div>
                <span className="gate__card-time">{active.requestedAt}</span>
              </div>

              <div className="gate__gauge-wrap">
                <div className="gate__gauge">
                  <div
                    className={`gate__gauge-fill gate__gauge-fill--${verdict.level}`}
                    style={{ width: `${verdict.score}%` }}
                  />
                </div>
                <span className={`gate__gauge-score gate__gauge-score--${verdict.level}`}>
                  {verdict.score}
                </span>
              </div>

              <div className={`gate__level-badge gate__level-badge--${verdict.level}`}>
                {verdict.level.toUpperCase()}
              </div>

              {isReviewLive && (
                <div
                  className={
                    secondsLeft !== null && secondsLeft <= 10
                      ? 'gate__countdown gate__countdown--urgent'
                      : 'gate__countdown'
                  }
                  role="status"
                >
                  <span className="gate__countdown-dot" />
                  Fail-closed in {secondsLeft}s — no response auto-denies
                </div>
              )}

              <h2 className="gate__heading">
                Agent wants to run <span className="gate__heading-tool">{active.tool}</span>
              </h2>

              <p className="gate__verdict">{verdict.headline}</p>

              <div className="gate__agent-row">
                <span className="gate__agent-label">Agent</span>
                <span className="gate__agent-name">{active.agent}</span>
              </div>

              <div className="gate__payload">
                <p className="gate__payload-label">Request Payload</p>
                <pre className="gate__payload-code">{active.payload}</pre>
              </div>

              {verdict.findings.length > 0 && (
                <div className="gate__findings">
                  <p className="gate__findings-title">Findings</p>
                  {verdict.findings.map((f, i) => (
                    <div key={f.id} className="gate__finding">
                      <span className="gate__finding-num">{String(i + 1).padStart(2, '0')}</span>
                      <div className="gate__finding-body">
                        <p className="gate__finding-title">{f.title}</p>
                        <p className="gate__finding-detail">{f.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="gate__actions">
                <button
                  type="button"
                  className="gate__btn gate__btn--deny"
                  onClick={() => void decide('denied')}
                >
                  Don&apos;t Allow
                </button>
                <button
                  type="button"
                  className="gate__btn gate__btn--allow"
                  onClick={() => void decide('approved')}
                >
                  Allow
                </button>
              </div>
            </div>
          ) : (
            <div className="gate__empty">
              <div className="gate__empty-icon">&#10003;</div>
              <p className="gate__empty-text">No pending tool calls</p>
              <p className="gate__empty-sub">Start a scenario to see the checkpoint in action.</p>
              <button type="button" className="gate__btn gate__btn--allow" onClick={() => void startLive('all')}>
                Run All Scenarios
              </button>
            </div>
          )}

          {audit.length > 0 && (
            <div className="gate__log">
              <p className="gate__log-title">Decision Log</p>
              {audit.slice(0, 8).map((e) => (
                <div key={e.id} className="gate__log-row">
                  <span className="gate__log-time">{e.at}</span>
                  <span className={`gate__log-badge gate__log-badge--${e.decision}`}>
                    {e.decision}
                  </span>
                  <span className="gate__log-summary">{e.call.summary.slice(0, 50)}</span>
                  {e.decidedBy === 'auto' && <span className="gate__log-auto">auto</span>}
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </section>
  )
}
