import { useEffect, useRef, useState } from 'react'
import { Hero } from './components/Hero'
import { Checkpoint } from './components/Checkpoint'
import { Swarm } from './components/Swarm'
import { FluidCanvas } from './components/FluidCanvas'
import { Atmosphere } from './components/Atmosphere'
import { Cursor } from './components/Cursor'
import { Preloader } from './components/Preloader'
import { fluidState, setFluid } from './visual/state'
import './App.css'

type View = 'hero' | 'swarm' | 'gate'
type Wipe = '' | 'in' | 'out'

function initialView(): View {
  const hash = window.location.hash.replace('#', '')
  return hash === 'swarm' || hash === 'gate' ? hash : 'hero'
}

export default function App() {
  const [view, setView] = useState<View>(initialView)
  const [wipe, setWipe] = useState<Wipe>('')
  const busy = useRef(false)

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      fluidState.pointerX = (e.clientX / window.innerWidth) * 2 - 1
      fluidState.pointerY = -((e.clientY / window.innerHeight) * 2 - 1)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  useEffect(() => {
    setFluid({ surface: view === 'hero' ? 'hero' : 'gate' })
  }, [view])

  const navigate = (next: View) => {
    if (next === view || busy.current) return
    busy.current = true
    setWipe('in')
    window.setTimeout(() => {
      setView(next)
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
      window.history.replaceState(
        null,
        '',
        next === 'hero' ? window.location.pathname : `#${next}`,
      )
      setWipe('out')
      window.setTimeout(() => {
        setWipe('')
        busy.current = false
      }, 480)
    }, 440)
  }

  return (
    <div className="app">
      <FluidCanvas />
      <Atmosphere />
      <div className="app__view">
        {view === 'hero' ? (
          <Hero
            onLaunch={() => navigate('swarm')}
            onKernel={() => navigate('gate')}
          />
        ) : view === 'swarm' ? (
          <Swarm
            onBack={() => navigate('hero')}
            onKernel={() => navigate('gate')}
          />
        ) : (
          <Checkpoint onBack={() => navigate('hero')} />
        )}
      </div>
      <Cursor />
      <div className={`wipe${wipe ? ` wipe--${wipe}` : ''}`} aria-hidden />
      <Preloader />
    </div>
  )
}
