import './Hero.css'

type Props = {
  onEnter: () => void
}

export function Hero({ onEnter }: Props) {
  return (
    <section className="boot" aria-label="Chaperone boot">
      <pre className="boot__ascii" aria-hidden>
{`╔══════════════════════════════╗
║  CHAPERONE GATE v0.2         ║
║  agent tool firewall         ║
╚══════════════════════════════╝`}
      </pre>

      <div className="boot__lines">
        <p>STATUS: GATE ARMED</p>
        <p>MODE: HUMAN MUST APPROVE TOOL CALLS</p>
        <p>SHELL + HTTP INTERCEPT: ON</p>
      </div>

      <button type="button" className="boot__cmd" onClick={onEnter}>
        &gt; ENTER_CHECKPOINT
      </button>

      <p className="boot__hint">deny blocks execution · review freezes agent</p>
    </section>
  )
}
