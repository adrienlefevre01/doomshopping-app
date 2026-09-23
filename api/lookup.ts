import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleLookup } from '../lib/server/productLookup'

export const config = {
  maxDuration: 30,
}

function applyCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const barcode = String(req.query.barcode ?? '')
  const result = await handleLookup(barcode, process.env)
  res.status(result.status).json(result.body)
}
