/**
 * Escultura de crema por raymarching de un campo de distancia.
 *
 * El esqueleto (puntos y radios) llega ya animado desde la CPU en `creamRig.ts`,
 * de modo que este shader no ejecuta ni una función trigonométrica dentro del
 * bucle de marcha, que es donde cada operación se paga decenas de veces por píxel.
 */
import {
  ARC_POINTS,
  ARC_SEGMENTS,
  BLOB_COUNT,
  DROP_COUNT,
  TENDRIL_POINTS,
  TENDRIL_SEGMENTS,
} from '../creamRig'

export const creamFragment = /* glsl */ `
  #define ARC_POINTS ${ARC_POINTS}
  #define ARC_SEGMENTS ${ARC_SEGMENTS}
  #define TENDRIL_POINTS ${TENDRIL_POINTS}
  #define TENDRIL_SEGMENTS ${TENDRIL_SEGMENTS}
  #define BLOB_COUNT ${BLOB_COUNT}
  #define DROP_COUNT ${DROP_COUNT}

varying vec2 vUv;

uniform float uAspect;
uniform float uTime;

uniform vec3  uCamPos;
uniform vec3  uCamTarget;
uniform float uFovScale;
uniform float uShift;

uniform float uMaxSteps;
uniform float uShadow;
uniform float uNoiseAmount;
uniform float uFocus;
uniform float uAperture;

uniform vec3  uBodyPos;
uniform vec3  uBodyRad;
uniform vec3  uArc[ARC_POINTS];
uniform float uArcRad[ARC_POINTS];
uniform vec3  uTendril[TENDRIL_POINTS];
uniform float uTendrilRad[TENDRIL_POINTS];
uniform vec4  uBlobs[BLOB_COUNT];
uniform vec4  uDrops[DROP_COUNT];
uniform vec4  uDropBound;
uniform vec4  uBound;

// Dirección de los softboxes. El key define el volumen; el fill abre las sombras.
const vec3 KEY_DIR  = vec3(-0.4816, 0.7444, 0.4629);
const vec3 FILL_DIR = vec3( 0.8628, 0.1522, 0.4820);
const vec3 RIM_DIR  = vec3( 0.2543, 0.3560, -0.8991);

// ---------------------------------------------------------------- ruido ----

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i + vec3(0.0, 0.0, 0.0)), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}

// ----------------------------------------------------------- primitivas ----

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / k1;
}

float sdCapsule(vec3 p, vec3 a, vec3 b, float ra, float rb) {
  vec3 pa = p - a;
  vec3 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}

// -------------------------------------------------------------- escena ----

/*
 * Toda la escultura es un único campo de distancia. La unión suave es lo que
 * permite que los hilos se fundan y se plieguen entre sí en vez de cruzarse
 * como tubos rígidos: es la diferencia entre crema y geometría.
 */
float map(vec3 p) {
  float d = sdEllipsoid(p - uBodyPos, uBodyRad);

  for (int i = 0; i < ARC_SEGMENTS; i++) {
    d = smin(d, sdCapsule(p, uArc[i], uArc[i + 1], uArcRad[i], uArcRad[i + 1]), 0.17);
  }

  for (int i = 0; i < TENDRIL_SEGMENTS; i++) {
    d = smin(d, sdCapsule(p, uTendril[i], uTendril[i + 1], uTendrilRad[i], uTendrilRad[i + 1]), 0.15);
  }

  for (int i = 0; i < BLOB_COUNT; i++) {
    d = smin(d, length(p - uBlobs[i].xyz) - uBlobs[i].w, 0.14);
  }

  // Las gotas sueltas se unen en duro: deben leerse como masas independientes.
  // La esfera del grupo permite descartarlas todas de una vez.
  float bound = length(p - uDropBound.xyz) - uDropBound.w;
  if (bound < 0.3) {
    for (int i = 0; i < DROP_COUNT; i++) {
      d = min(d, length(p - uDrops[i].xyz) - uDrops[i].w);
    }
  } else {
    d = min(d, bound);
  }

  // Micro-textura sólo cerca de la superficie: mate el plástico, no cuesta nada lejos.
  if (d < 0.22) {
    vec3 q = p + vec3(0.0, uTime * 0.02, 0.0);
    float n = vnoise(q * 5.4) * 0.62 + vnoise(q * 13.1) * 0.38;
    d += (n - 0.5) * uNoiseAmount;
  }

  return d;
}

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0032;
  return normalize(
    e.xyy * map(p + e.xyy) +
    e.yyx * map(p + e.yyx) +
    e.yxy * map(p + e.yxy) +
    e.xxx * map(p + e.xxx));
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 4; i++) {
    float h = 0.025 + 0.13 * float(i);
    occ += (h - map(p + n * h)) * sca;
    sca *= 0.72;
  }
  return clamp(1.0 - 1.7 * occ, 0.0, 1.0);
}

float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0;
  float t = 0.06;
  for (int i = 0; i < 14; i++) {
    float h = map(ro + rd * t);
    res = min(res, 9.0 * h / t);
    if (res < 0.03) break;
    t += clamp(h, 0.035, 0.3);
    if (t > 2.8) break;
  }
  return clamp(res, 0.0, 1.0);
}

// ------------------------------------------------------------ entorno ----

float softbox(vec3 dir, vec3 center, float size, float soft) {
  // Invertido a mano: smoothstep con edge0 > edge1 no está definido por la spec.
  return 1.0 - smoothstep(size - soft, size + soft, length(dir - center));
}

vec3 envColor(vec3 d) {
  vec3 base = mix(vec3(0.700, 0.640, 0.582), vec3(0.985, 0.960, 0.928), d.y * 0.5 + 0.5);
  base += vec3(1.00, 0.975, 0.940) * softbox(d, KEY_DIR, 0.62, 0.40) * 1.55;
  base += vec3(1.00, 0.930, 0.870) * softbox(d, FILL_DIR, 0.80, 0.55) * 0.50;
  return base;
}

vec3 background(vec2 uv) {
  vec3 top = vec3(0.976, 0.960, 0.940);
  vec3 bottom = vec3(0.888, 0.845, 0.800);
  vec3 c = mix(bottom, top, smoothstep(-0.1, 1.05, uv.y));

  // Halo cálido detrás del sujeto: profundidad atmosférica, sin objetos.
  vec2 q = (uv - vec2(0.5 + uShift * 0.42, 0.52)) * vec2(1.0, 1.15);
  c += vec3(0.055, 0.045, 0.036) * exp(-dot(q, q) * 2.6);
  return c;
}

// ------------------------------------------------------------- sombreado ----

vec3 shade(vec3 p, vec3 n, vec3 rd) {
  vec3 v = -rd;
  const vec3 albedo = vec3(0.958, 0.930, 0.892);

  float ao = calcAO(p, n);
  // Rama sobre uniform: coherente para todo el warp, y evita marchar la
  // sombra cuando la gama del equipo no la va a usar.
  float sh = 1.0;
  if (uShadow > 0.5) sh = softShadow(p + n * 0.025, KEY_DIR);

  // Difusa envolvente: una crema densa no tiene terminador duro.
  float wrapKey = pow(clamp(dot(n, KEY_DIR) * 0.5 + 0.5, 0.0, 1.0), 1.35);
  float wrapFill = clamp(dot(n, FILL_DIR) * 0.5 + 0.5, 0.0, 1.0);

  vec3 lit = vec3(0.0);
  lit += albedo * vec3(1.000, 0.968, 0.930) * wrapKey * 1.32 * mix(0.45, 1.0, sh);
  lit += albedo * vec3(1.000, 0.935, 0.878) * wrapFill * 0.40;
  lit += albedo * envColor(n) * 0.28 * ao;

  // Subsurface: los hilos finos y los bordes de las gotas se encienden por dentro.
  float depth = max(0.0, -map(p - KEY_DIR * 0.15)) + max(0.0, -map(p - KEY_DIR * 0.32)) * 0.5;
  float trans = exp(-depth * 7.5);
  lit += vec3(1.00, 0.60, 0.42) * trans * 0.52 * mix(0.5, 1.0, sh);

  // Especular: un brillo estrecho sobre un softbox ancho.
  vec3 h = normalize(KEY_DIR + v);
  float ndh = clamp(dot(n, h), 0.0, 1.0);
  lit += vec3(1.0, 0.985, 0.960) * (pow(ndh, 96.0) * 0.60 + pow(ndh, 13.0) * 0.085) * sh;

  vec3 h2 = normalize(FILL_DIR + v);
  lit += vec3(1.0, 0.95, 0.90) * pow(clamp(dot(n, h2), 0.0, 1.0), 30.0) * 0.14;

  // Reflejo del estudio, contenido: crema, no cerámica esmaltada.
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 4.0);
  lit += envColor(reflect(rd, n)) * (0.025 + 0.16 * fres) * ao;

  // Rim que despega la silueta del fondo.
  float rim = pow(clamp(1.0 - dot(n, v), 0.0, 1.0), 2.7) *
              clamp(dot(n, RIM_DIR) * 0.5 + 0.5, 0.0, 1.0);
  lit += vec3(1.00, 0.945, 0.890) * rim * 0.30;

  return lit * mix(0.70, 1.0, ao);
}

// ---------------------------------------------------------------- main ----

bool boundHit(vec3 ro, vec3 rd, out float tNear, out float tFar) {
  vec3 oc = ro - uBound.xyz;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - uBound.w * uBound.w;
  float disc = b * b - c;
  if (disc < 0.0) return false;
  float s = sqrt(disc);
  tNear = -b - s;
  tFar = -b + s;
  return tFar > 0.0;
}

void main() {
  vec2 screen = vUv * 2.0 - 1.0;
  screen.x *= uAspect;
  screen.x -= uShift;

  vec3 forward = normalize(uCamTarget - uCamPos);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, forward);
  vec3 rd = normalize(right * screen.x + up * screen.y + forward * uFovScale);

  vec3 color = background(vUv);
  // El fondo lleva un desenfoque base para que nunca compita con la crema.
  float coc = 0.42;

  float tNear, tFar;
  if (boundHit(uCamPos, rd, tNear, tFar)) {
    float t = max(tNear, 0.0);
    float hit = -1.0;

    for (int i = 0; i < 110; i++) {
      if (float(i) >= uMaxSteps || t > tFar) break;
      float d = map(uCamPos + rd * t);
      if (d < 0.0011 * t + 0.0006) {
        hit = t;
        break;
      }
      // Sub-relajación: el ruido de superficie rompe la cota de Lipschitz.
      t += d * 0.86;
    }

    if (hit > 0.0) {
      vec3 p = uCamPos + rd * hit;
      color = shade(p, calcNormal(p), rd);
      coc = clamp(abs(hit - uFocus) * uAperture, 0.0, 1.0);
    }
  }

  gl_FragColor = vec4(color, coc);
}
`
