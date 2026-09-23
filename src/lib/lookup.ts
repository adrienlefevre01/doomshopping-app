import type { LookupResult } from '../types'

export async function lookupProduct(barcode: string): Promise<LookupResult> {
  const normalized = barcode.trim()
  const base = import.meta.env.VITE_LOOKUP_API_URL?.replace(/\/$/, '') ?? ''
  const response = await fetch(
    `${base}/api/lookup?barcode=${encodeURIComponent(normalized)}`,
  )
  const payload = (await response.json().catch(() => null)) as
    | LookupResult
    | { error?: string }
    | null

  if (!response.ok) {
    const message =
      payload && 'error' in payload && payload.error
        ? payload.error
        : 'Could not find retailer links for this barcode.'
    throw new Error(message)
  }

  return payload as LookupResult
}
