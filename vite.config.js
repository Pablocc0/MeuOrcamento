import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createApi } from './server/api.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiPlugin = {
    name: 'meuorcamento-api',
    configureServer(server) {
      server.middlewares.use(createApi({ authUrl: env.VITE_NEON_AUTH_URL, databaseUrl: env.DATABASE_URL }))
    }
  }
  return { plugins: [react(), apiPlugin], server: { port: 5174, strictPort: true, host: '127.0.0.1' } }
})
