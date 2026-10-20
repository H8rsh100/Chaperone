import { useEffect, useRef } from 'react'
import './Cursor.css'

/**
 * Custom pointer: a tight violet dot plus a lagging ring that swells and
 * deforms toward interactive elements (a magnetic lens). Hidden on touch.
 */
export function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let x = window.innerWidth / 2
    let y = window.innerHeight / 2
    let rx = x
    let ry = y
    let scale = 1
    let target = 1
    let raf = 0

    const onMove = (e: PointerEvent) => {
      x = e.clientX
      y = e.clientY
      const el = e.target as HTMLElement | null
      const interactive = !!el?.closest('button, a, input, [role="button"], .magnetic')
      target = interactive ? 1.9 : 1
      if (reduce) tick()
    }

    const tick = () => {
      rx += (x - rx) * 0.18
      ry += (y - ry) * 0.18
      scale += (target - scale) * 0.2
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
      }
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`
      }
      if (!reduce) raf = requestAnimationFrame(tick)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    if (reduce) tick()
    else raf = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="cursor" aria-hidden>
      <div ref={dotRef} className="cursor__dot" />
      <div ref={ringRef} className="cursor__ring" />
    </div>
  )
}
