import { forwardRef, useEffect, useMemo } from 'react'
import type { MutableRefObject } from 'react'
import * as THREE from 'three'
import type { CreamUniforms } from './materials/creamMaterial'
import { createCreamMaterial } from './materials/creamMaterial'

/**
 * Perfil del pote (radio, altura) en coordenadas locales: sube por fuera,
 * pasa por el borde y baja por dentro, de modo que un único `LatheGeometry`
 * resuelve exterior, labio e interior con normales correctas.
 */
const JAR_PROFILE: [number, number][] = [
  [0.0, 0.0],
  [0.5, 0.0],
  [0.8, 0.005],
  [0.875, 0.045],
  [0.895, 0.16],
  [0.9, 0.32],
  [0.89, 0.46],
  [0.875, 0.525],
  [0.845, 0.552],
  [0.79, 0.556],
  [0.755, 0.545],
  [0.745, 0.42],
  [0.74, 0.26],
  [0.71, 0.17],
  [0.55, 0.135],
  [0.0, 0.13],
]

/** Centra el pote sobre el origen del grupo para que gire sobre sí mismo. */
export const JAR_Y_OFFSET = -0.28
/** Punto por el que se derrama la crema, en espacio local del grupo. */
export const JAR_LIP_LOCAL = new THREE.Vector3(-0.87, 0.552 + JAR_Y_OFFSET, 0)

interface CreamJarProps {
  segments: number
  detail: number
  innerUniformsRef: MutableRefObject<CreamUniforms | null>
}

/**
 * El ref apunta al ancla del labio; la escena lee su posición en mundo cada
 * frame para enganchar el chorro al pote mientras este se mueve.
 */
export const CreamJar = forwardRef<THREE.Object3D, CreamJarProps>(function CreamJar(
  { segments, detail, innerUniformsRef },
  lipRef,
) {
  const geometry = useMemo(() => {
    const control = JAR_PROFILE.map(([x, y]) => new THREE.Vector2(x, y))
    const points = new THREE.SplineCurve(control).getPoints(96)
    // El spline puede sobrepasar ligeramente el eje; un radio negativo invertiría caras.
    points.forEach((point) => {
      point.x = Math.max(point.x, 0)
    })
    return new THREE.LatheGeometry(points, segments)
  }, [segments])

  const shell = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#F4ECE2'),
        roughness: 0.17,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.07,
        envMapIntensity: 1.45,
        sheen: 0.25,
        sheenColor: new THREE.Color('#FFF3E6'),
      }),
    [],
  )

  const inner = useMemo(() => {
    const created = createCreamMaterial({ variant: 'pool', detail: detail * 0.6 })
    created.uniforms.uRadius.value = 0.62
    created.uniforms.uMound.value = 0.05
    return created
  }, [detail])

  useEffect(() => {
    innerUniformsRef.current = inner.uniforms
    return () => {
      innerUniformsRef.current = null
    }
  }, [inner, innerUniformsRef])

  useEffect(
    () => () => {
      geometry.dispose()
      shell.dispose()
      inner.material.dispose()
    },
    [geometry, shell, inner],
  )

  return (
    <group>
      <mesh
        geometry={geometry}
        material={shell}
        position={[0, JAR_Y_OFFSET, 0]}
      />

      {/*
        Superficie de crema dentro del pote. El grupo contrarresta parte de la
        inclinación del envase para que el contenido parezca asentado.
      */}
      <group position={[0, 0.22 + JAR_Y_OFFSET, 0]} rotation={[0, 0, -0.2]}>
        <mesh material={inner.material} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0, 0.62, Math.max(24, Math.round(segments * 0.6)), 10]} />
        </mesh>
      </group>

      <object3D ref={lipRef} position={JAR_LIP_LOCAL} />
    </group>
  )
})
