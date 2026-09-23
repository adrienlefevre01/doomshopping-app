import type { LookupResult, RetailerMatch } from '../../src/types.ts'

type Env = Record<string, string | undefined>

type SearchHit = {
  title: string
  url: string
  source?: string
}

type ScrapedFields = {
  title?: string
  brand?: string
  price?: string
  imageUrl?: string
  retailer?: string
  finalUrl?: string
}

export type LookupResponse = {
  status: number
  body: LookupResult | { error: string }
}

const BARCODE_PATTERN = /^\d{8,14}$/
const MAX_CANDIDATES = 4
const FETCH_TIMEOUT_MS = 4000
const GEMINI_TIMEOUT_MS = 18000
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-3.6-flash']

const SKIP_HOSTS = [
  'wikipedia.org',
  'youtube.com',
  'youtu.be',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'twitter.com',
  'x.com',
  'pinterest.com',
  'reddit.com',
  'google.com',
  'bing.com',
  'duckduckgo.com',
  'barcodelookup.com',
  'upcitemdb.com',
  'go-upc.com',
  'vertexaisearch.cloud.google.com',
  'grounding-api-redirect',
]

const RETAILER_NAMES: Record<string, string> = {
  'zara.com': 'Zara',
  'hm.com': 'H&M',
  'www2.hm.com': 'H&M',
  'asos.com': 'ASOS',
  'uniqlo.com': 'Uniqlo',
  'mango.com': 'Mango',
  'cos.com': 'COS',
  'arket.com': 'Arket',
  'farfetch.com': 'Farfetch',
  'zalando.com': 'Zalando',
  'nordstrom.com': 'Nordstrom',
  'macys.com': "Macy's",
  'gap.com': 'Gap',
  'nike.com': 'Nike',
  'adidas.com': 'Adidas',
  'about.nike.com': 'Nike',
  'ssense.com': 'SSENSE',
  'net-a-porter.com': 'NET-A-PORTER',
  'matchesfashion.com': 'MATCHES',
  'selfridges.com': 'Selfridges',
  'johnlewis.com': 'John Lewis',
  'next.co.uk': 'Next',
  'cosstores.com': 'COS',
}

export async function handleLookup(
  barcode: string,
  env: Env,
): Promise<LookupResponse> {
  const normalized = barcode.trim()
  if (!BARCODE_PATTERN.test(normalized)) {
    return { status: 400, body: { error: 'Enter an 8–14 digit barcode.' } }
  }

  const apiKey = env.GEMINI_API_KEY?.trim() || env.SEARCH_API_KEY?.trim()
  if (!apiKey) {
    return {
      status: 503,
      body: {
        error:
          'Search is not configured yet. Add GEMINI_API_KEY on the server.',
      },
    }
  }

  try {
    const identity = await lookupBarcodeIdentity(normalized)
    const hits = await searchRetailerLinks(normalized, identity, apiKey, env.GEMINI_MODEL)
    if (hits.length === 0) {
      return {
        status: 404,
        body: { error: 'No retailer listings found for this barcode.' },
      }
    }

    const candidates = (
      await Promise.all(hits.slice(0, MAX_CANDIDATES).map((hit) => hydrateHit(hit)))
    ).filter((item: RetailerMatch) => Boolean(item.productUrl))

    return {
      status: 200,
      body: { barcode: normalized, candidates },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'gemini unauthorized') {
      return {
        status: 502,
        body: { error: 'Gemini rejected the API key. Check GEMINI_API_KEY.' },
      }
    }
    return {
      status: 502,
      body: { error: 'Could not look up this barcode right now.' },
    }
  }
}

async function lookupBarcodeIdentity(
  barcode: string,
): Promise<{ title?: string; brand?: string }> {
  try {
    const response = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    )
    if (!response.ok) return {}
    const data = (await response.json()) as {
      items?: Array<{ title?: string; brand?: string }>
    }
    const item = data.items?.[0]
    return { title: item?.title, brand: item?.brand }
  } catch {
    return {}
  }
}

