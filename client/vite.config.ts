import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In local dev, proxy /api/* to the Express server so relative URLs work.
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
})
