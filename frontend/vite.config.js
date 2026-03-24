import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        // Disable response buffering so SSE events stream token-by-token
        // instead of arriving in large chunks.
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['x-accel-buffering'] = 'no'
            proxyRes.headers['cache-control'] = 'no-cache'
          })
        },
      },
    },
  },
})
