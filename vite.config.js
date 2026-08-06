import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 6009,
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://127.0.0.1:6010',
      '/v1': 'http://127.0.0.1:6010',
    },
  },
})
