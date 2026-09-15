import { useEffect, useState } from 'react'

export type PerformanceTier = 'high' | 'medium' | 'low'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Detecta si hay WebGL real (no software rasterizer) y estima la potencia del
 * dispositivo. Se ejecuta una sola vez y descarta el contexto de prueba.
 */
function detectTier(): PerformanceTier {
  if (typeof window === 'undefined') return 'low'
  if (prefersReducedMotion()) return 'low'

  const canvas = document.createElement('canvas')
  const gl = (canvas.getContext('webgl2') ||
    canvas.getContext('webgl')) as WebGLRenderingContext | null

  if (!gl) return 'low'

  let renderer = ''
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
  if (debugInfo) {
    renderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? '')
  }
  // Libera el contexto de prueba de inmediato: los navegadores limitan cuántos hay vivos.
  gl.getExtension('WEBGL_lose_context')?.loseContext()

  if (/swiftshader|llvmpipe|software|basic render/i.test(renderer)) return 'low'

  const cores = navigator.hardwareConcurrency ?? 4
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches

  if (cores <= 4 || memory <= 4) return coarsePointer ? 'low' : 'medium'
  if (coarsePointer) return 'medium'
  return 'high'
}

/**
 * Devuelve `null` durante el primer render para no bloquear la pintura inicial;
 * el hero muestra el póster estático mientras tanto.
 */
export function usePerformanceTier(): PerformanceTier | null {
  const [tier, setTier] = useState<PerformanceTier | null>(null)

  useEffect(() => {
    let cancelled = false
    const measure = () => {
      if (!cancelled) setTier(detectTier())
    }

    const idle = (
      window as Window & { requestIdleCallback?: (cb: () => void) => number }
    ).requestIdleCallback

    if (idle) {
      const id = idle(measure)
      return () => {
        cancelled = true
        ;(window as Window & { cancelIdleCallback?: (id: number) => void })
          .cancelIdleCallback?.(id)
      }
    }

    const timeout = window.setTimeout(measure, 90)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [])

  return tier
}
