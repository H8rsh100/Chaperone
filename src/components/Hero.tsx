import './Hero.css'

type Props = {
  onEnter: () => void
}

export function Hero({ onEnter }: Props) {
  return (
    <section className="hero" aria-label="Chaperone introduction">
      <div className="hero__gate" aria-hidden>
        <span className="hero__beam" />
        <span className="hero__beam hero__beam--delay" />
        <div className="hero__iris">
          <div className="hero__iris-core" />
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
          Human-in-the-loop firewall for AI tool calls. Inspect risk. Approve or deny before anything runs.
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
