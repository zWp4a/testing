import { useEffect, useMemo } from 'react'
import type { MutableRefObject } from 'react'
import * as THREE from 'three'
import type { CreamUniforms } from './materials/creamMaterial'
import { createCreamMaterial } from './materials/creamMaterial'

export type ImpactBus = MutableRefObject<((time: number, strength: number) => void) | null>

interface CreamPoolProps {
  position: [number, number, number]
  radius: number
  segments: number
  rings: number
  detail: number
  impactBus: ImpactBus
  uniformsRef: MutableRefObject<CreamUniforms | null>
}

/**
 * Acumulación de crema al pie del chorro. La superficie es un disco deformado
 * en el vértice (montículo + ondas amortiguadas); debajo, un cilindro bajo le
 * da cuerpo para que el canto no se vea hueco en ángulos rasantes.
 */
export function CreamPool({
  position,
  radius,
  segments,
  rings,
  detail,
  impactBus,
  uniformsRef,
}: CreamPoolProps) {
  const surface = useMemo(() => {
    const created = createCreamMaterial({ variant: 'pool', detail })
    created.uniforms.uRadius.value = radius
    created.uniforms.uMound.value = 0.17
    return created
  }, [detail, radius])

  const body = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#F6F0E7'),
        roughness: 0.3,
        metalness: 0,
        clearcoat: 0.4,
        clearcoatRoughness: 0.45,
        envMapIntensity: 0.9,
      }),
    [],
  )

  useEffect(() => {
    uniformsRef.current = surface.uniforms
    return () => {
      uniformsRef.current = null
    }
  }, [surface, uniformsRef])

  // Registro circular de impactos: sólo tres ondas vivas a la vez, que es
  // cuanto puede leer el shader y más que suficiente a este ritmo de caída.
  useEffect(() => {
    let slot = 0
    const impacts = surface.uniforms.uImpacts.value
    impactBus.current = (time, strength) => {
      impacts[slot].set(time, strength)
      slot = (slot + 1) % impacts.length
    }
    return () => {
      impactBus.current = null
    }
  }, [surface, impactBus])

  useEffect(
    () => () => {
      surface.material.dispose()
      body.dispose()
    },
    [surface, body],
  )

  return (
    <group position={position}>
      <mesh material={surface.material} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0, radius, segments, rings]} />
      </mesh>

      <mesh material={body} position={[0, -0.06, 0]}>
        <cylinderGeometry args={[radius * 0.995, radius * 0.9, 0.12, segments, 1]} />
      </mesh>
    </group>
  )
}
