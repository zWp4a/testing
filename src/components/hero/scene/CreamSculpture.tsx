import { useEffect, useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { PerformanceTier } from '../../../hooks/usePerformanceTier'
import type { PointerTarget } from '../../../hooks/usePointerTarget'
import { damp, smoothstep } from '../../../lib/math'
import { CreamRig } from './creamRig'
import { compositeFragment } from './shaders/composite.frag'
import { creamFragment } from './shaders/cream.frag'
import { fullscreenVertex } from './shaders/fullscreen'

/**
 * Presupuesto por gama. `renderScale` es la palanca que más pesa: el raymarcher
 * cuesta por píxel, así que bajarlo un 20% ahorra casi el 40% del frame.
 */
const QUALITY = {
  high: { renderScale: 0.62, maxSteps: 88, shadow: 1, noise: 0.028, blurTaps: 12, maxBlur: 9 },
  medium: { renderScale: 0.44, maxSteps: 52, shadow: 0, noise: 0.02, blurTaps: 7, maxBlur: 6 },
} as const

/** Encuadre: tres cuartos ligeramente por debajo del sujeto. */
const ORBIT = { radius: 4.35, azimuth: 0.42, elevation: -0.16 }

interface CreamSculptureProps {
  tier: Exclude<PerformanceTier, 'low'>
  pointer: MutableRefObject<PointerTarget>
  scroll: MutableRefObject<number>
}

export function CreamSculpture({ tier, pointer, scroll }: CreamSculptureProps) {
  const quality = QUALITY[tier]
  const { gl, size } = useThree()

  const rig = useMemo(() => new CreamRig(), [])
  const offscreen = useMemo(() => new THREE.Scene(), [])
  const quadCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), [])

  // El raymarcher escribe en punto flotante para que el bokeh conserve el rango
  // alto de los brillos especulares.
  const target = useMemo(
    () =>
      new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType,
        depthBuffer: false,
        stencilBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      }),
    [],
  )

  const creamUniforms = useMemo(
    () => ({
      uAspect: { value: 1 },
      uTime: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uCamTarget: { value: new THREE.Vector3(0, 0.02, 0) },
      uFovScale: { value: 3.73 },
      uShift: { value: 0.42 },
      uMaxSteps: { value: quality.maxSteps },
      uShadow: { value: quality.shadow },
      uNoiseAmount: { value: quality.noise },
      uFocus: { value: ORBIT.radius },
      uAperture: { value: 0.34 },
      uBodyPos: { value: rig.bodyPosition },
      uBodyRad: { value: rig.bodyRadii },
      uArc: { value: rig.arc },
      uArcRad: { value: rig.arcRadii },
      uTendril: { value: rig.tendril },
      uTendrilRad: { value: rig.tendrilRadii },
      uBlobs: { value: rig.blobs },
      uDrops: { value: rig.drops },
      uDropBound: { value: rig.dropBound },
      uBound: { value: new THREE.Vector4(0, -0.1, 0, 2.35) },
    }),
    [quality, rig],
  )

  const compositeUniforms = useMemo(
    () => ({
      uScene: { value: target.texture },
      uTexel: { value: new THREE.Vector2() },
      uMaxBlur: { value: quality.maxBlur },
      uTaps: { value: quality.blurTaps },
      uTime: { value: 0 },
    }),
    [target, quality],
  )

  // Tamaño real del pase pesado. Se recalcula sólo cuando cambia el viewport.
  const bufferSize = useMemo(() => {
    const pixelRatio = Math.min(gl.getPixelRatio(), 2)
    return {
      width: Math.max(2, Math.round(size.width * pixelRatio * quality.renderScale)),
      height: Math.max(2, Math.round(size.height * pixelRatio * quality.renderScale)),
    }
  }, [gl, size.width, size.height, quality.renderScale])

  useEffect(() => {
    target.setSize(bufferSize.width, bufferSize.height)
    compositeUniforms.uTexel.value.set(1 / bufferSize.width, 1 / bufferSize.height)
  }, [target, bufferSize, compositeUniforms])

  useEffect(() => () => target.dispose(), [target])

  const sway = useRef(new THREE.Vector2())
  const orbit = useRef({ azimuth: ORBIT.azimuth, elevation: ORBIT.elevation, radius: ORBIT.radius })

  useFrame((state, delta) => {
    const step = Math.min(delta, 1 / 30)
    const time = state.clock.elapsedTime
    const progress = scroll.current
    const aspect = state.size.width / Math.max(state.size.height, 1)

    // Paralaje muy contenido: el cursor sugiere volumen, no conduce la cámara.
    sway.current.x = damp(sway.current.x, pointer.current.x * 0.06, 1.4, step)
    sway.current.y = damp(sway.current.y, pointer.current.y * 0.045, 1.4, step)

    rig.update(time, step, sway.current.x, sway.current.y)

    // El scroll gira lentamente la escultura y acerca la cámara.
    const o = orbit.current
    o.azimuth = damp(o.azimuth, ORBIT.azimuth + pointer.current.x * 0.07 + progress * 0.4, 2.2, step)
    o.elevation = damp(
      o.elevation,
      ORBIT.elevation + pointer.current.y * 0.05 + progress * 0.12,
      2.2,
      step,
    )
    o.radius = damp(o.radius, ORBIT.radius - progress * 0.55, 2.2, step)

    const cosE = Math.cos(o.elevation)
    creamUniforms.uCamPos.value.set(
      o.radius * cosE * Math.sin(o.azimuth),
      o.radius * Math.sin(o.elevation),
      o.radius * cosE * Math.cos(o.azimuth),
    )
    creamUniforms.uCamTarget.value.set(0, 0.02 + progress * 0.18, 0)

    // En vertical la escultura se centra; en apaisado deja el aire a la izquierda.
    const wide = smoothstep(0.8, 1.4, aspect)
    creamUniforms.uShift.value = damp(creamUniforms.uShift.value, wide * 0.44, 3, step)
    creamUniforms.uAspect.value = aspect
    creamUniforms.uTime.value = time
    // El plano de enfoque acompaña a la cámara para que la masa central sea nítida.
    creamUniforms.uFocus.value = o.radius - 0.15
    compositeUniforms.uTime.value = time

    gl.setRenderTarget(target)
    gl.render(offscreen, quadCamera)
    gl.setRenderTarget(null)
    gl.render(state.scene, quadCamera)
  }, 1)

  return (
    <>
      {createPortal(
        <mesh frustumCulled={false}>
          <planeGeometry args={[2, 2]} />
          <shaderMaterial
            vertexShader={fullscreenVertex}
            fragmentShader={creamFragment}
            uniforms={creamUniforms}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>,
        offscreen,
      )}

      <mesh frustumCulled={false}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          vertexShader={fullscreenVertex}
          fragmentShader={compositeFragment}
          uniforms={compositeUniforms}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
    </>
  )
}
