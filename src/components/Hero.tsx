import './Hero.css'

type Props = {
  onEnter: () => void
}

export function Hero({ onEnter }: Props) {
  return (
    <section className="hero" aria-label="Chaperone landing">
      <div className="hero__glow" aria-hidden />

      <div className="hero__content">
        <p className="hero__badge">v0.2 // HUMAN-IN-THE-LOOP FIREWALL</p>

        <h1 className="hero__title">CHAPERONE</h1>

        <p className="hero__tagline">Parental controls, for AI agents.</p>

        <div className="hero__cards">
          <div className="hero__card">
            <span className="hero__card-dot hero__card-dot--green" />
            <div>
              <p className="hero__card-label">Gate Status</p>
              <p className="hero__card-value">Armed</p>
            </div>
          </div>
          <div className="hero__card">
            <span className="hero__card-dot hero__card-dot--green" />
            <div>
              <p className="hero__card-label">Approval Mode</p>
              <p className="hero__card-value">Human Required</p>
            </div>
          </div>
          <div className="hero__card">
            <span className="hero__card-dot hero__card-dot--green" />
            <div>
              <p className="hero__card-label">Intercept</p>
              <p className="hero__card-value">Shell + HTTP</p>
            </div>
          </div>
        </div>

        <button type="button" className="hero__cta" onClick={onEnter}>
          Enter Checkpoint
        </button>

        <p className="hero__hint">Deny blocks execution. Review freezes the agent.</p>
      </div>
    </section>
  )
}
