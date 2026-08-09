import { useState } from 'react'
import { Hero } from './components/Hero'
import { Checkpoint } from './components/Checkpoint'
import './App.css'

type View = 'hero' | 'gate'

export default function App() {
  const [view, setView] = useState<View>('hero')

  return (
    <div className="app">
      {view === 'hero' ? (
        <Hero onEnter={() => setView('gate')} />
      ) : (
        <Checkpoint onBack={() => setView('hero')} />
      )}
    </div>
  )
}
