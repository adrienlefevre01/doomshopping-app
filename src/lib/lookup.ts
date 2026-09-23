import type { LookupResult } from '../types'

export async function lookupProduct(query: string): Promise<LookupResult> {
  const normalized = query.trim()
  const base = import.meta.env.VITE_LOOKUP_API_URL?.replace(/\/$/, '') ?? ''
  const isBarcode = /^\d{8,14}$/.test(normalized)
  const param = isBarcode ? 'barcode' : 'q'
  const response = await fetch(
    `${base}/api/lookup?${param}=${encodeURIComponent(normalized)}`,
  )
  const payload = (await response.json().catch(() => null)) as
    | LookupResult
    | { error?: string }
    | null

  if (!response.ok) {
    const message =
      payload && 'error' in payload && payload.error
        ? payload.error
        : 'Could not find retailer links for this search.'
    throw new Error(message)
  }

  return payload as LookupResult
}
