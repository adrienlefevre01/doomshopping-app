import type { IncomingMessage } from 'node:http'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { handleLookup } from './lib/server/productLookup.ts'
import { handleResearch, type ResearchRequest } from './lib/server/productReviews.ts'

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => {
      chunks.push(Buffer.from(chunk))
    })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('invalid json'))
      }
    })
    req.on('error', reject)
  })
}

function lookupApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'lookup-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url ?? ''
        if (rawUrl.startsWith('/api/lookup')) {
          void (async () => {
            const url = new URL(rawUrl, 'http://localhost')
            const query =
              url.searchParams.get('q') ?? url.searchParams.get('barcode') ?? ''
            const result = await handleLookup(query, env)
            res.statusCode = result.status
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result.body))
          })().catch(() => {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Lookup proxy failed.' }))
          })
          return
        }

        if (rawUrl.startsWith('/api/research')) {
          void (async () => {
            if (req.method === 'OPTIONS') {
              res.statusCode = 204
              res.end()
              return
            }
            const body = (await readJsonBody(req)) as ResearchRequest
            const result = await handleResearch(body, env)
            res.statusCode = result.status
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result.body))
          })().catch(() => {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Research proxy failed.' }))
          })
          return
        }

        next()
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
