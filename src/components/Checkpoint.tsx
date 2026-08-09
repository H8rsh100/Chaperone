import { useMemo, useState } from 'react'
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
}

export function Checkpoint({ onBack }: Props) {
  const [queue, setQueue] = useState<ToolCall[]>(SCENARIOS)
  const [activeId, setActiveId] = useState(SCENARIOS[0]?.id ?? '')
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [flash, setFlash] = useState<Decision | null>(null)

  const active = queue.find((c) => c.id === activeId) ?? queue[0]
  const verdict: Verdict | null = useMemo(
    () => (active ? inspect(active) : null),
    [active],
  )

  const decide = (decision: Decision) => {
    if (!active || !verdict) return
    setFlash(decision)
    window.setTimeout(() => setFlash(null), 550)
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
      },
      ...prev,
    ])
    setQueue((prev) => {
      const next = prev.filter((c) => c.id !== active.id)
      setActiveId(next[0]?.id ?? '')
      return next
    })
  }

  const reset = () => {
    setQueue(SCENARIOS)
    setActiveId(SCENARIOS[0].id)
    setAudit([])
  }

  return (
    <section
      className={flash ? `check check--flash-${flash}` : 'check'}
      aria-label="Agent checkpoint"
    >
      <header className="check__top">
        <button type="button" className="check__brand" onClick={onBack}>
          Chaperone
        </button>
        <div className="check__status">
          <span className="check__dot" />
          Gate live · {queue.length} pending
        </div>
        <button type="button" className="check__reset" onClick={reset}>
          Reset queue
        </button>
      </header>

      <div className="check__layout">
        <aside className="check__queue">
          <p className="check__label">Inbound tool calls</p>
          {queue.length === 0 ? (
            <p className="check__empty">Queue clear. Policy held.</p>
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
                  onClick={() => decide('denied')}
                >
                  Deny
                </button>
                <button
                  type="button"
                  className="check__allow"
                  onClick={() => decide('approved')}
                >
                  Approve & execute
                </button>
              </div>
            </>
          ) : (
            <div className="check__clear">
              <h2>Checkpoint clear</h2>
              <p>All inbound agent actions were adjudicated.</p>
              <button type="button" className="check__allow" onClick={reset}>
                Reload scenario pack
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
                <li key={e.id} className={`check__audit-row check__audit-row--${e.decision}`}>
                  <span>{e.decision}</span>
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
