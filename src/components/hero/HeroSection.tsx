import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { usePerformanceTier } from '../../hooks/usePerformanceTier'
import { usePointerTarget } from '../../hooks/usePointerTarget'
import { useScrollProgress } from '../../hooks/useScrollProgress'
import { HeroCopy } from './HeroCopy'
import { HeroPoster } from './HeroPoster'

// Carga diferida: three.js sólo se descarga si el dispositivo lo va a aprovechar.
const HeroStage = lazy(() => import('./HeroStage'))

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const tier = usePerformanceTier()
  const pointer = usePointerTarget()
  const scroll = useScrollProgress(sectionRef)

  const [sceneReady, setSceneReady] = useState(false)
  const [inView, setInView] = useState(true)

  // Con el hero fuera de pantalla se desmonta el canvas y se libera la GPU.
  useEffect(() => {
    const element = sectionRef.current
    if (!element || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: '200px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const use3D = (tier === 'high' || tier === 'medium') && inView

  return (
    <section
      ref={sectionRef}
      className="relative isolate min-h-[100svh] w-full overflow-hidden"
      aria-labelledby="hero-title"
    >
      {/* Fondo y profundidad: puro CSS, fuera del presupuesto de la escena 3D. */}
      <div className="hero-backdrop absolute inset-0 -z-20" aria-hidden="true" />
      <div
        className="hero-defocus absolute inset-0 -z-10 opacity-70"
        aria-hidden="true"
      >
        <div className="absolute left-[58%] top-[18%] h-[46vh] w-[46vh] rounded-full bg-white/70" />
        <div className="absolute left-[14%] top-[58%] h-[38vh] w-[38vh] rounded-full bg-sand/60" />
      </div>

      <div className="pointer-events-none absolute inset-0 z-20 hero-vignette" aria-hidden="true" />

      {/* Escenario del producto: mitad derecha en escritorio, fondo en móvil. */}
      <div className="absolute inset-0 z-0">
        <AnimatePresence>
          {!sceneReady && (
            <motion.div
              key="poster"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
              className="absolute inset-0"
            >
              <HeroPoster animated={!use3D} />
            </motion.div>
          )}
        </AnimatePresence>

        {use3D && (
          <Suspense fallback={null}>
            <HeroStage
              tier={tier === 'high' ? 'high' : 'medium'}
              pointer={pointer}
              scroll={scroll}
              onReady={() => setSceneReady(true)}
            />
          </Suspense>
        )}
      </div>

      <div className="relative z-30 mx-auto flex min-h-[100svh] w-full max-w-7xl items-center px-6 sm:px-10 lg:px-16">
        <HeroCopy />
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6, duration: 1 }}
        className="absolute bottom-8 left-1/2 z-30 -translate-x-1/2 text-[0.6rem] uppercase tracking-[0.3em] text-smoke"
      >
        Desliza
      </motion.div>
    </section>
  )
}
