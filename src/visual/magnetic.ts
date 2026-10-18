import { useEffect, useRef } from 'react'

/**
 * Magnetic pull: while the pointer is within `radius` px of the element's
 * centre, the element translates a fraction of the way toward the cursor and
 * springs back on leave. Transform-only; disabled for coarse pointers and
 * reduced-motion users.
 */
export function useMagnetic<T extends HTMLElement>(radius = 90, strength = 0.35) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(pointer: coarse)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    let tx = 0
    let ty = 0
    let cx = 0
    let cy = 0

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const dx = e.clientX - (r.left + r.width / 2)
      const dy = e.clientY - (r.top + r.height / 2)
      if (Math.hypot(dx, dy) < radius) {
        tx = dx * strength
        ty = dy * strength
      } else {
        tx = 0
        ty = 0
      }
    }

    const tick = () => {
      cx += (tx - cx) * 0.16
      cy += (ty - cy) * 0.16
      el.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`
      raf = requestAnimationFrame(tick)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    raf = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
      el.style.transform = ''
    }
  }, [radius, strength])

  return ref
}
