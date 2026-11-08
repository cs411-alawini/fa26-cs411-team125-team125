import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, /api calls are proxied to the Flask backend (port 5000).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:5000' } },
})
