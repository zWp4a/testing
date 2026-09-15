/**
 * Degradación elegante: misma composición (pote a la derecha, crema cayendo)
 * resuelta con SVG y degradados. Sin WebGL, sin three.js, sin bucle de render.
 * Se usa en gama baja, con `prefers-reduced-motion` y como fondo mientras el
 * canvas 3D se descarga.
 */
export function HeroPoster({ animated = true }: { animated?: boolean }) {
  return (
    <svg
      viewBox="0 0 600 700"
      className="h-full w-full"
      role="img"
      aria-label="Pote de crema corporal con crema espesa cayendo"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="poster-jar" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFDFA" />
          <stop offset="45%" stopColor="#F1E7DA" />
          <stop offset="100%" stopColor="#D9C7B3" />
        </linearGradient>
        <linearGradient id="poster-cream" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFBF5" />
          <stop offset="60%" stopColor="#F7EDE0" />
          <stop offset="100%" stopColor="#E7D6C2" />
        </linearGradient>
        <radialGradient id="poster-glow" cx="0.5" cy="0.4" r="0.6">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <filter id="poster-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      <ellipse cx="330" cy="290" rx="230" ry="230" fill="url(#poster-glow)" />

      {/* Sombra de contacto */}
      <ellipse cx="300" cy="596" rx="168" ry="26" fill="#6B5844" opacity="0.16" filter="url(#poster-soft)" />

      {/* Charco acumulado */}
      <path
        d="M136 578c0-30 74-52 164-52s164 22 164 52-74 50-164 50-164-20-164-50z"
        fill="url(#poster-cream)"
      />
      <path d="M180 566c34-16 88-24 120-24s86 8 120 24" fill="none" stroke="#FFFFFF" strokeOpacity="0.6" strokeWidth="3" />

      {/* Chorro cayendo */}
      <path
        d="M286 258c-10 40-24 66-22 106 2 40 16 78 12 118 -3 32 -10 48 -22 62 22 6 62 6 84 0 -14-16-22-34-24-64-3-42 10-80 10-120 0-40-12-66-20-102z"
        fill="url(#poster-cream)"
      >
        {animated && (
          <animate
            attributeName="opacity"
            values="1;0.94;1"
            dur="6s"
            repeatCount="indefinite"
          />
        )}
      </path>

      {/* Pote inclinado */}
      <g transform="rotate(19 386 250)">
        <path
          d="M280 176h212a18 18 0 0 1 18 18v112a44 44 0 0 1-44 44H306a44 44 0 0 1-44-44V194a18 18 0 0 1 18-18z"
          fill="url(#poster-jar)"
        />
        <ellipse cx="386" cy="178" rx="106" ry="22" fill="#EFE3D4" />
        <ellipse cx="386" cy="182" rx="88" ry="16" fill="#FBF5EC" />
        <path d="M300 200v104" stroke="#FFFFFF" strokeOpacity="0.75" strokeWidth="10" strokeLinecap="round" />
      </g>
    </svg>
  )
}