async function searchRetailerLinks(
  barcode: string,
  identity: { title?: string; brand?: string },
  apiKey: string,
  preferredModel: string | undefined,
): Promise<SearchHit[]> {
  const models = [
    preferredModel?.trim(),
    ...GEMINI_MODELS,
  ].filter((model, index, all): model is string => Boolean(model) && all.indexOf(model) === index)

  let lastError: Error | null = null
  for (const model of models) {
    try {
      const hits = await searchGemini(barcode, identity, apiKey, model)
      const resolved = await Promise.all(
        hits.map(async (hit) => ({ ...hit, url: await resolveRedirectUrl(hit.url) })),
      )
      const useful = dedupeHits(resolved.filter((hit) => isUsefulProductUrl(hit.url)))
      if (useful.length === 0) throw new Error('gemini empty')
      return useful
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('search failed')
      if (lastError.message === 'gemini unauthorized') throw lastError
    }
  }
  if (lastError?.message === 'gemini empty') return []
  throw lastError ?? new Error('search failed')
}

type GeminiResponse = {
  error?: { message?: string; status?: string; code?: number }
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>
    }
  }>
}

async function searchGemini(
  barcode: string,
  identity: { title?: string; brand?: string },
  apiKey: string,
  model: string,
): Promise<SearchHit[]> {
  const known = [identity.title, identity.brand].filter(Boolean).join(' by ')
  const prompt = [
    'Find official clothing retailer product pages for this barcode scanned in a store.',
    `Barcode: ${barcode}`,
    known ? `Known product hint: ${known}` : '',
    'Prefer brand sites and fashion retailers (Zara, H&M, ASOS, Uniqlo, Nike, Adidas, Farfetch, Zalando, department stores).',
    'Return ONLY a JSON array of 3 to 4 items, no markdown:',
    '[{"retailer":"Zara","title":"Product name","url":"https://..."}]',
    'Use real https product page URLs only. No homepages, search pages, Wikipedia, or social posts.',
  ]
    .filter(Boolean)
    .join('\n')

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
    },
  )

  if (response.status === 401 || response.status === 403) {
    throw new Error('gemini unauthorized')
  }
  if (response.status === 404) {
    throw new Error('gemini model missing')
  }
  if (!response.ok) {
    throw new Error('search failed')
  }

  const data = (await response.json()) as GeminiResponse
  if (data.error) {
    const status = data.error.status ?? ''
    if (status.includes('UNAUTHENTICATED') || status.includes('PERMISSION')) {
      throw new Error('gemini unauthorized')
    }
    throw new Error('search failed')
  }

  const candidate = data.candidates?.[0]
  const text = candidate?.content?.parts?.map((part) => part.text ?? '').join('\n') ?? ''
  const fromModel = parseHitsFromModelText(text)
  const fromGrounding = (candidate?.groundingMetadata?.groundingChunks ?? [])
    .map((chunk) => ({
      title: chunk.web?.title ?? 'Product',
      url: chunk.web?.uri ?? '',
      source: retailerFromUrl(chunk.web?.uri ?? ''),
    }))
    .filter((hit) => hit.url)

  const hits = [...fromModel, ...fromGrounding]
  if (hits.length === 0) throw new Error('gemini empty')
  return hits
}

async function resolveRedirectUrl(pageUrl: string): Promise<string> {
  if (
    !pageUrl.includes('vertexaisearch') &&
    !pageUrl.includes('grounding-api-redirect')
  ) {
    return pageUrl
  }
  try {
    const response = await fetch(pageUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(3000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Accept: 'text/html',
      },
    })
    return response.url || pageUrl
  } catch {
    return pageUrl
  }
}

function parseHitsFromModelText(text: string): SearchHit[] {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const raw = fenced?.[1] ?? text
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start === -1 || end === -1) return []

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const record = item as { title?: unknown; url?: unknown; retailer?: unknown }
      const url = asString(record.url)
      const title = asString(record.title)
      if (!url || !title) return []
      return [{ title, url, source: asString(record.retailer) }]
    })
  } catch {
    return []
  }
}

async function hydrateHit(hit: SearchHit): Promise<RetailerMatch> {
  const scraped = await scrapeProductPage(hit.url)
  const productUrl = scraped.finalUrl ?? hit.url
  return {
    retailer:
      scraped.retailer ??
      retailerFromUrl(productUrl) ??
      hit.source ??
      'Store',
    title: scraped.title ?? hit.title,
    brand: scraped.brand,
    price: scraped.price,
    imageUrl: scraped.imageUrl,
    productUrl,
  }
}

