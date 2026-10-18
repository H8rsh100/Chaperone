import './Atmosphere.css'

/**
 * Global depth layer: a slow violet field-glow, faint iron-filing field lines,
 * animated film grain and a soft vignette. Purely decorative.
 */
export function Atmosphere() {
  return (
    <div className="atmosphere" aria-hidden>
      <div className="atmosphere__glow" />
      <svg className="atmosphere__lines" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
        <g fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M-50 500 C 250 300, 750 300, 1050 500" />
          <path d="M-50 560 C 250 380, 750 380, 1050 560" />
          <path d="M-50 640 C 250 500, 750 500, 1050 640" />
          <path d="M-50 440 C 250 220, 750 220, 1050 440" />
          <path d="M500 -50 C 300 300, 300 700, 500 1050" />
          <path d="M560 -50 C 400 300, 400 700, 560 1050" />
          <path d="M440 -50 C 200 300, 200 700, 440 1050" />
        </g>
      </svg>
      <div className="atmosphere__grain" />
      <div className="atmosphere__vignette" />
    </div>
  )
}
