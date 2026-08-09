import './Hero.css'

type Props = {
  onEnter: () => void
}

export function Hero({ onEnter }: Props) {
  return (
    <section className="hero" aria-label="Chaperone introduction">
      <div className="hero__stage" aria-hidden>
        <div className="hero__portal">
          <span className="hero__bracket hero__bracket--tl" />
          <span className="hero__bracket hero__bracket--tr" />
          <span className="hero__bracket hero__bracket--bl" />
          <span className="hero__bracket hero__bracket--br" />

          <div className="hero__lanes">
            <span />
            <span />
            <span />
          </div>

          <div className="hero__scanner" />
          <div className="hero__packet">
            <span className="hero__packet-tag">TOOL_CALL</span>
            <span className="hero__packet-body">shell · pending inspect</span>
          </div>

          <div className="hero__rail hero__rail--left" />
          <div className="hero__rail hero__rail--right" />
        </div>

        <div className="hero__telemetry">
          <span>GATE 01</span>
          <span>POLICY ENFORCE</span>
          <span className="hero__telemetry-live">LIVE</span>
        </div>
      </div>

      <div className="hero__copy">
        <p className="hero__brand">Chaperone</p>
        <h1 className="hero__title">
          Every agent action
          <br />
          stops here first.
        </h1>
        <p className="hero__lede">
          Human-in-the-loop firewall for AI tool calls. Inspect risk. Approve or
          deny before anything runs.
        </p>
        <div className="hero__cta">
          <button type="button" className="hero__btn" onClick={onEnter}>
            Enter checkpoint
          </button>
          <span className="hero__meta">shell · http · fs · db · secrets</span>
        </div>
      </div>
    </section>
  )
}