async function scrapeProductPage(pageUrl: string): Promise<ScrapedFields> {
  try {
    const response = await fetch(pageUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    if (!response.ok) return {}
    const html = await response.text()
    const finalUrl = response.url || pageUrl
    return { ...parseProductHtml(html, finalUrl), finalUrl }
  } catch {
    return {}
  }
}

function parseProductHtml(html: string, pageUrl: string): ScrapedFields {
  const fromJsonLd = parseJsonLd(html)
  const title =
    fromJsonLd.title ??
    metaContent(html, 'og:title') ??
    metaContent(html, 'twitter:title')
  const imageUrl =
    fromJsonLd.imageUrl ??
    metaContent(html, 'og:image') ??
    metaContent(html, 'twitter:image')
  const brand = fromJsonLd.brand ?? metaContent(html, 'product:brand')
  const price =
    fromJsonLd.price ??
    formatPrice(
      metaContent(html, 'product:price:amount') ??
        metaContent(html, 'og:price:amount'),
      metaContent(html, 'product:price:currency') ??
        metaContent(html, 'og:price:currency'),
    )

  return {
    title: title ? decodeHtml(title) : undefined,
    brand: brand ? decodeHtml(brand) : undefined,
    price,
    imageUrl: imageUrl ? resolveUrl(pageUrl, imageUrl) : undefined,
    retailer: retailerFromUrl(pageUrl),
  }
}

function parseJsonLd(html: string): ScrapedFields {
  const blocks = [
    ...html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ]
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1] ?? '') as unknown
      const product = findJsonLdProduct(parsed)
      if (!product) continue
      const offer = firstOffer(product.offers)
      return {
        title: asString(product.name),
        brand: brandName(product.brand),
        imageUrl: imageFromJsonLd(product.image),
        price: formatPrice(asString(offer?.price), asString(offer?.priceCurrency)),
      }
    } catch {
      continue
    }
  }
  return {}
}

function findJsonLdProduct(value: unknown): Record<string, unknown> | null {
  if (!value) return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJsonLdProduct(item)
      if (found) return found
    }
    return null
  }
  if (typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (record['@graph']) return findJsonLdProduct(record['@graph'])
  const type = record['@type']
  const types = Array.isArray(type) ? type : [type]
  if (types.some((item) => String(item).toLowerCase() === 'product')) return record
  return null
}

function firstOffer(value: unknown): Record<string, unknown> | null {
  if (!value) return null
  if (Array.isArray(value)) {
    return typeof value[0] === 'object' && value[0]
      ? (value[0] as Record<string, unknown>)
      : null
  }
  return typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function brandName(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'name' in value) {
    return asString((value as { name?: unknown }).name)
  }
  return undefined
}

function imageFromJsonLd(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return imageFromJsonLd(value[0])
  if (value && typeof value === 'object' && 'url' in value) {
    return asString((value as { url?: unknown }).url)
  }
  return undefined
}

function metaContent(html: string, property: string): string | undefined {
  const propertyPattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escapeRegExp(property)}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    'i',
  )
  const contentFirstPattern = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapeRegExp(property)}["'][^>]*>`,
    'i',
  )
  return propertyPattern.exec(html)?.[1] ?? contentFirstPattern.exec(html)?.[1]
}

function formatPrice(amount?: string, currency?: string): string | undefined {
  if (!amount) return undefined
  if (!currency) return amount
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
  }
  return `${symbols[currency.toUpperCase()] ?? `${currency} `}${amount}`
}

function retailerFromUrl(pageUrl: string): string | undefined {
  try {
    const host = new URL(pageUrl).hostname.replace(/^www\./, '')
    if (RETAILER_NAMES[host]) return RETAILER_NAMES[host]
    const match = Object.entries(RETAILER_NAMES).find(([domain]) =>
      host.endsWith(domain),
    )
    if (match) return match[1]
    const label = host.split('.')[0] ?? host
    return label.charAt(0).toUpperCase() + label.slice(1)
  } catch {
    return undefined
  }
}

function isUsefulProductUrl(pageUrl: string): boolean {
  try {
    const parsed = new URL(pageUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    const host = parsed.hostname.replace(/^www\./, '')
    if (host.includes('vertexaisearch') || host.includes('grounding-api-redirect')) {
      return false
    }
    if (parsed.pathname === '/' || parsed.pathname === '') return false
    return !SKIP_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))
  } catch {
    return false
  }
}

function dedupeHits(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>()
  const unique: SearchHit[] = []
  for (const hit of hits) {
    let host = hit.url
    try {
      host = new URL(hit.url).hostname.replace(/^www\./, '')
    } catch {
      continue
    }
    if (seen.has(host)) continue
    seen.add(host)
    unique.push(hit)
  }
  return unique
}

function resolveUrl(pageUrl: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, pageUrl).toString()
  } catch {
    return maybeRelative
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code)),
    )
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
