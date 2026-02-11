import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          // Rewrite Origin so strict CORS checks on the backend accept the request
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('origin', 'http://localhost:5000');
          });
          proxy.on('proxyReqWs', (proxyReq) => {
            try { proxyReq.setHeader('origin', 'http://localhost:5000'); } catch {}
          });
        },
      },
    },
  },
})
