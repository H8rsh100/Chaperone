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
  const [runStatus, setRunStatus] = useState('Idle')
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
      setAudit((prev) => {
        const mapped: AuditEntry[] = data.audit
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
          }))
        // Prefer live audits when in live mode
        return mapped.length ? mapped : prev
      })
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
    window.setTimeout(() => setFlash(null), 550)

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
    setRunStatus('Scenario pack loaded')
  }

  const startLive = async (
    scenario: 'destructive' | 'benign-http' | 'borderline' | 'all',
  ) => {
    setMode('live')
    setBusy(true)
    setRunStatus(`Starting ${scenario}...`)
    setAudit([])
    await fetch('/api/chaperone/reset', { method: 'POST' })
    const res = await fetch('/api/chaperone/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario, useLiveModel: false }),
    })
    const data = await res.json()
    setRunStatus(
      data.started
        ? `Live intercept running (${data.mode}). Deny blocks real execution.`
        : `Failed: ${data.error ?? 'unknown'}`,
    )
    setBusy(false)
    await refreshLive()
  }

  const queueCount = mode === 'live' ? livePending.length : queue.length

  return (
    <section
      className={flash ? `check check--flash-${flash}` : 'check'}
      aria-label="Agent checkpoint"
    >
      <header className="check__top">
        <button type="button" className="check__brand" onClick={onBack}>
          Chaperone
        </button>
        <p className="check__plain">
          Live intercept: tool calls hit inspect.ts before they run.
        </p>
        <div className="check__status">
          <span className="check__dot" />
          {queueCount} waiting
        </div>
      </header>

      <div className="check__livebar">
        <button
          type="button"
          disabled={busy}
          onClick={() => void startLive('destructive')}
        >
          Demo: destructive
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void startLive('benign-http')}
        >
          Demo: benign HTTP
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void startLive('borderline')}
        >
          Demo: needs review
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void startLive('all')}
        >
          Run all three
        </button>
        <button type="button" onClick={loadScenarios}>
          Offline scenarios
        </button>
        <span className="check__runstatus">{runStatus}</span>
      </div>

      <div className="check__layout">
        <aside className="check__queue">
          <p className="check__label">
            {mode === 'live' ? 'Live review queue' : 'Inbound tool calls'}
          </p>
          {queueCount === 0 ? (
            <p className="check__empty">
              {mode === 'live'
                ? 'No human review pending. Auto allow/deny still write the audit trail.'
                : 'Queue clear. Policy held.'}
            </p>
          ) : mode === 'live' ? (
            <ul>
              {livePending.map((p) => (
                <li key={p.call.id}>
                  <button
                    type="button"
                    className={
                      p.call.id === activeLive?.call.id
                        ? 'check__item check__item--active'
                        : 'check__item'
                    }
                    onClick={() => setActiveId(p.call.id)}
                  >
                    <span className="check__item-tool">{p.call.toolName}</span>
                    <span className="check__item-sum">{p.toolCall.summary}</span>
                    <span className="check__item-meta">
                      live · {p.verdict.level} · {p.createdAt.slice(11, 19)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul>
              {queue.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={
                      c.id === active?.id
                        ? 'check__item check__item--active'
                        : 'check__item'
                    }
                    onClick={() => setActiveId(c.id)}
                  >
                    <span className="check__item-tool">{c.tool}</span>
                    <span className="check__item-sum">{c.summary}</span>
                    <span className="check__item-meta">
                      {c.agent} · {c.requestedAt}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="check__stage">
          {active && verdict ? (
            <>
              <div className="check__inspect">
                <div className="check__inspect-head">
                  <div>
                    <p className="check__label">Now inspecting</p>
                    <h2>{active.summary}</h2>
                    <p className="check__agent">
                      {active.agent} · tool <code>{active.tool}</code>
                      {mode === 'live' ? ' · LIVE GATE' : ''}
                    </p>
                  </div>
                  <div
                    className={`check__score check__score--${verdict.level}`}
                    aria-label={`Risk score ${verdict.score}`}
                  >
                    <span>Risk</span>
                    <strong>{verdict.score}</strong>
                    <em>{verdict.level}</em>
                  </div>
                </div>

                <div className="check__gate-visual" aria-hidden>
                  <div className={`check__bars check__bars--${verdict.level}`}>
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <p className="check__headline">{verdict.headline}</p>
                </div>

                <pre className="check__payload">{active.payload}</pre>

                <div className="check__findings">
                  <p className="check__label">Findings</p>
                  {verdict.findings.length === 0 ? (
                    <p className="check__ok">No policy hits. Residual noise only.</p>
                  ) : (
                    <ul>
                      {verdict.findings.map((f) => (
                        <li key={f.id}>
                          <strong>{f.title}</strong>
                          <span>{f.detail}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="check__actions">
                <button
                  type="button"
                  className="check__deny"
                  onClick={() => void decide('denied')}
                >
                  Deny
                </button>
                <button
                  type="button"
                  className="check__allow"
                  onClick={() => void decide('approved')}
                >
                  Approve & execute
                </button>
              </div>
            </>
          ) : (
            <div className="check__clear">
              <h2>{mode === 'live' ? 'Start a live intercept' : 'Checkpoint clear'}</h2>
              <p>
                {mode === 'live'
                  ? 'Run destructive, benign HTTP, or needs-review. Auto-deny never executes. Review waits for your click.'
                  : 'All inbound agent actions were adjudicated.'}
              </p>
              <button
                type="button"
                className="check__allow"
                onClick={() => void startLive('all')}
              >
                Run acceptance trio
              </button>
            </div>
          )}
        </div>

        <aside className="check__audit">
          <p className="check__label">Audit trail</p>
          {audit.length === 0 ? (
            <p className="check__empty">Decisions land here.</p>
          ) : (
            <ul>
              {audit.map((e) => (
                <li
                  key={e.id}
                  className={`check__audit-row check__audit-row--${e.decision}`}
                >
                  <span>
                    {e.decision}
                    {e.decidedBy ? ` · ${e.decidedBy}` : ''}
                  </span>
                  <strong>{e.call.summary}</strong>
                  <em>
                    score {e.score} · {e.at}
                  </em>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </section>
  )
}
