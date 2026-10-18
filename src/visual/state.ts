/**
 * External, render-loop-friendly visual state for the ferrofluid.
 *
 * React writes here via setFluid() when app state changes (verdict, score,
 * countdown). The WebGL canvas READS this object every animation frame and
 * never triggers a React re-render. Presentation only — no app logic lives here.
 */

export type FluidMode = 'idle' | 'allow' | 'review' | 'deny'

export interface FluidState {
  mode: FluidMode
  /** 0..1 normalised risk score. Drives spike count / amplitude. */
  risk: number
  /** 0..1 remaining field strength (countdown decay). */
  field: number
  /** Pointer in normalised coords, -1..1 (the magnet position). */
  pointerX: number
  pointerY: number
  /** View context: the hero wants a large open pool, the gate a contained one. */
  surface: 'hero' | 'gate'
  /** Whether the WebGL context is live (false → CSS fallback renders). */
  webgl: boolean
}

export const fluidState: FluidState = {
  mode: 'idle',
  risk: 0,
  field: 1,
  pointerX: 0,
  pointerY: 0,
  surface: 'hero',
  webgl: false,
}

export function setFluid(patch: Partial<FluidState>): void {
  Object.assign(fluidState, patch)
}

/**
 * One-shot impulse consumed by the canvas to play the collapse shockwave.
 * Written as a monotonic value the canvas compares against its last seen.
 */
let collapseToken = 0
export function triggerCollapse(): void {
  collapseToken += 1
}
export function readCollapseToken(): number {
  return collapseToken
}
