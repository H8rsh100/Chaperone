import { useEffect, useRef, useState } from 'react'
import { Hero } from './components/Hero'
import { Checkpoint } from './components/Checkpoint'
import { FluidCanvas } from './components/FluidCanvas'
import { Atmosphere } from './components/Atmosphere'
import { Cursor } from './components/Cursor'
import { Preloader } from './components/Preloader'
import { fluidState, setFluid } from './visual/state'
import './App.css'

type View = 'hero' | 'gate'
type Wipe = '' | 'in' | 'out'

export default function App() {
  const [view, setView] = useState<View>('hero')
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
          <Hero onEnter={() => navigate('gate')} />
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
