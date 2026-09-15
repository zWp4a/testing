import { useEffect, useRef } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import { clamp } from '../lib/math'

/**
 * Progreso 0..1 del scroll sobre el elemento indicado, escrito en un ref.
 * Se actualiza dentro de rAF para no forzar layout en cada evento de scroll.
 */
export function useScrollProgress(
  target: RefObject<HTMLElement>,
): MutableRefObject<number> {
  const progress = useRef(0)

  useEffect(() => {
    let frame = 0

    const measure = () => {
      frame = 0
      const element = target.current
      if (!element) return
      const height = element.offsetHeight || window.innerHeight
      progress.current = clamp(window.scrollY / height, 0, 1)
    }

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [target])

  return progress
}
