import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// `npm run dev` serves /api/ai from api/ai.js, like Vercel does when deployed.
const aiApi = (env) => ({
  name: 'ai-api',
  configureServer(server) {
    for (const [key, value] of Object.entries(env)) process.env[key] ??= value // .env.local, real env wins
    server.middlewares.use('/api/ai', async (req, res) => {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      try { req.body = JSON.parse(Buffer.concat(chunks).toString() || 'null') } catch { req.body = null }
      const { default: handler } = await server.ssrLoadModule('/api/ai.js')
      await handler(req, res)
    })
  },
})

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), aiApi(loadEnv(mode, process.cwd(), ''))],
  // exercises.csv lives one level up, outside the app root
  server: { fs: { allow: ['..'] } },
}))
