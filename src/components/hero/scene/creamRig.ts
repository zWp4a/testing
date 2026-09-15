import * as THREE from 'three'
import { clamp, smoothstep } from '../../../lib/math'

/**
 * Esqueleto animado de la escultura de crema.
 *
 * La CPU mueve un puñado de puntos y radios; la GPU sólo evalúa distancias.
 * Sin trigonometría dentro del raymarcher, que es donde cada operación se paga
 * decenas de veces por píxel.
 */

/** Puntos del arco principal (el barrido curvo que da la silueta). */
export const ARC_POINTS = 6
export const ARC_SEGMENTS = ARC_POINTS - 1
/** Puntos del hilo que desciende y se estira hasta desprender una gota. */
export const TENDRIL_POINTS = 6
export const TENDRIL_SEGMENTS = TENDRIL_POINTS - 1
/** Lóbulos fundidos en la masa central. */
export const BLOB_COUNT = 4
/** Gotas sueltas suspendidas alrededor. */
export const DROP_COUNT = 5

interface Wobble {
  amp: [number, number, number]
  freq: [number, number, number]
  phase: [number, number, number]
}

/** Pose de reposo del arco: entra por arriba a la izquierda y cae a la derecha. */
const ARC_REST: [number, number, number][] = [
  [-1.02, 0.94, -0.28],
  [-0.60, 0.60, 0.20],
  [-0.16, 0.32, 0.38],
  [0.30, 0.08, 0.20],
  [0.63, -0.30, -0.14],
  [0.80, -0.80, -0.42],
]

/** Fino en los extremos (hilos estirados), denso en el centro. */
const ARC_RADII = [0.042, 0.104, 0.156, 0.144, 0.098, 0.052]

/** Amplitudes crecientes hacia los extremos libres: el centro pesa más. */
const ARC_WOBBLE: Wobble[] = [
  { amp: [0.11, 0.09, 0.08], freq: [0.31, 0.24, 0.27], phase: [0.0, 1.7, 3.1] },
  { amp: [0.07, 0.06, 0.06], freq: [0.27, 0.33, 0.22], phase: [1.2, 2.9, 0.5] },
  { amp: [0.04, 0.035, 0.04], freq: [0.23, 0.29, 0.31], phase: [2.4, 0.8, 1.9] },
  { amp: [0.05, 0.04, 0.05], freq: [0.29, 0.21, 0.26], phase: [3.6, 2.2, 0.9] },
  { amp: [0.08, 0.07, 0.07], freq: [0.25, 0.32, 0.24], phase: [0.7, 3.4, 2.6] },
  { amp: [0.12, 0.1, 0.09], freq: [0.33, 0.26, 0.3], phase: [2.0, 1.1, 3.8] },
]

const TENDRIL_REST: [number, number, number][] = [
  [0.1, -0.06, 0.12],
  [0.17, -0.44, 0.06],
  [0.21, -0.82, -0.02],
  [0.18, -1.16, -0.07],
  [0.11, -1.44, -0.02],
  [0.03, -1.64, 0.07],
]

const TENDRIL_RADII = [0.172, 0.132, 0.101, 0.076, 0.056, 0.078]

const BLOB_REST: [number, number, number, number][] = [
  [-0.34, 0.44, 0.12, 0.27],
  [0.36, 0.36, -0.14, 0.24],
  [0.06, 0.58, 0.26, 0.21],
  [-0.1, 0.02, -0.3, 0.26],
]

/** Duración del ciclo de estirado y ruptura del hilo, en segundos. */
const BREAK_CYCLE = 15.5

interface Drop {
  position: THREE.Vector3
  velocity: THREE.Vector3
  radius: number
  life: number
  duration: number
}

export class CreamRig {
  readonly arc = new Float32Array(ARC_POINTS * 3)
  readonly arcRadii = new Float32Array(ARC_POINTS)
  readonly tendril = new Float32Array(TENDRIL_POINTS * 3)
  readonly tendrilRadii = new Float32Array(TENDRIL_POINTS)
  readonly blobs = new Float32Array(BLOB_COUNT * 4)
  readonly drops = new Float32Array(DROP_COUNT * 4)

  readonly bodyPosition = new THREE.Vector3()
  readonly bodyRadii = new THREE.Vector3()
  /** Esfera que envuelve sólo las gotas sueltas: permite saltárselas de golpe. */
  readonly dropBound = new THREE.Vector4(0, 0, 0, 0.001)

