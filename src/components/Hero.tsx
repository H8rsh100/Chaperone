import { useEffect } from 'react'
import { useMagnetic } from '../visual/magnetic'
import { setFluid } from '../visual/state'
import './Hero.css'

type Props = {
  onEnter: () => void
}

export function Hero({ onEnter }: Props) {
  const ctaRef = useMagnetic<HTMLButtonElement>(120, 0.3)

  useEffect(() => {
    setFluid({ mode: 'idle', risk: 0, field: 1, surface: 'hero' })
  }, [])

  return (
    <section className="hero" aria-label="Chaperone landing">
      <div className="hero__content">
        <p className="hero__badge mono">v0.2 // HUMAN-IN-THE-LOOP FIREWALL</p>

        <h1 className="hero__title">CHAPERONE</h1>

        <p className="hero__tagline">
          Parental controls, for <em>AI agents</em>.
        </p>

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

        <button ref={ctaRef} type="button" className="hero__cta magnetic" onClick={onEnter}>
          Enter Checkpoint
        </button>

        <p className="hero__hint">Deny blocks execution. Review freezes the agent.</p>

        <p className="hero__stats mono">INTERCEPTED 47 · SUSPENDED 12 · EXECUTED 35</p>
      </div>
    </section>
  )
}
