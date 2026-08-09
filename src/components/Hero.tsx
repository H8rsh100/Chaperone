import './Hero.css'

type Props = {
  onEnter: () => void
}

export function Hero({ onEnter }: Props) {
  return (
    <section className="hero" aria-label="Chaperone introduction">
      <div className="hero__inner">
        <p className="hero__brand">Chaperone</p>
        <h1 className="hero__title">
          Nothing from your agent runs
          <br />
          <em>without you.</em>
        </h1>
        <p className="hero__lede">
          Real intercept on every tool call. Deny stops execution. Review
          freezes the agent until you click.
        </p>
        <button type="button" className="hero__btn" onClick={onEnter}>
          Enter checkpoint
        </button>
      </div>
    </section>
  )
}
