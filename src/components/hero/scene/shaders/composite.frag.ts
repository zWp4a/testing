/**
 * Pase de composición: bokeh sutil según el círculo de confusión que el
 * raymarcher dejó en el canal alfa, tonemap filmico, viñeta y grano.
 */
export const compositeFragment = /* glsl */ `

varying vec2 vUv;

uniform sampler2D uScene;
uniform vec2  uTexel;
uniform float uMaxBlur;
uniform float uTime;
uniform float uTaps;

const float GOLDEN = 2.39996323;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/** Aproximación filmica ACES: mantiene los blancos de la crema sin quemarlos. */
vec3 tonemap(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec4 center = texture2D(uScene, vUv);
  float coc = center.a;

  vec3 sum = center.rgb;
  float weight = 1.0;

  // Anillo en ángulo áureo: bokeh suave con muy pocas muestras.
  float radius = coc * uMaxBlur;
  if (radius > 0.35) {
    float jitter = hash12(gl_FragCoord.xy) * GOLDEN;
    for (int i = 0; i < 14; i++) {
      if (float(i) >= uTaps) break;
      float f = (float(i) + 0.5) / uTaps;
      float a = float(i) * GOLDEN + jitter;
      vec2 offset = vec2(cos(a), sin(a)) * sqrt(f) * radius * uTexel;
      vec4 s = texture2D(uScene, vUv + offset);
      // Sin esto, el primer plano nítido sangraría sobre el fondo desenfocado.
      float w = s.a >= coc * 0.65 ? 1.0 : 0.3;
      sum += s.rgb * w;
      weight += w;
    }
  }

  vec3 color = tonemap(sum / weight);

  // Viñeta muy contenida: dirige la mirada sin oscurecer el fondo premium.
  vec2 q = (vUv - 0.5) * vec2(1.12, 1.0);
  color *= mix(0.88, 1.0, 1.0 - smoothstep(0.18, 0.86, length(q)));

  // Grano fino: rompe el banding del degradado y quita el aspecto de CGI barato.
  color += (hash12(gl_FragCoord.xy + fract(uTime) * 137.0) - 0.5) * 0.011;

  gl_FragColor = vec4(pow(max(color, 0.0), vec3(1.0 / 2.2)), 1.0);
}
`
