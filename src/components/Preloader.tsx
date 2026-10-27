import { useEffect, useState } from 'react'
import './Preloader.css'

const BOOT_KEY = 'chaperone:booted'

export function Preloader() {
  const [leaving, setLeaving] = useState(false)
  const [done, setDone] = useState(() => {
    try {
      return sessionStorage.getItem(BOOT_KEY) === '1'
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

    const leaveId = window.setTimeout(() => {
      try {
        sessionStorage.setItem(BOOT_KEY, '1')
      } catch {
        /* ignore */
      }
      setLeaving(true)
    }, 550)
    const doneId = window.setTimeout(() => setDone(true), 850)
    return () => {
      window.clearTimeout(leaveId)
      window.clearTimeout(doneId)
    }
  }, [done])

  if (done) return null

  return (
    <div className={`preloader${leaving ? ' preloader--leaving' : ''}`} aria-hidden>
      <div className="preloader__core">
        <span className="preloader__signal" />
        <span className="preloader__word">CHAPERONE</span>
        <span className="preloader__line" />
      </div>
    </div>
  )
}
