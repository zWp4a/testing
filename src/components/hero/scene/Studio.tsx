import { Environment, Lightformer } from '@react-three/drei'

/**
 * Estudio de iluminación construido con lightformers y horneado a un envMap de
 * 256px en un único frame. Da reflejos de softbox creíbles sobre el envase sin
 * descargar ningún HDRI ni pagar un render de entorno por frame.
 */
export function Studio({ resolution = 256 }: { resolution?: number }) {
  return (
    <>
      <ambientLight intensity={0.28} color="#FFF6EC" />

      {/* Luz principal alta y lateral: define el volumen y el brillo del labio. */}
      <directionalLight position={[-2.6, 3.6, 2.8]} intensity={1.25} color="#FFF4E8" />
      {/* Contraluz cálido que separa el producto del fondo. */}
      <directionalLight position={[3.2, 1.2, -2.6]} intensity={0.55} color="#FFD9B8" />

      <Environment resolution={resolution} frames={1}>
        <Lightformer
          form="rect"
          intensity={2.6}
          color="#FFF7EE"
          position={[-3, 3, 2]}
          scale={[6, 6, 1]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="rect"
          intensity={1.15}
          color="#FFE9D6"
          position={[4, 1.4, 2.5]}
          scale={[3.5, 7, 1]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="circle"
          intensity={1.5}
          color="#FFFFFF"
          position={[0, 4.5, -3]}
          scale={5}
          target={[0, 0, 0]}
        />
        {/* Rebote inferior: evita que las sombras propias se cierren en negro. */}
        <Lightformer
          form="rect"
          intensity={0.5}
          color="#E9D9C7"
          position={[0, -3, 2]}
          scale={[8, 3, 1]}
          target={[0, 0, 0]}
        />
      </Environment>
    </>
  )
}
