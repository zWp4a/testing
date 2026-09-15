import * as THREE from 'three'

export type CreamVariant = 'stream' | 'drop' | 'pool'

export interface CreamUniforms {
  uTime: THREE.IUniform<number>
  /** Desplazamiento del cursor suavizado: inclina y arrastra la crema. */
  uSway: THREE.IUniform<THREE.Vector2>
  /** Desfase por instancia para que dos gotas nunca se muevan igual. */
  uFlow: THREE.IUniform<number>
  /** Estiramiento vertical de una gota en caída (conserva volumen). */
  uStretch: THREE.IUniform<number>
  /** Hasta 3 impactos activos: (tiempo del impacto, intensidad). */
  uImpacts: THREE.IUniform<THREE.Vector2[]>
  uRadius: THREE.IUniform<number>
  uMound: THREE.IUniform<number>
  /** 0..1 — escala el detalle de alta frecuencia según la gama del equipo. */
  uDetail: THREE.IUniform<number>
  uSSSColor: THREE.IUniform<THREE.Color>
  uSSSStrength: THREE.IUniform<number>
}

/**
 * `creamShape` deforma la posición en espacio de objeto. Cada variante describe
 * un comportamiento viscoso distinto; la normal se recalcula por diferencias
 * finitas para que la iluminación siga los bultos y las ondas.
 */
const SHAPES: Record<CreamVariant, string> = {
  // Chorro: cilindro de altura 1 con el borde superior en y = 0.
  stream: /* glsl */ `
    vec3 creamShape(vec3 p) {
      float t = clamp(-p.y, 0.0, 1.0);          // 0 = labio del pote, 1 = superficie del charco

      float r = 1.0;
      r *= mix(1.0, 0.58, smoothstep(0.0, 0.62, t));                  // estrangulamiento por estirado
      r += 0.30 * smoothstep(0.12, 0.0, t);                           // acumulación densa en el labio
      r += 0.20 * sin(t * 8.5 - uTime * 1.15 + uFlow)                 // pulsos que viajan hacia abajo
             * smoothstep(0.06, 0.42, t) * (1.0 - 0.35 * t);
      r += 0.06 * uDetail * sin(t * 19.0 - uTime * 1.9 + 2.1);        // grano fino de superficie
      r += 0.45 * smoothstep(0.88, 1.0, t);                           // ensanche al fundirse con el charco
      r *= 1.0 + 0.08 * sin(uTime * 0.65);                            // caudal respirando

      // El arrastre lateral crece con la profundidad: la parte baja va con retraso.
      vec2 lag = uSway * (0.12 + 1.15 * t * t);
      lag += vec2(sin(uTime * 0.52 - t * 2.4), cos(uTime * 0.41 - t * 2.0)) * 0.05 * t;

      p.xz *= r;
      p.x += lag.x;
      p.z += lag.y;
      return p;
    }
  `,

  // Gota: esfera unitaria con squash/stretch de volumen constante.
  drop: /* glsl */ `
    vec3 creamShape(vec3 p) {
      float s = max(uStretch, 0.05);
      p.y *= s;
      p.xz *= inversesqrt(s);

      float wobble = sin(p.y * 4.0 + uTime * 2.3 + uFlow) * 0.05
                   + sin(p.x * 5.0 - uTime * 1.7 + uFlow) * 0.035;
      p *= 1.0 + wobble * uDetail;

      p.x += uSway.x * 0.35;
      p.z += uSway.y * 0.35;
      return p;
    }
  `,

  // Charco: disco en el plano XY, desplazado en +Z (que tras rotarlo es la altura).
  pool: /* glsl */ `
    vec3 creamShape(vec3 p) {
      float d = length(p.xy);
      float dome = 1.0 - smoothstep(0.0, uRadius, d);

      float h = uMound * pow(dome, 1.5);                              // montículo espeso

      for (int i = 0; i < 3; i++) {
        float age = uTime - uImpacts[i].x;
        float alive = step(0.0, age);
        float a = max(age, 0.0);                                      // evita exp() desbordado
        float amp = uImpacts[i].y * exp(-a * 1.55) * alive;
        h += amp * sin(d * 7.5 - a * 4.2) * exp(-d * 1.25);           // onda lenta y muy amortiguada
      }

      h += 0.018 * uDetail * sin(d * 4.5 - uTime * 0.85) * dome;      // deriva viscosa continua
      h += dot(p.xy, uSway) * 0.12 * dome;                            // inclinación con el cursor

      p.z += h;
      return p;
    }
  `,
}

