import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  SCENARIOS,
  inspect,
  type Finding,
  type ToolCall,
  type Verdict,
} from '../lib/inspect'
import { statusOf, stampOf, type GateStatus } from '../intercept/status'
import type { Outcome } from '../intercept/types'
import { setFluid, triggerCollapse } from '../visual/state'
import './Checkpoint.css'

type Props = {
  onBack: () => void
}

type Decision = 'approved' | 'denied'
type Status = GateStatus
type Scenario =
  | 'destructive'
  | 'benign-http'
  | 'borderline'
  | 'adversarial'
  | 'encoded'
  | 'indirect-injection'
  | 'all'

type AuditEntry = {
  id: string
  call: ToolCall
  decision: Decision
  at: string
  score: number
  decidedBy?: 'auto' | 'human'
  level?: string
  reason?: string
  outcome?: Outcome
  findings?: Finding[]
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
  decisionToken?: string
}

type ActivityItem = {
  id: string
  at: string
  tool: string
  summary: string
  score: number
  level: string
  status: Status
  actor: 'human' | 'auto'
  reason?: string
}

const SCENARIO_META: Array<{
  key: Exclude<Scenario, 'all'>
  title: string
  tag: string
  outcome: string
  detail: string
  tone: 'allow' | 'review' | 'deny'
}> = [
  {
    key: 'destructive',
    title: 'Destructive',
    tag: 'Dangerous',
    outcome: 'Chaperone blocks it',
    detail: 'rm -rf against home dirs',
    tone: 'deny',
  },
  {
    key: 'borderline',
    title: 'Borderline',
    tag: 'Risky',
    outcome: 'Freezes for your call',
    detail: 'chmod 777 + test runner',
    tone: 'review',
  },
  {
    key: 'adversarial',
    title: 'Adversarial',
    tag: 'Risky',
    outcome: 'Caught by semantic layer',
    detail: 'paraphrased exfil, no keywords',
    tone: 'review',
  },
  {
    key: 'encoded',
    title: 'Encoded',
    tag: 'Dangerous',
    outcome: 'Allowlist blocks it',
    detail: 'base64 exfil through a pipe',
    tone: 'deny',
  },
  {
    key: 'indirect-injection',
    title: 'Indirect',
    tag: 'Sleeper',
    outcome: 'Caught by taint tracking',
    detail: 'fetched page → “harmless” echo',
    tone: 'deny',
  },
  {
    key: 'benign-http',
    title: 'Benign',
    tag: 'Safe',
    outcome: 'Runs automatically',
    detail: 'GET httpbin.org (needs net)',
    tone: 'allow',
  },
]

