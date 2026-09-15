import { HeroSection } from './components/hero/HeroSection'

export default function App() {
  return (
    <main>
      <HeroSection />

      {/* Espacio para que el scroll del hero (acercamiento de cámara) tenga recorrido. */}
      <section id="producto" className="mx-auto max-w-3xl px-6 py-32 text-center">
        <p className="text-[0.68rem] uppercase tracking-luxe text-smoke">La fórmula</p>
        <p className="mt-8 font-display text-3xl font-light leading-snug text-ink sm:text-4xl">
          Manteca de karité, escualano vegetal y un complejo lipídico que
          reconstruye la barrera cutánea sin dejar residuo.
        </p>
      </section>
    </main>
  )
}
