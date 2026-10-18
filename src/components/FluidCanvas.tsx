import { useEffect, useRef } from 'react'
import { setFluid } from '../visual/state'
import './FluidCanvas.css'

/**
 * The ferrofluid pool. The layered CSS fallback is always in the DOM and is the
 * guaranteed on-stage look; the WebGL2 canvas is progressive enhancement layered
 * on top and only revealed once a context + shaders compile cleanly.
 */
export function FluidCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    setFluid({ webgl: false })
  }, [])

  return (
    <div className="fluid" aria-hidden>
      <div className="fluid__fallback" />
      <canvas ref={canvasRef} className="fluid__canvas" />
    </div>
  )
}
