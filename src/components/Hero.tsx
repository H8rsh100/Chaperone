import { useEffect } from 'react'
import { setFluid } from '../visual/state'
import './Hero.css'

type Props = {
  onLaunch: () => void
  onKernel: () => void
}

export function Hero({ onLaunch, onKernel }: Props) {
  useEffect(() => {
    setFluid({ mode: 'idle', risk: 0, field: 1, surface: 'hero' })
  }, [])

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__shell">
        <header className="hero__header">
          <div className="hero__brand"><span className="hero__brand-mark" aria-hidden="true" /> CHAPERONE</div>
          <div className="hero__header-note"><span /> SECURITY FOR THE AGENTIC AGE</div>
        </header>

        <main className="hero__main">
          <div className="hero__intro">
            <p className="hero__eyebrow"><span /> A CLOSER LOOK AT AGENT TRUST</p>
            <span className="hero__index" aria-hidden="true">FIELD NOTES / 01</span>
          </div>

          <h1 id="hero-title" className="hero__title" aria-label="Chaperone">
            <span className="hero__title-letters" aria-hidden="true">
              {'CHAPERONE'.split('').map((letter, index) => (
                <span key={index} style={{ animationDelay: `${0.3 + index * 0.065}s` }}>{letter}</span>
              ))}
            </span>
          </h1>

          <div className="hero__title-rule" aria-hidden="true"><span /></div>

          <div className="hero__body">
            <div className="hero__content">
              <p className="hero__statement">Trust is good.<br /><em>Lineage</em> is better.</p>
              <p className="hero__description">
                Chaperone traces how untrusted content moves between AI agents. Follow a scripted
                scenario where a poisoned page reaches an executor and a human decides what happens next.
              </p>
              <div className="hero__actions">
                <button type="button" className="hero__cta" onClick={onLaunch}>
                  Enter Chaperone <span aria-hidden="true">↗</span>
                </button>
                <button type="button" className="hero__kernel" onClick={onKernel}>
                  Kernel <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>

            <aside className="hero__note" aria-label="Scenario overview">
              <div className="hero__note-heading"><span>THE SCENARIO</span><span>01 / 03</span></div>
              <p>One page.<br />Three roles.<br /><em>A decision point.</em></p>
              <div className="hero__note-bottom"><span /> FOLLOW THE SOURCE</div>
            </aside>
          </div>
        </main>

        <div className="hero__footer" aria-hidden="true">
          <span>TRACE THE SOURCE <b>↗</b> UNDERSTAND THE ACTION</span>
          <span>CHAPERONE <b>/</b> FIELD NOTES</span>
          <span>01 — 03</span>
        </div>
      </div>
    </section>
  )
}
