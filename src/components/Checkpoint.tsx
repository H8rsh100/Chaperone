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
}

export function Checkpoint({ onBack }: Props) {
  const [mode, setMode] = useState<'scenarios' | 'live'>('live')
  const [queue, setQueue] = useState<ToolCall[]>([])
  const [livePending, setLivePending] = useState<LivePending[]>([])
  const [activeId, setActiveId] = useState('')
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [runStatus, setRunStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const activeLive = livePending.find((p) => p.call.id === activeId) ?? livePending[0]
  const activeScenario = queue.find((c) => c.id === activeId) ?? queue[0]
  const active = mode === 'live' ? activeLive?.toolCall : activeScenario
  const verdict: Verdict | null = useMemo(() => {
    if (mode === 'live') return activeLive?.verdict ?? null
    return active ? inspect(active) : null
  }, [mode, active, activeLive])

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
    setRunStatus('Offline scenarios')
  }

  const startLive = async (
    scenario: 'destructive' | 'benign-http' | 'borderline' | 'all',
  ) => {
    setMode('live')
    setBusy(true)
    setRunStatus(`Running ${scenario}`)
    setAudit([])
    await fetch('/api/chaperone/reset', { method: 'POST' })
    const res = await fetch('/api/chaperone/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario, useLiveModel: false }),
    })
    const data = await res.json()
    setRunStatus(data.started ? 'Live' : 'Failed')
    setBusy(false)
    await refreshLive()
  }

  const pendingList =
    mode === 'live'
      ? livePending.map((p) => ({
          id: p.call.id,
          label: p.toolCall.summary,
          level: p.verdict.level,
        }))
      : queue.map((c) => ({
          id: c.id,
          label: c.summary,
          level: inspect(c).level,
        }))

  return (
    <section className="gate" aria-label="Agent checkpoint">
      <header className="gate__nav">
        <button type="button" className="gate__back" onClick={onBack}>
          ← Home
        </button>
        <div className="gate__demos">
          <button type="button" disabled={busy} onClick={() => void startLive('destructive')}>
            Destructive
          </button>
          <button type="button" disabled={busy} onClick={() => void startLive('benign-http')}>
            Benign HTTP
          </button>
          <button type="button" disabled={busy} onClick={() => void startLive('borderline')}>
            Review
          </button>
          <button type="button" disabled={busy} onClick={() => void startLive('all')}>
            All three
          </button>
          <button type="button" onClick={loadScenarios}>Offline</button>
        </div>
        {runStatus && <span className="gate__status">{runStatus}</span>}
      </header>

      <div className="gate__body">
        {pendingList.length > 1 && (
          <nav className="gate__queue" aria-label="Pending reviews">
            {pendingList.map((p) => (
              <button
                key={p.id}
                type="button"
                className={
                  p.id === (activeLive?.call.id ?? active?.id)
                    ? 'gate__queue-item gate__queue-item--on'
                    : 'gate__queue-item'
                }
                onClick={() => setActiveId(p.id)}
              >
                {p.label.slice(0, 48)}
                <span>{p.level}</span>
              </button>
            ))}
          </nav>
        )}

        {active && verdict ? (
          <article className="gate__notice">
            <header className="gate__notice-head">
              <p className="gate__notice-kicker">Intercept notice</p>
              <div className="gate__notice-meta">
                <span>{active.agent}</span>
                <span>{active.tool}</span>
                <span className={`gate__risk gate__risk--${verdict.level}`}>
                  {verdict.level} · {verdict.score}
                </span>
              </div>
            </header>

            <h2 className="gate__summary">{active.summary}</h2>
            <p className="gate__verdict-line">{verdict.headline}</p>

            <pre className="gate__payload">{active.payload}</pre>

            {verdict.findings.length > 0 && (
              <ol className="gate__findings">
                {verdict.findings.map((f) => (
                  <li key={f.id}>
                    <strong>{f.title}</strong>
                    <span>{f.detail}</span>
                  </li>
                ))}
              </ol>
            )}

            <div className="gate__actions">
              <button
                type="button"
                className="gate__deny"
                onClick={() => void decide('denied')}
              >
                Deny
              </button>
              <button
                type="button"
                className="gate__allow"
                onClick={() => void decide('approved')}
              >
                Allow and execute
              </button>
            </div>
          </article>
        ) : (
          <div className="gate__empty">
            <h2>No intercept active</h2>
            <p>Run a demo above. Destructive auto-denies. Review waits on you.</p>
            <button type="button" className="gate__allow" onClick={() => void startLive('all')}>
              Run all three
            </button>
          </div>
        )}

        {audit.length > 0 && (
          <aside className="gate__audit" aria-label="Recent decisions">
            {audit.slice(0, 6).map((e) => (
              <div
                key={e.id}
                className={
                  e.decision === 'denied' ? 'gate__audit-row gate__audit-row--deny' : 'gate__audit-row'
                }
              >
                <span>{e.decision}</span>
                <span>{e.call.summary}</span>
                <span>{e.at}</span>
              </div>
            ))}
          </aside>
        )}
      </div>
    </section>
  )
}
