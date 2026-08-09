import './Hero.css'

type Props = {
  onEnter: () => void
}

export function Hero({ onEnter }: Props) {
  return (
    <section className="hero" aria-label="Chaperone introduction">
      <header className="hero__top">
        <span className="hero__mark">CH</span>
        <span className="hero__top-note">tool calls stop here</span>
      </header>

      <div className="hero__main">
        <p className="hero__brand">Chaperone</p>
        <h1 className="hero__title">
          AI tries.
          <br />
          You decide.
        </h1>
        <p className="hero__lede">
          Freeze every agent tool call before it runs. Deny blocks for real.
          Review waits on your click.
        </p>
        <button type="button" className="hero__btn" onClick={onEnter}>
          Open the gate
        </button>
      </div>

      <div className="hero__floor" aria-hidden>
        <div className="hero__block hero__block--deny">DENY</div>
        <div className="hero__block hero__block--hold">HOLD</div>
        <div className="hero__block hero__block--allow">ALLOW</div>
      </div>
    </section>
  )
}
