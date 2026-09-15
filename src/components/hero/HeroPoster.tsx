/**
 * Degradación elegante: la misma escultura de crema resuelta con SVG.
 * Sin WebGL, sin three.js, sin bucle de render. Se usa en gama baja, con
 * `prefers-reduced-motion` y mientras el raymarcher se descarga y compila.
 */
export function HeroPoster() {
  return (
    <svg
      viewBox="0 0 900 900"
      className="h-full w-full"
      role="img"
      aria-label="Escultura de crema corporal densa suspendida en el aire"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id="cream-body" cx="0.38" cy="0.3" r="0.85">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="42%" stopColor="#FAF3E9" />
          <stop offset="78%" stopColor="#EEDFCC" />
          <stop offset="100%" stopColor="#DAC4A9" />
        </radialGradient>
        <linearGradient id="cream-strand" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#FFFDF9" />
          <stop offset="55%" stopColor="#F5EADB" />
          <stop offset="100%" stopColor="#E2CDB4" />
        </linearGradient>
        <radialGradient id="poster-bg" cx="0.62" cy="0.45" r="0.75">
          <stop offset="0%" stopColor="#FBF6EF" />
          <stop offset="100%" stopColor="#E8DCCC" />
        </radialGradient>
        <filter id="cream-soft" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id="cream-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="26" />
        </filter>
      </defs>

      <rect width="900" height="900" fill="url(#poster-bg)" />
      <ellipse cx="560" cy="420" rx="250" ry="250" fill="#FFF8EE" opacity="0.55" filter="url(#cream-glow)" />

      {/* Arco que barre la composición */}
      <path
        d="M366 214c46 34 78 78 96 130 20 58 12 118-14 172-24 50-30 96-14 140"
        fill="none"
        stroke="url(#cream-strand)"
        strokeWidth="46"
        strokeLinecap="round"
        opacity="0.96"
      />

      {/* Masa central */}
      <ellipse cx="556" cy="404" rx="152" ry="126" fill="url(#cream-body)" />
      <ellipse cx="470" cy="352" rx="72" ry="66" fill="url(#cream-body)" />
      <ellipse cx="640" cy="378" rx="64" ry="58" fill="url(#cream-body)" />
      <ellipse cx="536" cy="316" rx="56" ry="50" fill="url(#cream-body)" />

      {/* Hilo que desciende y se estrangula */}
      <path
        d="M572 512c10 44 16 84 12 124-3 30-14 52-16 82"
        fill="none"
        stroke="url(#cream-strand)"
        strokeWidth="34"
        strokeLinecap="round"
      />
      <ellipse cx="566" cy="742" rx="34" ry="38" fill="url(#cream-body)" />

      {/* Gotas sueltas, escasas */}
      <circle cx="700" cy="556" r="15" fill="url(#cream-body)" />
      <circle cx="426" cy="536" r="10" fill="url(#cream-body)" />
      <circle cx="648" cy="252" r="8" fill="url(#cream-body)" />

      {/* Reflejos de softbox */}
      <ellipse cx="500" cy="342" rx="62" ry="34" fill="#FFFFFF" opacity="0.55" filter="url(#cream-soft)" />
      <ellipse cx="612" cy="452" rx="30" ry="18" fill="#FFFFFF" opacity="0.35" filter="url(#cream-soft)" />
    </svg>
  )
}
