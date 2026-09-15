/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        porcelain: '#F7F2EC',
        shell: '#EFE6DB',
        sand: '#E0D2C2',
        clay: '#B9A283',
        ink: '#1C1815',
        smoke: '#6B625A',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        luxe: '0.32em',
      },
    },
  },
  plugins: [],
}
