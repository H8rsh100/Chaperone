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
          <div className="hero__brand" aria-label="Chaperone">
            <span className="hero__brand-mark" aria-hidden="true"><span /></span>
            <span>CHAPERONE</span>
          </div>
          <div className="hero__header-note"><span /> SECURITY FOR THE AGENTIC AGE</div>
        </header>

        <main className="hero__main">
          <div className="hero__content">
            <p className="hero__eyebrow"><span /> AN INTERACTIVE SECURITY DEMO <span className="hero__eyebrow-index">/ 01</span></p>
            <h1 id="hero-title" className="hero__title">Trust is good.<br /><em>Lineage</em> is better<span>.</span></h1>
            <p className="hero__description">
              One poisoned page. Three scripted roles. See how untrusted content travels from
              a retriever to an executor, and how Chaperone gates the risky call before a human decides what happens next.
            </p>
            <div className="hero__actions">
              <button type="button" className="hero__cta" onClick={onLaunch}>
                Launch live demo <span aria-hidden="true">↗</span>
              </button>
              <button type="button" className="hero__kernel" onClick={onKernel}>
                Explore the kernel <span aria-hidden="true">→</span>
              </button>
            </div>
            <p className="hero__action-note"><span /> SCRIPTED SCENARIO <span className="hero__action-divider">/</span> HUMAN IN CONTROL</p>
          </div>

          <figure className="hero__figure" aria-labelledby="hero-diagram-caption">
            <div className="hero__figure-top"><span>THE PATH OF UNTRUSTED DATA</span><span>FIG. 01 / CONCEPT</span></div>
            <div className="hero__diagram">
              <svg viewBox="0 0 600 540" role="img" aria-labelledby="hero-graph-title hero-graph-desc">
                <title id="hero-graph-title">Illustrative agent lineage</title>
                <desc id="hero-graph-desc">A planner hands a task to a retriever. A poisoned page enters the retriever's context and travels to an executor. The kernel gates the proposed call for a human decision.</desc>
                <defs>
                  <radialGradient id="hero-glow"><stop offset="0" stopColor="#4dcfe0" stopOpacity=".14" /><stop offset="1" stopColor="#4dcfe0" stopOpacity="0" /></radialGradient>
                  <linearGradient id="hero-line" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#9df4f4" /><stop offset="1" stopColor="#ff8679" /></linearGradient>
                </defs>
                <circle cx="300" cy="264" r="250" fill="url(#hero-glow)" />
                <g className="hero__orbit" fill="none" stroke="#80dce5">
                  <circle cx="300" cy="264" r="222" opacity=".12" />
                  <circle cx="300" cy="264" r="180" opacity=".18" strokeDasharray="2 8" />
                  <circle cx="300" cy="264" r="130" opacity=".1" />
                  <path d="M78 264h444M300 42v444" opacity=".12" />
                  <circle cx="300" cy="42" r="3" fill="#a2f5f4" stroke="none" />
                  <circle cx="120" cy="264" r="2" fill="#a2f5f4" stroke="none" />
                </g>
                <g fill="none" strokeLinecap="round">
                  <path d="M173 203 C210 174 256 171 290 192" stroke="#77dbe4" strokeOpacity=".38" strokeWidth="1.5" />
                  <path d="M314 212 C352 235 374 270 387 309" stroke="url(#hero-line)" strokeOpacity=".65" strokeWidth="1.5" />
                  <path d="M314 212 C352 235 374 270 387 309" className="hero__signal" stroke="#ffc0ad" strokeWidth="2.5" strokeDasharray="3 12" />
                  <path d="M211 312 C232 288 257 260 287 217" stroke="#ff8c7b" strokeOpacity=".7" strokeWidth="1.5" strokeDasharray="4 6" />
                  <path d="M393 338 C386 371 351 392 316 398" stroke="#ff8c7b" strokeOpacity=".65" strokeWidth="1.5" />
                </g>
                <g className="hero__node">
                  <circle cx="155" cy="208" r="19" fill="#0b1a20" stroke="#9debf0" />
                  <circle cx="155" cy="208" r="5" fill="#9debf0" />
                  <text x="103" y="165" className="hero__svg-index">01 / ROLE</text>
                  <text x="103" y="183" className="hero__svg-label">PLANNER</text>
                </g>
                <g className="hero__node">
                  <circle cx="302" cy="202" r="25" fill="#0b1a20" stroke="#a7f4f3" />
                  <circle cx="302" cy="202" r="14" fill="none" stroke="#a7f4f3" strokeOpacity=".35" />
                  <circle cx="302" cy="202" r="5" fill="#a7f4f3" />
                  <text x="274" y="145" className="hero__svg-index">02 / ROLE</text>
                  <text x="274" y="163" className="hero__svg-label">RETRIEVER</text>
                </g>
                <g className="hero__node">
                  <circle cx="393" cy="323" r="25" fill="#201719" stroke="#ff9a8b" />
                  <circle cx="393" cy="323" r="14" fill="none" stroke="#ff9a8b" strokeOpacity=".4" />
                  <circle cx="393" cy="323" r="5" fill="#ff9a8b" />
                  <text x="433" y="316" className="hero__svg-index">03 / ROLE</text>
                  <text x="433" y="334" className="hero__svg-label">EXECUTOR</text>
                </g>
                <g>
                  <rect x="106" y="307" width="108" height="44" rx="2" fill="#211719" stroke="#ff8c7b" strokeOpacity=".5" />
                  <text x="119" y="325" className="hero__svg-alert">!  POISONED</text>
                  <text x="132" y="340" className="hero__svg-alert">PAGE</text>
                  <rect x="205" y="380" width="132" height="48" rx="2" fill="#0c1b20" stroke="#82dce3" strokeOpacity=".5" />
                  <text x="219" y="398" className="hero__svg-index">GUARDED BOUNDARY</text>
                  <text x="219" y="416" className="hero__svg-label">KERNEL GATES CALL</text>
                </g>
                <text x="68" y="465" className="hero__svg-coordinate">INPUT / UNTRUSTED</text>
                <text x="398" y="465" className="hero__svg-coordinate">DECISION / HUMAN</text>
              </svg>
              <span className="hero__diagram-cross hero__diagram-cross--one" aria-hidden="true">+</span>
              <span className="hero__diagram-cross hero__diagram-cross--two" aria-hidden="true">+</span>
            </div>
            <figcaption id="hero-diagram-caption" className="hero__figure-bottom">
              <span><i /> SCENARIO READY</span>
              <span>ILLUSTRATIVE DIAGRAM · NOT LIVE STATE</span>
            </figcaption>
          </figure>
        </main>

        <div className="hero__footer" aria-hidden="true">
          <span>TRACE THE SOURCE <b>↗</b> PROTECT THE ACTION</span>
          <span>CHAPERONE <b> / </b> DEMO ENVIRONMENT</span>
          <span>01 — 03</span>
        </div>
      </div>
    </section>
  )
}
