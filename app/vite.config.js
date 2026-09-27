import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // exercises.csv lives one level up, outside the app root
  server: { fs: { allow: ['..'] } },
})
