# Aurélia — hero 3D de crema corporal

Hero a pantalla completa con un pote de crema en 3D a la derecha, texto de marketing
a la izquierda y una simulación visual de crema espesa cayendo desde el labio del
envase hasta acumularse en un charco.

## Puesta en marcha

```bash
npm install
npm run dev
```

## Estructura

```
src/
  components/hero/
    HeroSection.tsx          Composición del hero, degradación y carga diferida
    HeroCopy.tsx             Texto de marketing (Framer Motion)
    HeroPoster.tsx           Fallback SVG sin WebGL
    HeroStage.tsx            <Canvas> — único módulo que importa three.js
    scene/
      Scene.tsx              Cámara, scroll, cursor y presupuesto por gama
      CreamJar.tsx           Pote (LatheGeometry) + crema interior
      CreamFlow.tsx          Chorro continuo + gotas desprendidas
      CreamPool.tsx          Charco con montículo y ondas por impacto
      Studio.tsx             Iluminación de estudio y envMap horneado
      materials/creamMaterial.ts   Shader de viscosidad + subsurface
  hooks/                     Gama del dispositivo, cursor y progreso de scroll
  lib/math.ts                Utilidades de interpolación
```

## Cómo se consigue que parezca crema y no agua

- **Deformación en el vértice, no partículas.** El chorro es un cilindro de altura
  unitaria; el shader le aplica estrangulamiento por estirado, pulsos que viajan
  hacia abajo, ensanche al fundirse con el charco y un arrastre lateral que crece
  con la profundidad, de modo que la parte baja siempre va con retraso.
- **Normales recalculadas.** Cada vértice evalúa la deformación en tres puntos y
  reconstruye su normal por diferencias finitas: la luz sigue los bultos en lugar
  de deslizarse sobre una superficie que se mueve.
- **PBR real más subsurface aproximado.** `MeshPhysicalMaterial` con `sheen` y
  `clearcoat` recibe el entorno del estudio; encima se suma un término de luz
  envolvente y borde translúcido. Se evita `transmission` a propósito: obligaría a
  un pase de render extra por frame.
- **Inercia en el seguimiento.** El cursor se amortigua con un lambda bajo, así que
  la crema responde tarde y pesada. Las ondas del charco son lentas y muy
  amortiguadas, nunca rizos de agua.

## Rendimiento

- `three.js` vive en un chunk aparte y se carga en diferido: en gama baja nunca se
  descarga.
- `usePerformanceTier` mide núcleos, memoria, tipo de puntero, rasterizado por
  software y `prefers-reduced-motion`, y elige entre tres caminos: escena completa,
  escena reducida (menos segmentos, menos gotas, sin sombras de contacto, envMap de
  128px) o el póster SVG estático.
- El canvas se desmonta al salir de pantalla y detiene el bucle con la pestaña en
  segundo plano. `PerformanceMonitor` baja el DPR antes que la calidad visual.
- El cursor y el scroll se escriben en refs, no en estado: el hero no provoca
  renders de React mientras se anima.
- El fondo, la viñeta y la profundidad de campo son CSS. No hay post-procesado.
