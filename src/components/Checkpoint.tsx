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
  }

  const startLive = async (
    scenario: 'destructive' | 'benign-http' | 'borderline' | 'all',
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
          level: p.verdict.level,
        }))
      : queue.map((c) => ({
          id: c.id,
          label: c.summary,
          level: inspect(c).level,
        }))

  return (
    <section className="alert" aria-label="Agent checkpoint">
      <header className="alert__bar">
        <button type="button" className="alert__back" onClick={onBack}>
          [ESC] HOME
        </button>
        <span className="alert__title">CHAPERONE</span>
        <div className="alert__flags">
          <button type="button" disabled={busy} onClick={() => void startLive('destructive')}>
            --destructive
          </button>
          <button type="button" disabled={busy} onClick={() => void startLive('benign-http')}>
            --benign
          </button>
          <button type="button" disabled={busy} onClick={() => void startLive('borderline')}>
            --review
          </button>
          <button type="button" disabled={busy} onClick={() => void startLive('all')}>
            --all
          </button>
          <button type="button" onClick={loadScenarios}>--offline</button>
        </div>
      </header>

      <div className="alert__main">
        {pendingList.length > 1 && (
          <div className="alert__queue">
            {pendingList.map((p) => (
              <button
                key={p.id}
                type="button"
                className={
                  p.id === (activeLive?.call.id ?? active?.id)
                    ? `alert__q alert__q--on alert__q--${p.level}`
                    : `alert__q alert__q--${p.level}`
                }
                onClick={() => setActiveId(p.id)}
              >
                {p.label.slice(0, 40)} [{p.level}]
              </button>
            ))}
          </div>
        )}

        {active && verdict ? (
          <div className="alert__dialog">
            <p className="alert__warn">!! TOOL CALL PENDING !!</p>
            <h2 className="alert__head">
              Agent wants to run <span>{active.tool}</span>
            </h2>
            <p className={`alert__sub alert__level alert__level--${verdict.level}`}>
              RISK {verdict.score} / {verdict.level.toUpperCase()}
            </p>
            <p className="alert__line">{verdict.headline}</p>

            <div className="alert__box">
              <div className="alert__box-label">REQUEST</div>
              <pre>{active.payload}</pre>
            </div>

            {verdict.findings.length > 0 && (
              <ul className="alert__hits">
                {verdict.findings.map((f, i) => (
                  <li key={f.id}>
                    <span>{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <strong>{f.title}</strong>
                      {f.detail}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="alert__btns">
              <button
                type="button"
                className="alert__deny"
                onClick={() => void decide('denied')}
              >
                DON&apos;T ALLOW
              </button>
              <button
                type="button"
                className="alert__allow"
                onClick={() => void decide('approved')}
              >
                ALLOW
              </button>
            </div>
          </div>
        ) : (
          <div className="alert__idle">
            <p>&gt; NO PENDING CALL</p>
            <p>RUN --all TO FIRE ACCEPTANCE TRIO</p>
            <button type="button" onClick={() => void startLive('all')}>
              RUN --all
            </button>
          </div>
        )}

        {audit.length > 0 && (
          <div className="alert__log">
            <p>LOG</p>
            {audit.slice(0, 8).map((e) => (
              <div key={e.id}>
                [{e.at}] {e.decision} {e.call.summary.slice(0, 50)}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
