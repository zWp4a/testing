import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { usePerformanceTier } from '../../hooks/usePerformanceTier'
import { usePointerTarget } from '../../hooks/usePointerTarget'
import { useScrollProgress } from '../../hooks/useScrollProgress'
import { HeroCopy } from './HeroCopy'
import { HeroPoster } from './HeroPoster'

// three.js sólo se descarga si el dispositivo lo va a aprovechar.
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

    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      rootMargin: '200px',
    })
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
      {/* Fondo para el póster; con la escena 3D activa lo pinta el propio shader. */}
      <div className="hero-backdrop absolute inset-0 -z-10" aria-hidden="true" />

      <div className="absolute inset-0 z-0">
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

      {/*
        El póster va por encima del canvas y se funde al salir: así se cubre la
        compilación del shader, que es el primer frame más caro de todos.
      */}
      <AnimatePresence>
        {!sceneReady && (
          <motion.div
            key="poster"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="absolute inset-0 z-10"
          >
            <HeroPoster />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-30 mx-auto flex min-h-[100svh] w-full max-w-7xl items-center px-6 sm:px-10 lg:px-16">
        <HeroCopy />
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8, duration: 1 }}
        className="absolute bottom-8 left-1/2 z-30 -translate-x-1/2 text-[0.6rem] uppercase tracking-[0.3em] text-smoke"
      >
        Desliza
      </motion.div>
    </section>
  )
}
