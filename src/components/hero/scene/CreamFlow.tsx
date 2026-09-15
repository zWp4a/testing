import { useEffect, useMemo, useRef } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { CreamUniforms } from './materials/creamMaterial'
import { createCreamMaterial } from './materials/creamMaterial'
import type { ImpactBus } from './CreamPool'

interface Drop {
  mesh: THREE.Mesh
  uniforms: CreamUniforms
  y: number
  velocity: number
  scale: number
  offsetX: number
  offsetZ: number
  /** Momento en el que la gota vuelve a desprenderse del chorro. */
  nextRelease: number
}

interface CreamFlowProps {
  lipRef: RefObject<THREE.Object3D>
  poolY: number
  segments: number
  heightSegments: number
  dropCount: number
  detail: number
  sway: MutableRefObject<THREE.Vector2>
  impactBus: ImpactBus
}

const STREAM_RADIUS = 0.135
const GRAVITY = 1.9 // Deliberadamente bajo: la crema pesada cae despacio.

/** Desplazamiento lateral suficiente para que la gota se lea fuera del chorro. */
function satelliteOffset() {
  const angle = Math.random() * Math.PI * 2
  const distance = 0.17 + Math.random() * 0.1
  return { offsetX: Math.cos(angle) * distance, offsetZ: Math.sin(angle) * distance * 0.6 }
}

/**
 * Chorro continuo anclado al labio del pote más algunas gotas desprendidas.
 * El chorro es un cilindro de altura unitaria deformado en el shader, así que
 * la CPU sólo actualiza posición, escala y un puñado de uniforms por frame.
 */
export function CreamFlow({
  lipRef,
  poolY,
  segments,
  heightSegments,
  dropCount,
  detail,
  sway,
  impactBus,
}: CreamFlowProps) {
  const streamRef = useRef<THREE.Mesh>(null)
  const dropsRef = useRef<THREE.Group>(null)
  const lipWorld = useRef(new THREE.Vector3())
  const lastPulse = useRef(0)

  const stream = useMemo(() => createCreamMaterial({ variant: 'stream', detail }), [detail])

  const streamGeometry = useMemo(() => {
    const geometry = new THREE.CylinderGeometry(
      STREAM_RADIUS,
      STREAM_RADIUS,
      1,
      segments,
      heightSegments,
      false, // Con tapas: evita ver el tubo hueco si la cámara sube con el scroll.
    )
    // El borde superior queda en y = 0 para poder anclarlo al labio y escalar en Y.
    geometry.translate(0, -0.5, 0)
    return geometry
  }, [segments, heightSegments])

  const dropGeometry = useMemo(
    () => new THREE.IcosahedronGeometry(1, detail > 0.7 ? 3 : 2),
    [detail],
  )

  const drops = useMemo<Drop[]>(() => {
    return Array.from({ length: dropCount }, (_, index) => {
      const created = createCreamMaterial({ variant: 'drop', detail })
      const mesh = new THREE.Mesh(dropGeometry, created.material)
      mesh.visible = false
      return {
        mesh,
        uniforms: created.uniforms,
        y: 0,
        velocity: 0,
        scale: 0.045 + Math.random() * 0.03,
        ...satelliteOffset(),
        nextRelease: 0.8 + index * 1.7,
      }
    })
  }, [dropCount, dropGeometry, detail])

  useEffect(() => {
    const group = dropsRef.current
    if (!group) return
    drops.forEach((drop) => group.add(drop.mesh))
    return () => {
      drops.forEach((drop) => group.remove(drop.mesh))
    }
  }, [drops])

  useEffect(
    () => () => {
      streamGeometry.dispose()
      dropGeometry.dispose()
      stream.material.dispose()
      drops.forEach((drop) => (drop.mesh.material as THREE.Material).dispose())
    },
    [streamGeometry, dropGeometry, stream, drops],
  )

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime
    const step = Math.min(delta, 1 / 30) // Protege la simulación ante frames largos.
    const lip = lipRef.current
    const streamMesh = streamRef.current
    if (!lip || !streamMesh) return

    lip.getWorldPosition(lipWorld.current)
    const length = Math.max(lipWorld.current.y - poolY, 0.2)

    streamMesh.position.set(lipWorld.current.x, lipWorld.current.y, lipWorld.current.z)
    streamMesh.scale.y = length

    stream.uniforms.uTime.value = time
    stream.uniforms.uSway.value.copy(sway.current)

    // Los pulsos que descienden por el chorro golpean el charco con ritmo propio.
    if (time - lastPulse.current > 1.35) {
      lastPulse.current = time
      impactBus.current?.(time, 0.045)
    }

    if (dropsRef.current) {
      dropsRef.current.position.set(lipWorld.current.x, 0, lipWorld.current.z)
    }

    for (const drop of drops) {
      if (!drop.mesh.visible) {
        if (time < drop.nextRelease) continue
        drop.mesh.visible = true
        drop.y = lipWorld.current.y - 0.7
        drop.velocity = 0
      }

      drop.velocity += GRAVITY * step
      drop.y -= drop.velocity * step

      // Estirado proporcional a la velocidad, con volumen conservado en el shader.
      drop.uniforms.uTime.value = time
      drop.uniforms.uStretch.value = 1 + Math.min(drop.velocity * 0.34, 1.15)
      drop.uniforms.uSway.value.copy(sway.current)

      drop.mesh.position.set(drop.offsetX, drop.y, drop.offsetZ)
      drop.mesh.scale.setScalar(drop.scale)

      if (drop.y <= poolY + drop.scale) {
        impactBus.current?.(time, 0.03 + drop.scale * 0.45)
        drop.mesh.visible = false
        drop.nextRelease = time + 1.6 + Math.random() * 2.4
        Object.assign(drop, satelliteOffset())
      }
    }
  })

  return (
    <>
      <mesh ref={streamRef} geometry={streamGeometry} material={stream.material} />
      <group ref={dropsRef} />
    </>
  )
}
