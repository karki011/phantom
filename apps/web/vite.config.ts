import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3850,
    proxy: {
      '/api': 'http://localhost:3849',
      '/events': 'http://localhost:3849',
      '/ws': {
        target: 'ws://localhost:3849',
        ws: true,
      },
    },
  },
})
