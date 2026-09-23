import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { handleLookup } from './lib/server/productLookup.ts'

function lookupApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'lookup-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url ?? ''
        if (!rawUrl.startsWith('/api/lookup')) {
          next()
          return
        }

        void (async () => {
          const url = new URL(rawUrl, 'http://localhost')
          const barcode = url.searchParams.get('barcode') ?? ''
          const result = await handleLookup(barcode, env)
          res.statusCode = result.status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result.body))
        })().catch(() => {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Lookup proxy failed.' }))
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), basicSsl(), lookupApiPlugin(env)],
    server: {
      host: true,
    },
  }
})