const VERTEX_COMMON = /* glsl */ `
  uniform float uTime;
  uniform vec2  uSway;
  uniform float uFlow;
  uniform float uStretch;
  uniform vec2  uImpacts[3];
  uniform float uRadius;
  uniform float uMound;
  uniform float uDetail;
`

const FRAGMENT_COMMON = /* glsl */ `
  uniform vec3  uSSSColor;
  uniform float uSSSStrength;
`

export interface CreamMaterial {
  material: THREE.MeshPhysicalMaterial
  uniforms: CreamUniforms
}

export interface CreamMaterialOptions {
  variant: CreamVariant
  detail?: number
  color?: THREE.ColorRepresentation
}

/**
 * Crema opaca: `MeshPhysicalMaterial` real (recibe el entorno y las luces del
 * estudio) más un término de subsurface aproximado. Deliberadamente sin
 * `transmission`, que obligaría a un pase de render extra por frame.
 */
export function createCreamMaterial({
  variant,
  detail = 1,
  color = '#FBF6EF',
}: CreamMaterialOptions): CreamMaterial {
  const uniforms: CreamUniforms = {
    uTime: { value: 0 },
    uSway: { value: new THREE.Vector2() },
    uFlow: { value: Math.random() * Math.PI * 2 },
    uStretch: { value: 1 },
    uImpacts: {
      value: [new THREE.Vector2(-1e3, 0), new THREE.Vector2(-1e3, 0), new THREE.Vector2(-1e3, 0)],
    },
    uRadius: { value: 1 },
    uMound: { value: 0.12 },
    uDetail: { value: detail },
    uSSSColor: { value: new THREE.Color('#F0D2B4') },
    uSSSStrength: { value: 0.34 },
  }

  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: 0.24,
    metalness: 0,
    clearcoat: 0.55,
    clearcoatRoughness: 0.38,
    sheen: 0.7,
    sheenRoughness: 0.85,
    sheenColor: new THREE.Color('#FFE6D2'),
    envMapIntensity: 1.15,
  })

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_COMMON}\n${SHAPES[variant]}`)
      // Las normales se calculan antes que la posición, así que deformamos aquí
      // y guardamos el resultado para reutilizarlo en <begin_vertex>.
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `
        #include <beginnormal_vertex>

        vec3 creamBase = creamShape(position);

        {
          vec3 n = normalize(objectNormal);
          vec3 helper = mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), step(0.9, abs(n.y)));
          vec3 t1 = normalize(cross(n, helper));
          vec3 t2 = normalize(cross(n, t1));

          const float eps = 0.045;
          vec3 pa = creamShape(position + t1 * eps);
          vec3 pb = creamShape(position + t2 * eps);
          vec3 rebuilt = normalize(cross(pa - creamBase, pb - creamBase));

          objectNormal = dot(rebuilt, n) < 0.0 ? -rebuilt : rebuilt;
        }
        `,
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  transformed = creamBase;',
      )

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_COMMON}`)
      // Subsurface aproximado: luz envolvente + borde translúcido, añadido
      // sobre el resultado PBR ya calculado.
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        #include <opaque_fragment>

        {
          vec3 lightDir = normalize(vec3(0.35, 0.85, 0.55));
          float wrap = clamp(dot(normal, lightDir) * 0.5 + 0.5, 0.0, 1.0);
          float fresnel = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.0);
          gl_FragColor.rgb += uSSSColor * uSSSStrength * (pow(wrap, 1.6) * 0.6 + fresnel * 0.35);
        }
        `,
      )
  }

  // Sin esto, three reutilizaría el mismo programa para las tres variantes.
  material.customProgramCacheKey = () => `cream-${variant}`

  return { material, uniforms }
}
