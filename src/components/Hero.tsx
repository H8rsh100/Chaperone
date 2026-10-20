import { useEffect } from 'react'
import { useMagnetic } from '../visual/magnetic'
import { setFluid } from '../visual/state'
import './Hero.css'

type Props = {
  onLaunch: () => void
  onKernel: () => void
}

export function Hero({ onLaunch, onKernel }: Props) {
  const ctaRef = useMagnetic<HTMLButtonElement>(120, 0.3)

  useEffect(() => {
    setFluid({ mode: 'idle', risk: 0, field: 1, surface: 'hero' })
  }, [])

  return (
    <section className="hero" aria-label="Aegis-Swarm landing">
      <div className="hero__content">
        <p className="hero__badge mono">AEGIS-SWARM // REAL-TIME TAINT DEFENSE</p>

        <h1 className="hero__title">
          AEGIS
          <span className="hero__title-sub mono">— SWARM —</span>
        </h1>

        <p className="hero__tagline">
          Real-time taint defense, for <em>multi-agent swarms</em>.
        </p>

        <div className="hero__cards">
          <div className="hero__card">
            <span className="hero__card-dot hero__card-dot--violet" />
            <div>
              <p className="hero__card-label">Agent Graph</p>
              <p className="hero__card-value">3 agents · live</p>
            </div>
          </div>
          <div className="hero__card">
            <span className="hero__card-dot hero__card-dot--red" />
            <div>
              <p className="hero__card-label">Contamination</p>
              <p className="hero__card-value">Neural 0–100</p>
            </div>
          </div>
          <div className="hero__card">
            <span className="hero__card-dot hero__card-dot--green" />
            <div>
              <p className="hero__card-label">Kernel</p>
              <p className="hero__card-value">Chaperone</p>
            </div>
          </div>
        </div>

        <div className="hero__actions">
          <button
            ref={ctaRef}
            type="button"
            className="hero__cta magnetic"
            onClick={onLaunch}
          >
            Launch Swarm
          </button>
          <button type="button" className="hero__cta hero__cta--ghost" onClick={onKernel}>
            Enter Kernel
          </button>
        </div>

        <p className="hero__hint">
          Aegis isolates the tainted agent. Chaperone blocks the call.
        </p>

        <p className="hero__stats mono">
          AGENTS 3 · TAINT EDGES LIVE · LEDGER ED25519
        </p>
      </div>
    </section>
  )
}
