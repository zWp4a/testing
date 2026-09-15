import { useRef } from 'react'
import type { MutableRefObject } from 'react'
import { ContactShadows } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { PointerTarget } from '../../../hooks/usePointerTarget'
import type { PerformanceTier } from '../../../hooks/usePerformanceTier'
import { damp, smoothstep } from '../../../lib/math'
import { CreamFlow } from './CreamFlow'
import { CreamJar, JAR_LIP_LOCAL } from './CreamJar'
import { CreamPool } from './CreamPool'
import type { ImpactBus } from './CreamPool'
import type { CreamUniforms } from './materials/creamMaterial'
import { Studio } from './Studio'

/** Presupuesto de geometría y efectos por gama de dispositivo. */
const QUALITY = {
  high: {
    jarSegments: 64,
    streamSegments: 40,
    streamHeightSegments: 96,
    poolSegments: 96,
    poolRings: 26,
    dropCount: 3,
    detail: 1,
    envResolution: 256,
    contactShadows: true,
  },
  medium: {
    jarSegments: 40,
    streamSegments: 24,
    streamHeightSegments: 52,
    poolSegments: 56,
    poolRings: 14,
    dropCount: 2,
    detail: 0.55,
    envResolution: 128,
    contactShadows: false,
  },
} as const

const JAR_POSITION = new THREE.Vector3(1.35, 0.3, 0)
const JAR_TILT = 0.34
const POOL_Y = -1.3

/** Posición X del charco: bajo el labio del pote ya inclinado. */
const POOL_X =
  JAR_POSITION.x + JAR_LIP_LOCAL.x * Math.cos(JAR_TILT) - JAR_LIP_LOCAL.y * Math.sin(JAR_TILT)

/** Encuadre de escritorio: producto a la derecha, aire para el texto. */
const CAMERA_WIDE = { far: 5.4, near: 4.1, lookX: 0.5, lookY: -0.05 }
/** Encuadre vertical: cámara atrás y composición centrada para no recortar el pote. */
const CAMERA_COMPACT = { far: 7.8, near: 6.4, lookX: 0.85, lookY: -0.2 }

interface SceneProps {
  tier: Exclude<PerformanceTier, 'low'>
  pointer: MutableRefObject<PointerTarget>
  scroll: MutableRefObject<number>
}

export function Scene({ tier, pointer, scroll }: SceneProps) {
  const quality = QUALITY[tier]

  const jarRef = useRef<THREE.Group>(null)
  const lipRef = useRef<THREE.Object3D>(null)
  const poolUniforms = useRef<CreamUniforms | null>(null)
  const jarInnerUniforms = useRef<CreamUniforms | null>(null)
  const impactBus = useRef<ImpactBus['current']>(null)

  /** Cursor amortiguado. La crema lo lee con retraso, de ahí su peso aparente. */
  const sway = useRef(new THREE.Vector2())
  const lookAt = useRef(new THREE.Vector3(0.5, -0.05, 0))
  const spin = useRef(0)
  const yaw = useRef(0)

  useFrame((state, delta) => {
    const step = Math.min(delta, 1 / 30)
    const time = state.clock.elapsedTime
    const target = pointer.current
    const progress = scroll.current

    // Un lambda bajo convierte el seguimiento del cursor en inercia densa.
    sway.current.x = damp(sway.current.x, target.x * 0.07, 1.6, step)
    sway.current.y = damp(sway.current.y, target.y * 0.05, 1.6, step)

    const jar = jarRef.current
    if (jar) {
      // Rotación continua muy lenta + desvío sutil hacia el cursor.
      spin.current += 0.055 * step
      yaw.current = damp(yaw.current, target.x * 0.13, 2.4, step)
      jar.rotation.y = spin.current + yaw.current
      jar.rotation.x = damp(jar.rotation.x, -target.y * 0.07, 2.4, step)
      jar.rotation.z = damp(jar.rotation.z, JAR_TILT + target.x * 0.035, 2.4, step)
      jar.position.x = damp(jar.position.x, JAR_POSITION.x + target.x * 0.09, 2, step)
      jar.position.y = damp(
        jar.position.y,
        JAR_POSITION.y + target.y * 0.05 + Math.sin(time * 0.45) * 0.015,
        2,
        step,
      )
    }

    if (poolUniforms.current) {
      poolUniforms.current.uTime.value = time
      poolUniforms.current.uSway.value.copy(sway.current)
    }
    if (jarInnerUniforms.current) {
      jarInnerUniforms.current.uTime.value = time
      jarInnerUniforms.current.uSway.value.copy(sway.current)
    }

    // Encuadre adaptado a la relación de aspecto: 0 = móvil vertical, 1 = escritorio.
    const aspect = state.size.width / Math.max(state.size.height, 1)
    const wide = smoothstep(0.75, 1.35, aspect)
    const far = THREE.MathUtils.lerp(CAMERA_COMPACT.far, CAMERA_WIDE.far, wide)
    const near = THREE.MathUtils.lerp(CAMERA_COMPACT.near, CAMERA_WIDE.near, wide)

    // El scroll acerca la cámara al producto y sube ligeramente el encuadre.
    const camera = state.camera
    const targetZ = THREE.MathUtils.lerp(far, near, progress)
    camera.position.z = damp(camera.position.z, targetZ, 3, step)
    camera.position.x = damp(camera.position.x, target.x * 0.12, 1.8, step)
    camera.position.y = damp(camera.position.y, 0.15 + target.y * 0.06, 1.8, step)

    lookAt.current.x = damp(
      lookAt.current.x,
      THREE.MathUtils.lerp(CAMERA_COMPACT.lookX, CAMERA_WIDE.lookX, wide),
      3,
      step,
    )
    lookAt.current.y = damp(
      lookAt.current.y,
      THREE.MathUtils.lerp(CAMERA_COMPACT.lookY, CAMERA_WIDE.lookY, wide) + progress * 0.22,
      3,
      step,
    )
    camera.lookAt(lookAt.current)
  })

  return (
    <>
      <Studio resolution={quality.envResolution} />
      <fog attach="fog" args={['#F1E7DC', 5.2, 12]} />

      <group ref={jarRef} position={JAR_POSITION.toArray()} rotation={[0, 0, JAR_TILT]}>
        <CreamJar
          ref={lipRef}
          segments={quality.jarSegments}
          detail={quality.detail}
          innerUniformsRef={jarInnerUniforms}
        />
      </group>

      <CreamFlow
        lipRef={lipRef}
        poolY={POOL_Y}
        segments={quality.streamSegments}
        heightSegments={quality.streamHeightSegments}
        dropCount={quality.dropCount}
        detail={quality.detail}
        sway={sway}
        impactBus={impactBus}
      />

      <CreamPool
        position={[POOL_X, POOL_Y, 0]}
        radius={1.45}
        segments={quality.poolSegments}
        rings={quality.poolRings}
        detail={quality.detail}
        impactBus={impactBus}
        uniformsRef={poolUniforms}
      />

      {quality.contactShadows && (
        <ContactShadows
          position={[POOL_X + 0.3, POOL_Y - 0.07, 0]}
          scale={7}
          blur={3}
          opacity={0.42}
          far={3}
          resolution={256}
          color="#5B4A38"
        />
      )}
    </>
  )
}
