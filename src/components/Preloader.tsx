import { useEffect, useState } from 'react'
import './Preloader.css'

const BOOT_KEY = 'chaperone:booted'

/**
 * First-load sequence: the field charges, a droplet of ferrofluid falls and the
 * panel parts reveal the page. Hard-capped under ~2s and skipped entirely on
 * revisits (session) and for reduced-motion users.
 */
export function Preloader() {
  const [pct, setPct] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const [done, setDone] = useState(() => {
    try {
      const seen = sessionStorage.getItem(BOOT_KEY) === '1'
      if (seen) sessionStorage.setItem(BOOT_KEY, '1')
      return seen
    } catch {
      return true
    }
  })

  useEffect(() => {
    if (done) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      try {
        sessionStorage.setItem(BOOT_KEY, '1')
      } catch {
        /* ignore */
      }
      setDone(true)
      return
    }

    const started = performance.now()
    const dur = 1400
    const id = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - started) / dur)
      setPct(Math.round(100 * (1 - Math.pow(1 - t, 3))))
      if (t >= 1) {
        window.clearInterval(id)
        try {
          sessionStorage.setItem(BOOT_KEY, '1')
        } catch {
          /* ignore */
        }
        setLeaving(true)
        window.setTimeout(() => setDone(true), 600)
      }
    }, 32)
    return () => window.clearInterval(id)
  }, [done])

  if (done) return null

  return (
    <div className={`preloader${leaving ? ' preloader--leaving' : ''}`} aria-hidden>
      <div className="preloader__panel preloader__panel--top" />
      <div className="preloader__panel preloader__panel--bottom" />
      <div className="preloader__core">
        <span className="preloader__drop" />
        <span className="preloader__word">CHAPERONE</span>
        <span className="preloader__counter mono">{String(pct).padStart(3, '0')}</span>
      </div>
    </div>
  )
}
