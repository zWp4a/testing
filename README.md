# Aurélia — hero 3D de crema corporal

Hero a pantalla completa cuyo único sujeto es una escultura de crema suspendida
en el aire: una masa central densa, un arco que barre la composición, un hilo
que desciende estirándose hasta desprender una gota, y unas pocas gotas sueltas
alrededor. Sin envase, sin objetos, sin nada más.

## Puesta en marcha

```bash
npm install
npm run typecheck
npm run dev
```

## Estructura

```
src/
  components/hero/
    HeroSection.tsx        Composición, degradación y carga diferida
    HeroCopy.tsx           Texto de marketing (Framer Motion)
    HeroPoster.tsx         Escultura equivalente en SVG, sin WebGL
    HeroStage.tsx          <Canvas> — único módulo que importa three.js
    scene/
      CreamSculpture.tsx   Render en dos pases, cámara, cursor y scroll
      creamRig.ts          Esqueleto animado en CPU
      shaders/
        cream.frag.ts      Raymarcher del campo de distancia
        composite.frag.ts  Bokeh, tonemap, viñeta y grano
        fullscreen.ts      Vertex compartido
  hooks/                   Gama del dispositivo, cursor y progreso de scroll
```

## Por qué un campo de distancia y no una malla

Una malla deformada no puede cambiar de topología: no hay forma de que un hilo
se estreche hasta romperse, ni de que dos hilos que se cruzan se fundan en un
pliegue. Con metaballs unidas por `smin` (unión suave) eso sale gratis, y es
exactamente el vocabulario que pedía el encargo: hilos elásticos que se estiran
antes de romper, gotas redondas y pesadas, pliegues donde las masas colisionan.

**La CPU anima, la GPU sólo mide distancias.** El esqueleto —una veintena de
puntos con sus radios— se mueve en `creamRig.ts` y llega al shader como
uniforms. Dentro del bucle de marcha no se ejecuta ni una función
trigonométrica, que es donde cada operación se paga decenas de veces por píxel.

## Que parezca crema y no slime

Casi todo se juega en el sombreado:

- **Difusa envolvente** en lugar de Lambert: una crema densa no tiene terminador
  duro.
- **Subsurface** por profundidad bajo la superficie: los hilos finos y los
  bordes de las gotas se encienden por dentro, en tono cálido.
- **Dos especulares** superpuestos: un brillo estrecho sobre un softbox ancho,
  que es como se comporta una superficie ligeramente rugosa bajo iluminación de
  estudio.
- **Reflejo del entorno contenido** (Fresnel bajo): crema, no cerámica
  esmaltada. Subirlo es el error más rápido para que parezca plástico.
- **Micro-textura** de ruido en el propio campo de distancia, no en un mapa de
  normales, de modo que altera la silueta y no sólo la iluminación.
- **Oclusión ambiental** marcada: sin ella los pliegues no se leen.

## Rendimiento

El raymarching cuesta **por píxel**, así que la palanca principal es
`renderScale` en `CreamSculpture.tsx`: el pase pesado se renderiza a un 62% de
la resolución (44% en gama media) sobre un render target en punto flotante, y el
segundo pase lo reescala añadiendo el bokeh. La suavidad del reescalado juega a
favor de la profundidad de campo.

Otras decisiones que importan:

- Esfera contenedora: los rayos que no la tocan no entran al bucle.
- Las gotas sueltas tienen su propia esfera de grupo, para descartarlas todas de
  una vez en vez de una por una.
- La micro-textura sólo se evalúa a menos de 0.22 de la superficie.
- La sombra suave está tras una rama sobre uniform (coherente para todo el
  warp) y se apaga entera en gama media: son 14 evaluaciones del campo por
  píxel.
- `three.js` vive en un chunk diferido; en gama baja nunca se descarga.
- El canvas se desmonta fuera de pantalla y para con la pestaña oculta.
- El póster SVG cubre el primer frame, que es el más caro: la compilación del
  shader.

### Si va justo de fps

Por orden de impacto: baja `renderScale`, luego `maxSteps`, luego apaga
`shadow`. Los tres están juntos en la constante `QUALITY`.
