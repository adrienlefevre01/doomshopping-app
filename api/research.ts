import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleResearch, type ResearchRequest } from '../lib/server/productReviews'

export const config = {
  maxDuration: 30,
}

function applyCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const body = (req.body ?? {}) as ResearchRequest
  const result = await handleResearch(body, process.env)
  res.status(result.status).json(result.body)
}
