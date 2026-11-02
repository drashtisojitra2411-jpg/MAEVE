import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// MAEVE's API (server/src/index.js). Override with MAEVE_API_URL when the
// backend runs elsewhere; `npm run dev` starts both on this same origin.
const apiTarget = process.env.MAEVE_API_URL || 'http://localhost:8787'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': apiTarget,
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router-dom/')
          ) {
            return 'vendor-react'
          }
          if (id.includes('node_modules/framer-motion/')) {
            return 'vendor-motion'
          }
          if (id.includes('node_modules/lucide-react/')) {
            return 'vendor-icons'
          }
        },
      },
    },
  },
})
