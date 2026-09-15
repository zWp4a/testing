import { useEffect, useState } from 'react'
import type { MutableRefObject } from 'react'
import { Canvas } from '@react-three/fiber'
import type { PointerTarget } from '../../hooks/usePointerTarget'
import type { PerformanceTier } from '../../hooks/usePerformanceTier'
import { CreamSculpture } from './scene/CreamSculpture'

interface HeroStageProps {
  tier: Exclude<PerformanceTier, 'low'>
  pointer: MutableRefObject<PointerTarget>
  scroll: MutableRefObject<number>
  onReady: () => void
}

/**
 * El coste real vive en `renderScale` dentro de CreamSculpture, no aquí, así
 * que el DPR se fija de entrada en vez de dejarlo oscilar: un raymarcher que
 * cambia de resolución en marcha se nota como un parpadeo de nitidez.
 */
const MAX_DPR = { high: 1.5, medium: 1.25 } as const

// Este módulo es el único que importa three.js: Vite lo saca del bundle inicial.
export default function HeroStage({ tier, pointer, scroll, onReady }: HeroStageProps) {
  const [running, setRunning] = useState(true)

  useEffect(() => {
    const onVisibility = () => setRunning(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  return (
    <Canvas
      frameloop={running ? 'always' : 'never'}
      dpr={MAX_DPR[tier]}
      gl={{
        alpha: false,
        antialias: false, // El pase de composición ya suaviza; el MSAA aquí no aporta.
        powerPreference: 'high-performance',
        depth: false,
        stencil: false,
      }}
      onCreated={onReady}
    >
      <CreamSculpture tier={tier} pointer={pointer} scroll={scroll} />
    </Canvas>
  )
}
