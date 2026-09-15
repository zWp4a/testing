import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'

export interface PointerTarget {
  /** Posición normalizada del cursor, -1..1 en ambos ejes. */
  x: number
  y: number
  /** Velocidad instantánea suavizada: alimenta la reacción de la crema. */
  vx: number
  vy: number
}

/**
 * Escribe en un ref en lugar de en el estado: el hero se repinta a 60 fps dentro
 * del bucle de three.js y no debe provocar renders de React.
 */
export function usePointerTarget(): MutableRefObject<PointerTarget> {
  const pointer = useRef<PointerTarget>({ x: 0, y: 0, vx: 0, vy: 0 })

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return

    let frame = 0
    let pendingX = 0
    let pendingY = 0

    const flush = () => {
      frame = 0
      const current = pointer.current
      current.vx = pendingX - current.x
      current.vy = pendingY - current.y
      current.x = pendingX
      current.y = pendingY
    }

    const onPointerMove = (event: PointerEvent) => {
      pendingX = (event.clientX / window.innerWidth) * 2 - 1
      pendingY = -((event.clientY / window.innerHeight) * 2 - 1)
      if (!frame) frame = window.requestAnimationFrame(flush)
    }

    const onPointerLeave = () => {
      pendingX = 0
      pendingY = 0
      if (!frame) frame = window.requestAnimationFrame(flush)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.addEventListener('pointerleave', onPointerLeave)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerleave', onPointerLeave)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return pointer
}
