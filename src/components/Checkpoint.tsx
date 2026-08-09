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
  live?: boolean
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
  const [flash, setFlash] = useState<Decision | null>(null)
  const [runStatus, setRunStatus] = useState('Ready')
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
            live: true,
          })),
      )
    }
  }, [activeId])

  useEffect(() => {
    if (mode !== 'live') return
    void refreshLive()
    const t = window.setInterval(() => {
      void refreshLive()
    }, 800)
    return () => window.clearInterval(t)
  }, [mode, refreshLive])

  const decide = async (decision: Decision) => {
    if (!active || !verdict) return
    setFlash(decision)
    window.setTimeout(() => setFlash(null), 450)

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
    setRunStatus('Offline pack')
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
    setRunStatus(data.started ? `${data.mode}` : `Failed`)
    setBusy(false)
    await refreshLive()
  }

  const tickets =
    mode === 'live'
      ? livePending.map((p) => ({
          id: p.call.id,
          label: p.call.toolName,
          sum: p.toolCall.summary,
          meta: p.verdict.level,
        }))
      : queue.map((c) => ({
          id: c.id,
          label: c.tool,
          sum: c.summary,
          meta: c.agent,
        }))

  return (
    <section
      className={
        flash === 'denied'
          ? 'booth booth--denied'
          : flash === 'approved'
            ? 'booth booth--approved'
            : 'booth'
      }
      aria-label="Agent checkpoint"
    >
      <header className="booth__bar">
        <button type="button" className="booth__back" onClick={onBack}>
          Back
        </button>
        <button type="button" className="booth__brand" onClick={onBack}>
          Chaperone
        </button>
        <div className="booth__runs">
          <button type="button" disabled={busy} onClick={() => void startLive('destructive')}>
            Break things
          </button>
          <button type="button" disabled={busy} onClick={() => void startLive('benign-http')}>
            Safe fetch
          </button>
          <button type="button" disabled={busy} onClick={() => void startLive('borderline')}>
            Needs you
          </button>
          <button type="button" disabled={busy} onClick={() => void startLive('all')}>
            All three
          </button>
          <button type="button" onClick={loadScenarios}>
            Offline
          </button>
        </div>
        <span className="booth__status">{runStatus}</span>
      </header>

      <div className="booth__tickets" aria-label="Queue">
        {tickets.length === 0 ? (
          <p className="booth__empty">No ticket in the lane. Fire a demo above.</p>
        ) : (
          tickets.map((t) => (
            <button
              key={t.id}
              type="button"
              className={
                t.id === (activeLive?.call.id ?? active?.id)
                  ? 'booth__ticket booth__ticket--on'
                  : 'booth__ticket'
              }
              onClick={() => setActiveId(t.id)}
            >
              <span>{t.label}</span>
              <strong>{t.sum}</strong>
              <em>{t.meta}</em>
            </button>
          ))
        )}
      </div>

      <div className="booth__stage">
        {active && verdict ? (
          <>
            <div className="booth__meta">
              <span>{active.agent}</span>
              <span>{active.tool}</span>
              <span className={`booth__risk booth__risk--${verdict.level}`}>
                {verdict.level} · {verdict.score}
              </span>
            </div>
            <h2 className="booth__sum">{active.summary}</h2>
            <p className="booth__headline">{verdict.headline}</p>
            <pre className="booth__payload">{active.payload}</pre>
            {verdict.findings.length > 0 && (
              <ul className="booth__findings">
                {verdict.findings.map((f) => (
                  <li key={f.id}>
                    <strong>{f.title}</strong> {f.detail}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="booth__idle">
            <h2>Nothing to judge yet</h2>
            <p>Hit All three. Watch deny, allow, and review hit the same gate.</p>
          </div>
        )}
      </div>

      <div className="booth__paddles">
        <button
          type="button"
          className="booth__deny"
          disabled={!active}
          onClick={() => void decide('denied')}
        >
          DENY
        </button>
        <button
          type="button"
          className="booth__allow"
          disabled={!active}
          onClick={() => void decide('approved')}
        >
          ALLOW
        </button>
      </div>

      <footer className="booth__audit">
        {audit.length === 0 ? (
          <span>Audit empty</span>
        ) : (
          audit.slice(0, 8).map((e) => (
            <span
              key={e.id}
              className={
                e.decision === 'denied' ? 'booth__chip booth__chip--deny' : 'booth__chip booth__chip--allow'
              }
            >
              {e.decision} · {e.call.summary.slice(0, 42)}
            </span>
          ))
        )}
      </footer>
    </section>
  )
}