  private readonly dropStates: Drop[] = Array.from({ length: DROP_COUNT }, (_, index) => ({
    position: new THREE.Vector3(0, -50, 0),
    velocity: new THREE.Vector3(),
    radius: 0,
    // Vidas escalonadas para que nunca aparezcan ni desaparezcan a la vez.
    life: -index * 1.9,
    duration: 7.5 + index * 0.8,
  }))

  private readonly tip = new THREE.Vector3()

  update(time: number, delta: number, swayX: number, swayY: number) {
    // Flotación global muy lenta: la escultura respira, no se desplaza.
    const floatY = Math.sin(time * 0.31) * 0.045
    const floatX = Math.sin(time * 0.23 + 1.4) * 0.03

    this.updateArc(time, floatX, floatY, swayX, swayY)
    const stretch = this.updateTendril(time, floatX, floatY, swayX)
    this.updateBody(time, floatX, floatY)
    this.updateDrops(time, delta, stretch)
  }

  private updateArc(time: number, floatX: number, floatY: number, swayX: number, swayY: number) {
    for (let i = 0; i < ARC_POINTS; i++) {
      const rest = ARC_REST[i]
      const w = ARC_WOBBLE[i]
      // Los extremos acusan más el cursor: la masa central apenas se inmuta.
      const reach = 0.4 + 0.6 * Math.abs(i - 2.5) / 2.5

      this.arc[i * 3 + 0] =
        rest[0] + w.amp[0] * Math.sin(time * w.freq[0] + w.phase[0]) + floatX + swayX * reach
      this.arc[i * 3 + 1] =
        rest[1] + w.amp[1] * Math.sin(time * w.freq[1] + w.phase[1]) + floatY + swayY * reach
      this.arc[i * 3 + 2] =
        rest[2] + w.amp[2] * Math.sin(time * w.freq[2] + w.phase[2])

      // Los hilos finos laten al estirarse; el cuerpo del arco casi no.
      const pulse = 1 + 0.12 * Math.sin(time * 0.44 + i * 1.3) * (i === 0 || i === 5 ? 1.6 : 0.5)
      this.arcRadii[i] = ARC_RADII[i] * pulse
    }
  }

  /** Devuelve el avance 0..1 del estirado actual del hilo. */
  private updateTendril(time: number, floatX: number, floatY: number, swayX: number) {
    const cycle = ((time % BREAK_CYCLE) + BREAK_CYCLE) % BREAK_CYCLE
    const phase = cycle / BREAK_CYCLE

    // 0 → 0.72: el hilo se alarga y se estrangula. 0.72 → 1: retrocede y se recupera.
    const stretch = phase < 0.72 ? smoothstep(0, 0.72, phase) : 1 - smoothstep(0.72, 0.9, phase)
    const necking = phase < 0.72 ? smoothstep(0.25, 0.72, phase) : 1 - smoothstep(0.72, 0.86, phase)

    for (let i = 0; i < TENDRIL_POINTS; i++) {
      const rest = TENDRIL_REST[i]
      const depth = i / (TENDRIL_POINTS - 1)
      // El arrastre lateral crece con la profundidad: abajo siempre va con retraso.
      const lag = depth * depth

      this.tendril[i * 3 + 0] =
        rest[0] +
        0.06 * Math.sin(time * 0.29 - depth * 2.2) +
        floatX +
        swayX * (0.15 + 1.1 * lag)
      this.tendril[i * 3 + 1] = rest[1] + floatY - stretch * 0.34 * depth * depth
      this.tendril[i * 3 + 2] = rest[2] + 0.05 * Math.cos(time * 0.24 - depth * 1.8)

      let radius = TENDRIL_RADII[i]
      // El estrangulamiento se concentra justo encima de la gota terminal.
      if (i === 4) radius *= 1 - 0.72 * necking
      if (i === 3) radius *= 1 - 0.3 * necking
      // La gota terminal engorda mientras el hilo se afina.
      if (i === 5) radius *= 1 + 0.35 * necking
      radius *= 1 + 0.06 * Math.sin(time * 0.5 - i * 0.9)
      this.tendrilRadii[i] = radius
    }

    this.tip.set(
      this.tendril[(TENDRIL_POINTS - 1) * 3 + 0],
      this.tendril[(TENDRIL_POINTS - 1) * 3 + 1],
      this.tendril[(TENDRIL_POINTS - 1) * 3 + 2],
    )

    return necking
  }