const STATUS_LABEL: Record<Status, string> = {
  pending: 'HELD',
  approved: 'ALLO',
  denied: 'DENY',
  blocked: 'BLOC',
  expired: 'AUTO',
  failed: 'FAIL',
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

  useEffect(() => {
    if (!active || !verdict) {
      setFluid({ mode: 'idle', risk: 0, field: 1, surface: 'gate' })
      return
    }
    const mode =
      verdict.recommendation === 'deny'
        ? 'deny'
        : verdict.recommendation === 'review'
          ? 'review'
          : 'allow'
    let field = 1
    if (
      mode === 'review' &&
      isReviewLive &&
      secondsLeft !== null &&
      activeLive?.timeoutMs
    ) {
      field = Math.max(0.05, secondsLeft / (activeLive.timeoutMs / 1000))
    }
    setFluid({ mode, risk: Math.min(1, verdict.score / 100), field, surface: 'gate' })
  }, [active, verdict, isReviewLive, secondsLeft, activeLive?.timeoutMs])

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
              tool: String(a.toolName ?? 'tool') as ToolCall['tool'],
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
            level: String(a.riskLevel ?? ''),
            reason: a.reason ? String(a.reason) : undefined,
            outcome: a.outcome ? (String(a.outcome) as Outcome) : undefined,
            findings: Array.isArray(a.findings) ? (a.findings as Finding[]) : undefined,
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
    if (decision === 'denied') triggerCollapse()

    if (mode === 'live' && activeLive) {
      await fetch('/api/chaperone/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activeLive.call.id,
          decision: decision === 'approved' ? 'allow' : 'deny',
          token: activeLive.decisionToken,
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
        level: verdict.level,
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

  const startLive = async (scenario: Scenario) => {
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

  const activity: ActivityItem[] = useMemo(() => {
    const items: ActivityItem[] = []
    if (mode === 'live') {
      for (const p of livePending) {
        items.push({
          id: p.call.id,
          at: (p.createdAt || '').slice(11, 19),
          tool: p.toolCall.tool,
          summary: p.toolCall.summary,
          score: p.verdict.score,
          level: p.verdict.level,
          status: 'pending',
          actor: 'human',
        })
      }
      for (const e of audit) {
        items.push({
          id: e.id,
          at: e.at,
          tool: e.call.tool,
          summary: e.call.summary,
          score: e.score,
          level: e.level || inspect(e.call).level,
          status: statusOf(e),
          actor: e.decidedBy === 'human' ? 'human' : 'auto',
          reason: e.reason,
        })
      }
    } else {
      for (const c of queue) {
        const v = inspect(c)
        items.push({
          id: c.id,
          at: c.requestedAt,
          tool: c.tool,
          summary: c.summary,
          score: v.score,
          level: v.level,
          status: 'pending',
          actor: 'human',
        })
      }
      for (const e of audit) {
        items.push({
          id: e.id,
          at: e.at,
          tool: e.call.tool,
          summary: e.call.summary,
          score: e.score,
          level: e.level || inspect(e.call).level,
          status: statusOf(e),
          actor: 'human',
          reason: e.reason,
        })
      }
    }
    return items
  }, [mode, livePending, audit, queue])

  const latest = audit[0]
  const latestStatus = latest ? statusOf(latest) : null
  const latestStamp = latestStatus ? stampOf(latestStatus) : null
  const latestLevel = latest ? latest.level || inspect(latest.call).level : ''

  return (
    <section className="gate" aria-label="Agent checkpoint">
      <nav className="gate__nav">
        <button type="button" className="gate__back" onClick={onBack}>
          <span className="gate__back-arrow">&larr;</span>
          Home
        </button>
        <span className="gate__logo">CHAPERONE</span>
        <div className="gate__nav-status">
          <span className="gate__nav-dot" />
          <span className="mono">
            {mode === 'live' ? 'INTERCEPTING · shell + http' : 'OFFLINE DEMO · scripted'}
          </span>
        </div>
      </nav>

      <div className="gate__layout">
        <aside className="gate__rail gate__rail--scenarios">
          <p className="gate__rail-title">Scenarios</p>
          <p className="gate__rail-note">Send a tool call. Watch what Chaperone does.</p>
          <div className="gate__scenarios">
            {SCENARIO_META.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`gate__scenario gate__scenario--${s.tone}`}
                disabled={busy}
                onClick={() => void startLive(s.key)}
              >
                <span className={`gate__scenario-tag gate__scenario-tag--${s.tone}`}>
                  {s.tag}
                </span>
                <span className="gate__scenario-title">{s.title}</span>
                <span className="gate__scenario-outcome">{s.outcome}</span>
                <span className="gate__scenario-detail">{s.detail}</span>
              </button>
            ))}
            <button
              type="button"
              className="gate__scenario gate__scenario--all"
              disabled={busy}
              onClick={() => void startLive('all')}
            >
              <span className="gate__scenario-tag gate__scenario-tag--all">All</span>
              <span className="gate__scenario-title">Run All</span>
              <span className="gate__scenario-outcome">Full sweep</span>
              <span className="gate__scenario-detail">blocked → runs → two reviews</span>
            </button>
            <button
              type="button"
              className="gate__scenario gate__scenario--offline"
              onClick={loadScenarios}
            >
              <span className="gate__scenario-tag gate__scenario-tag--offline">No server</span>
              <span className="gate__scenario-title">Offline Mode</span>
              <span className="gate__scenario-outcome">Scripted queue</span>
              <span className="gate__scenario-detail">works without the API</span>
            </button>
          </div>
        </aside>

        <main className="gate__main">
          {active && verdict ? (
            <div className="gate__card" key={active.id}>
              <span className={`gate__seal gate__seal--${verdict.level}`} aria-hidden>
                {verdict.level}
              </span>

              <div className="gate__card-header">
                <div className="gate__tool-pill">{active.tool}</div>
                <span className="gate__card-time">{active.requestedAt}</span>
              </div>

              <div className="gate__held mono">HELD FOR YOUR CALL</div>

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
                  <p className="gate__findings-title">
                    Findings · {verdict.findings.length}
                  </p>
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
          ) : latest && latestStamp ? (
            <div className={`gate__card gate__card--outcome gate__card--${latestStamp.tone}`} key={latest.id}>
              <span className={`gate__seal gate__seal--${latestLevel}`} aria-hidden>
                {latestLevel}
              </span>

              <div className="gate__card-header">
                <div className="gate__tool-pill">{latest.call.tool}</div>
                <span className="gate__card-time">{latest.at}</span>
              </div>

              <div className="gate__outcome">
                <span className={`gate__outcome-stamp gate__outcome-stamp--${latestStamp.tone}`}>
                  {latestStamp.label}
                </span>
                <span className="gate__outcome-actor mono">
                  {latest.decidedBy === 'human' ? 'by you' : 'by chaperone'}
                </span>
              </div>

              <div className="gate__gauge-wrap">
                <div className="gate__gauge">
                  <div
                    className={`gate__gauge-fill gate__gauge-fill--${latestLevel}`}
                    style={{ width: `${latest.score}%` }}
                  />
                </div>
                <span className={`gate__gauge-score gate__gauge-score--${latestLevel}`}>
                  {latest.score}
                </span>
              </div>

              <h2 className="gate__heading">
                Agent tried to run{' '}
                <span className="gate__heading-tool">{latest.call.tool}</span>
              </h2>

              <p className="gate__verdict">
                {latestStatus === 'blocked' &&
                  'Chaperone blocked this before it ran — the agent never touched your machine.'}
                {latestStatus === 'expired' &&
                  'No human answered in time, so Chaperone failed closed and denied the call.'}
                {latestStatus === 'denied' &&
                  'You denied this call at the checkpoint. It was never executed.'}
                {latestStatus === 'failed' &&
                  'Chaperone allowed this call, but the tool failed during execution.'}
                {latestStatus === 'approved' &&
                  (latest.decidedBy === 'human'
                    ? 'You approved this call at the checkpoint; it executed normally.'
                    : 'Chaperone scored this call safe and let it run.')}
              </p>

              <div className="gate__payload">
                <p className="gate__payload-label">Tool call</p>
                <pre className="gate__payload-code">{latest.call.payload}</pre>
              </div>

              {latest.findings && latest.findings.length > 0 && (
                <div className="gate__findings">
                  <p className="gate__findings-title">Findings · {latest.findings.length}</p>
                  {latest.findings.map((f, i) => (
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

              {latest.reason && (
                <div className="gate__outcome-reason">
                  <span className="gate__outcome-reason-label">Reason</span>
                  <span className="mono">{latest.reason}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="gate__brief">
              <p className="gate__brief-kicker mono">HUMAN-IN-THE-LOOP FIREWALL</p>
              <h2 className="gate__brief-title">
                Chaperone sits between your agent and your machine.
              </h2>
              <p className="gate__brief-sub">
                Every tool call the agent wants to run is scored <em>before</em> it executes.
                You decide the risky ones. Chaperone blocks the dangerous ones on its own — and
                if no one answers, it fails closed.
              </p>
              <div className="gate__policy">
                <div className="gate__policy-item gate__policy-item--allow">
                  <span className="gate__policy-tag">Safe</span>
                  <strong>runs automatically</strong>
                </div>
                <div className="gate__policy-item gate__policy-item--review">
                  <span className="gate__policy-tag">Risky</span>
                  <strong>freezes for your call</strong>
                </div>
                <div className="gate__policy-item gate__policy-item--deny">
                  <span className="gate__policy-tag">Dangerous</span>
                  <strong>blocked by Chaperone</strong>
                </div>
              </div>
              <p className="gate__brief-hint">&larr; Pick a scenario to begin.</p>
            </div>
          )}
        </main>

        <aside className="gate__rail gate__rail--log">
          <p className="gate__rail-title">Interception Log</p>
          {activity.length === 0 ? (
            <p className="gate__rail-empty">Nothing intercepted yet.</p>
          ) : (
            <div className="gate__events">
              {activity.map((a) => (
                <div key={a.id} className={`gate__event gate__event--${a.status}`}>
                  <div className="gate__event-top">
                    <span className="gate__event-time mono">{a.at}</span>
                    <span className="gate__event-tool mono">{a.tool}</span>
                    <span className={`gate__event-status gate__event-status--${a.status}`}>
                      {STATUS_LABEL[a.status]}
                    </span>
                    <span className="gate__event-score mono">{a.score}</span>
                  </div>
                  <span className="gate__event-summary">{a.summary}</span>
                  {a.status !== 'pending' && (
                    <span className="gate__event-actor mono">{a.actor}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}
