export const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value

/**
 * Interpolación independiente del framerate.
 * `lambda` alto = seguimiento rápido; bajo = inercia pesada (sensación viscosa).
 */
export const damp = (current: number, target: number, lambda: number, delta: number) =>
  current + (target - current) * (1 - Math.exp(-lambda * delta))

export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}