  private updateBody(time: number, floatX: number, floatY: number) {
    this.bodyPosition.set(floatX * 0.5, 0.26 + floatY, 0)
    this.bodyRadii.set(
      0.54 + 0.018 * Math.sin(time * 0.27),
      0.42 + 0.022 * Math.sin(time * 0.33 + 1.1),
      0.47 + 0.016 * Math.sin(time * 0.21 + 2.3),
    )

    for (let i = 0; i < BLOB_COUNT; i++) {
      const rest = BLOB_REST[i]
      this.blobs[i * 4 + 0] = rest[0] + 0.05 * Math.sin(time * 0.26 + i * 1.7) + floatX
      this.blobs[i * 4 + 1] = rest[1] + 0.04 * Math.sin(time * 0.31 + i * 2.3) + floatY
      this.blobs[i * 4 + 2] = rest[2] + 0.05 * Math.cos(time * 0.23 + i * 1.1)
      this.blobs[i * 4 + 3] = rest[3] * (1 + 0.07 * Math.sin(time * 0.29 + i * 0.8))
    }
  }

  /**
   * Las gotas nacen en la punta del hilo cuando está más estrangulado, se
   * separan y vuelven a fundirse en nada. Nunca salen del encuadre: así la
   * esfera contenedora se mantiene pequeña y el raymarcher barato.
   */
  private updateDrops(time: number, delta: number, stretch: number) {
    let minX = Infinity
    let minY = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let maxZ = -Infinity
    let active = 0

    for (let i = 0; i < DROP_COUNT; i++) {
      const drop = this.dropStates[i]
      drop.life += delta

      if (drop.life >= drop.duration) {
        drop.life = 0
        drop.duration = 6.5 + Math.random() * 2.5
        // Nacen donde el hilo está a punto de romperse, o en el arco si no lo está.
        const fromTendril = stretch > 0.45 || Math.random() < 0.5
        if (fromTendril) {
          drop.position.copy(this.tip)
        } else {
          const at = Math.floor(Math.random() * ARC_POINTS)
          drop.position.set(this.arc[at * 3], this.arc[at * 3 + 1], this.arc[at * 3 + 2])
        }
        drop.position.x += (Math.random() - 0.5) * 0.18
        drop.position.z += (Math.random() - 0.5) * 0.18
        drop.velocity.set(
          (Math.random() - 0.5) * 0.025,
          -0.012 - Math.random() * 0.02,
          (Math.random() - 0.5) * 0.022,
        )
        drop.radius = 0.026 + Math.random() * 0.036
      }

      if (drop.life < 0) {
        this.drops[i * 4 + 0] = 0
        this.drops[i * 4 + 1] = -50
        this.drops[i * 4 + 2] = 0
        this.drops[i * 4 + 3] = 0.001
        continue
      }

      // Gravedad casi nula y con tope: el conjunto está congelado en movimiento
      // y las gotas nunca se alejan lo bastante como para agrandar la esfera
      // contenedora que hace barato el raymarching.
      drop.velocity.y = Math.max(drop.velocity.y - 0.006 * delta, -0.055)
      drop.position.addScaledVector(drop.velocity, delta)

      const u = clamp(drop.life / drop.duration, 0, 1)
      const envelope = smoothstep(0, 0.1, u) * (1 - smoothstep(0.82, 1, u))
      const radius = drop.radius * envelope

      this.drops[i * 4 + 0] = drop.position.x
      this.drops[i * 4 + 1] = drop.position.y
      this.drops[i * 4 + 2] = drop.position.z
      this.drops[i * 4 + 3] = radius

      if (radius > 0.002) {
        active++
        minX = Math.min(minX, drop.position.x - radius)
        maxX = Math.max(maxX, drop.position.x + radius)
        minY = Math.min(minY, drop.position.y - radius)
        maxY = Math.max(maxY, drop.position.y + radius)
        minZ = Math.min(minZ, drop.position.z - radius)
        maxZ = Math.max(maxZ, drop.position.z + radius)
      }
    }

    if (active === 0) {
      this.dropBound.set(0, -60, 0, 0.001)
      return
    }

    const cx = (minX + maxX) * 0.5
    const cy = (minY + maxY) * 0.5
    const cz = (minZ + maxZ) * 0.5
    const half = Math.hypot(maxX - cx, maxY - cy, maxZ - cz)
    this.dropBound.set(cx, cy, cz, half)
  }
}
