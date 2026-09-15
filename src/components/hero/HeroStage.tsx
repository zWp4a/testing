import { useEffect, useState } from 'react'
import type { MutableRefObject } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import type { PointerTarget } from '../../hooks/usePointerTarget'
import type { PerformanceTier } from '../../hooks/usePerformanceTier'
import { Scene } from './scene/Scene'

interface HeroStageProps {
  tier: Exclude<PerformanceTier, 'low'>
  pointer: MutableRefObject<PointerTarget>
  scroll: MutableRefObject<number>
  /** Se llama en el primer frame para fundir el póster estático. */
  onReady: () => void
}

const MAX_DPR = { high: 1.75, medium: 1.25 } as const

/**
 * Este módulo es el único que importa three.js, así que Vite lo saca del bundle
 * inicial: en gama baja el paquete 3D nunca llega a descargarse.
 */
export default function HeroStage({ tier, pointer, scroll, onReady }: HeroStageProps) {
  const [dpr, setDpr] = useState(Math.min(MAX_DPR[tier], 1.5))
  const [running, setRunning] = useState(true)

  // No gastar GPU con la pestaña en segundo plano.
  useEffect(() => {
    const onVisibility = () => setRunning(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  return (
    <Canvas
      frameloop={running ? 'always' : 'never'}
      dpr={dpr}
      gl={{
        alpha: true,
        antialias: tier === 'high',
        powerPreference: 'high-performance',
        stencil: false,
        depth: true,
      }}
      camera={{ fov: 32, position: [0, 0.15, 5.4], near: 0.5, far: 20 }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.06
        scene.background = null
        onReady()
      }}
    >
      {/* Si el equipo no sostiene el ritmo, se baja la resolución antes que los efectos. */}
      <PerformanceMonitor
        onDecline={() => setDpr((current) => Math.max(1, current - 0.25))}
        onIncline={() => setDpr((current) => Math.min(MAX_DPR[tier], current + 0.25))}
      >
        <Scene tier={tier} pointer={pointer} scroll={scroll} />
      </PerformanceMonitor>
    </Canvas>
  )
}
