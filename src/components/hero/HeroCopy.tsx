import { motion } from 'framer-motion'
import type { Variants } from 'framer-motion'

const container: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12, delayChildren: 0.15 },
  },
}

const rise: Variants = {
  hidden: { opacity: 0, y: 18, filter: 'blur(6px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
  },
}

export function HeroCopy() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="visible"
      className="max-w-xl"
    >
      <motion.p
        variants={rise}
        className="text-[0.68rem] uppercase tracking-luxe text-smoke"
      >
        Aurélia · Body Ritual
      </motion.p>

      <motion.h1
        id="hero-title"
        variants={rise}
        className="mt-7 font-display text-5xl font-light leading-[1.05] text-ink sm:text-6xl lg:text-7xl"
      >
        La densidad
        <br />
        se vuelve
        <em className="italic"> caricia</em>
      </motion.h1>

      <motion.p
        variants={rise}
        className="mt-7 max-w-md text-base font-light leading-relaxed text-smoke"
      >
        Una crema corporal de textura envolvente que se funde sobre la piel y la
        deja firme, luminosa y profundamente nutrida durante 48 horas.
      </motion.p>

      <motion.div variants={rise} className="mt-11 flex flex-wrap items-center gap-4">
        <a
          href="#producto"
          className="rounded-full bg-ink px-9 py-4 text-[0.7rem] uppercase tracking-[0.22em] text-porcelain transition-colors duration-500 hover:bg-smoke focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
        >
          Descubrir el ritual
        </a>
        <a
          href="#formula"
          className="text-[0.7rem] uppercase tracking-[0.22em] text-ink underline-offset-8 transition-colors duration-500 hover:text-smoke hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
        >
          Ver la fórmula
        </a>
      </motion.div>

      <motion.dl
        variants={rise}
        className="mt-16 flex gap-12 border-t border-sand/70 pt-7 text-[0.68rem] uppercase tracking-[0.18em] text-smoke"
      >
        <div>
          <dt className="sr-only">Formato</dt>
          <dd>200 ml</dd>
        </div>
        <div>
          <dt className="sr-only">Textura</dt>
          <dd>Textura densa</dd>
        </div>
        <div>
          <dt className="sr-only">Origen</dt>
          <dd>Grasse, Francia</dd>
        </div>
      </motion.dl>
    </motion.div>
  )
}
