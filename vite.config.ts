import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Mantiene three.js fuera del bundle inicial: el hero 3D se carga en diferido.
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber'],
        },
      },
    },
  },
})
