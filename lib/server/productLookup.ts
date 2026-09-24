import type { LookupResult, RetailerMatch } from '../../src/types.ts'

type Env = Record<string, string | undefined>

type SearchHit = {
  title: string
  url: string
  source?: string
  imageUrl?: string
  price?: string
}

type ScrapedFields = {
  title?: string
  brand?: string
  price?: string
  color?: string
  availability?: string
  description?: string
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
const GEMINI_TIMEOUT_MS = 12000
const GEMINI_MODELS = ['gemini-2.5-flash']

type ProductIdentity = {
  title?: string
  brand?: string
  imageUrl?: string
  offers?: SearchHit[]
}

const IDENTITY_TTL_MS = 60 * 60 * 1000
const identityCache = new Map<string, { expires: number; value: ProductIdentity }>()

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
  query: string,
  env: Env,
): Promise<LookupResponse> {
  const normalized = query.trim()
  const isBarcode = BARCODE_PATTERN.test(normalized)
  if (!normalized || (!isBarcode && normalized.length < 2)) {
    return {
      status: 400,
      body: { error: 'Enter a product name or 8–14 digit barcode.' },
    }
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
    const identity = isBarcode ? await lookupBarcodeIdentity(normalized) : {}
    const hits = await searchRetailerLinks(
      normalized,
      identity,
      apiKey,
      env.GEMINI_MODEL,
      isBarcode ? 'barcode' : 'query',
    )
    if (hits.length === 0) {
      return {
        status: 404,
        body: {
          error: isBarcode
            ? 'No retailer listings found for this barcode.'
            : 'No retailer listings found for this search.',
        },
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

async function lookupBarcodeIdentity(barcode: string): Promise<ProductIdentity> {
  const cached = identityCache.get(barcode)
  if (cached && cached.expires > Date.now()) return cached.value

  const fromApi = await lookupUpcitemdbApi(barcode)
  const value =
    fromApi.title || fromApi.offers?.length
      ? fromApi
      : await scrapeBarcodeCatalogs(barcode)
  identityCache.set(barcode, { expires: Date.now() + IDENTITY_TTL_MS, value })
  return value
}

async function lookupUpcitemdbApi(barcode: string): Promise<ProductIdentity> {
  try {
    const response = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    )
    if (!response.ok) return {}
    const data = (await response.json()) as {
      items?: Array<{
        title?: string
        brand?: string
        images?: string[]
        offers?: Array<{
          merchant?: string
          domain?: string
          title?: string
          link?: string
          price?: number | string
        }>
      }>
    }
    const item = data.items?.[0]
    if (!item?.title && !item?.offers?.length) return {}
    const offers = await Promise.all(
      (item.offers ?? []).slice(0, MAX_CANDIDATES).map(async (offer) => ({
        title: offer.title || item.title || 'Product',
        url: await resolveRedirectUrl(offer.link ?? ''),
        source: offer.merchant || offer.domain,
        imageUrl: item.images?.[0],
        price: normalizePrice(offer.price),
      })),
    )
    return {
      title: item.title,
      brand: item.brand,
      imageUrl: item.images?.[0],
      offers: offers.filter((offer) => isUsefulProductUrl(offer.url)),
    }
  } catch {
    return {}
  }
}

async function scrapeBarcodeCatalogs(barcode: string): Promise<ProductIdentity> {
  const pages = [
    `https://go-upc.com/search?q=${encodeURIComponent(barcode)}`,
    `https://www.upcitemdb.com/upc/${encodeURIComponent(barcode)}`,
  ]
  for (const pageUrl of pages) {
    try {
      const response = await fetch(pageUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          ...BROWSER_HEADERS,
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      })
      if (!response.ok) continue
      const html = await response.text()
      const identity = parseBarcodeCatalogHtml(html, barcode)
      if (identity.title) return identity
    } catch {
      continue
    }
  }
  return {}
}

function parseBarcodeCatalogHtml(html: string, barcode: string): ProductIdentity {
  const raw =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1] ??
    html.match(/<h1[^>]*>([^<]+)/i)?.[1] ??
    html.match(/<title>([^<]+)/i)?.[1]
  if (!raw) return {}
  let title = decodeHtml(raw)
    .replace(/\s*[|—–-]\s*(?:UPC|EAN|Go-UPC|upcitemdb\.com).*$/i, '')
    .replace(new RegExp(`(?:UPC|EAN)\\s*${escapeRegExp(barcode)}\\s*[-–—:]?\\s*`, 'i'), '')
    .replace(/\s+[—–-]\s+Go-UPC$/i, '')
    .trim()
  if (!title || /^upc\s/i.test(title)) return {}
  const brand =
    html.match(/<[^>]+class=["'][^"']*brand[^"']*["'][^>]*>([^<]+)/i)?.[1]?.trim() ??
    title.split(/\s+/)[0]
  const imageUrl = usableImageUrl(
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1],
    '',
  )
  return { title, brand, imageUrl }
}

async function searchRetailerLinks(
  query: string,
  identity: ProductIdentity,
  apiKey: string,
  preferredModel: string | undefined,
  mode: 'barcode' | 'query',
): Promise<SearchHit[]> {
  const models = [
    preferredModel?.trim(),
    ...GEMINI_MODELS,
  ].filter((model, index, all): model is string => Boolean(model) && all.indexOf(model) === index)

  let lastError: Error | null = null
  for (const model of models) {
    try {
      const hits = await searchGemini(query, identity, apiKey, model, mode)
      const resolved = await Promise.all(
        hits.map(async (hit) => ({
          ...hit,
          url: await resolveRedirectUrl(hit.url),
          imageUrl: hit.imageUrl ?? identity.imageUrl,
        })),
      )
      const useful = dedupeHits(resolved.filter((hit) => isUsefulProductUrl(hit.url)))
      if (useful.length === 0) throw new Error('gemini empty')
      return useful
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('search failed')
      if (lastError.message === 'gemini unauthorized') throw lastError
      if (lastError.message === 'gemini timeout') break
      if (lastError.message === 'gemini bad request') continue
    }
  }

  if (identity.offers?.length) return dedupeHits(identity.offers)
  if (lastError?.message === 'gemini empty' || lastError?.message === 'gemini timeout') {
    return []
  }
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
  query: string,
  identity: ProductIdentity,
  apiKey: string,
  model: string,
  mode: 'barcode' | 'query',
): Promise<SearchHit[]> {
  const known = [identity.title, identity.brand].filter(Boolean).join(' by ')
  const prompt = [
    'Find 3 official clothing retailer product pages for this exact product.',
    identity.title
      ? `Product: ${identity.title}`
      : mode === 'barcode'
        ? `Barcode: ${query}`
        : `Search query: ${query}`,
    identity.brand ? `Brand: ${identity.brand}` : '',
    mode === 'barcode' && identity.title ? `Barcode: ${query}` : '',
    'Only return pages for this same product, not other items from the brand.',
    'Return JSON only:',
    '[{"retailer":"Nike","title":"...","url":"https://...","imageUrl":"https://...","price":"$64"}]',
    'Use real product page URLs only. No search pages or social posts.',
  ]
    .filter(Boolean)
    .join('\n')

  let response: Response
  try {
    response = await fetch(
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
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 800,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('gemini timeout')
    }
    throw error
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('gemini unauthorized')
  }
  if (response.status === 404) {
    throw new Error('gemini model missing')
  }
  if (response.status === 400) {
    throw new Error('gemini bad request')
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
    !pageUrl.includes('grounding-api-redirect') &&
    !pageUrl.includes('upcitemdb.com/norob')
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
      const record = item as {
        title?: unknown
        url?: unknown
        retailer?: unknown
        imageUrl?: unknown
        price?: unknown
      }
      const url = asString(record.url)
      const title = asString(record.title)
      if (!url || !title) return []
      return [
        {
          title,
          url,
          source: asString(record.retailer),
          imageUrl: asString(record.imageUrl),
          price: normalizePrice(record.price),
        },
      ]
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
    price: scraped.price ?? hit.price,
    color: scraped.color,
    availability: scraped.availability,
    description: scraped.description,
    imageUrl: scraped.imageUrl ?? usableImageUrl(hit.imageUrl, productUrl),
    productUrl,
  }
}

const BROWSER_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.8',
}

export async function scrapeProductPage(pageUrl: string): Promise<ScrapedFields> {
  const agents = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ]

  let scraped: ScrapedFields = {}
  for (const [index, userAgent] of agents.entries()) {
    try {
      const response = await fetch(pageUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          ...BROWSER_HEADERS,
          'User-Agent': userAgent,
        },
        redirect: 'follow',
      })
      if (!response.ok) {
        if (index === agents.length - 1) break
        continue
      }
      const html = await response.text()
      const finalUrl = response.url || pageUrl
      scraped = { ...parseProductHtml(html, finalUrl), finalUrl }
      if (scraped.imageUrl && scraped.price) return scraped
      break
    } catch {
      if (index === agents.length - 1) break
    }
  }

  const shopify = await scrapeShopifyProduct(scraped.finalUrl || pageUrl)
  if (!shopify.imageUrl && !scraped.imageUrl) return { ...scraped, ...shopify }
  return {
    ...scraped,
    ...shopify,
    imageUrl: scraped.imageUrl ?? shopify.imageUrl,
    title: scraped.title ?? shopify.title,
    brand: scraped.brand ?? shopify.brand,
    price: scraped.price ?? shopify.price,
    finalUrl: scraped.finalUrl ?? shopify.finalUrl,
  }
}

async function scrapeShopifyProduct(pageUrl: string): Promise<ScrapedFields> {
  let parsed: URL
  try {
    parsed = new URL(pageUrl)
  } catch {
    return {}
  }
  if (!/\/products\/[^/]+/i.test(parsed.pathname)) return {}

  const jsonUrl = `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}.js`
  try {
    const response = await fetch(jsonUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        ...BROWSER_HEADERS,
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json,text/javascript,*/*',
      },
      redirect: 'follow',
    })
    if (!response.ok) return {}
    const data = (await response.json()) as {
      title?: string
      vendor?: string
      featured_image?: string
      images?: Array<string | { src?: string }>
      price?: number | string
      price_min?: number | string
      price_currency?: string
      currency?: string
      variants?: Array<{ price?: number | string }>
    }
    const rawImage =
      data.featured_image ||
      (typeof data.images?.[0] === 'string'
        ? data.images[0]
        : data.images?.[0]?.src)
    return {
      title: asString(data.title),
      brand: asString(data.vendor),
      imageUrl: usableImageUrl(rawImage, jsonUrl),
      price: shopifyPrice(data),
      finalUrl: pageUrl,
    }
  } catch {
    return {}
  }
}

function parseProductHtml(html: string, pageUrl: string): ScrapedFields {
  const fromJsonLd = parseJsonLd(html, pageUrl)
  const title =
    fromJsonLd.title ??
    metaContent(html, 'og:title') ??
    metaContent(html, 'twitter:title')
  const imageUrl =
    fromJsonLd.imageUrl ??
    extractProductImage(html, pageUrl)
  const brand = fromJsonLd.brand ?? metaContent(html, 'product:brand')
  const color = fromJsonLd.color ?? metaContent(html, 'product:color')
  const description =
    fromJsonLd.description ??
    metaContent(html, 'og:description') ??
    metaContent(html, 'twitter:description') ??
    metaContent(html, 'description')
  const price = fromJsonLd.price ?? extractProductPrice(html)

  return {
    title: title ? decodeHtml(title) : undefined,
    brand: brand ? decodeHtml(brand) : undefined,
    color: color ? decodeHtml(color) : undefined,
    description: description ? tidyText(decodeHtml(description)) : undefined,
    availability: fromJsonLd.availability,
    price,
    imageUrl,
    retailer: retailerFromUrl(pageUrl),
  }
}

function extractProductImage(html: string, pageUrl: string): string | undefined {
  const metas = [
    'og:image:secure_url',
    'og:image:url',
    'og:image',
    'twitter:image:src',
    'twitter:image',
    'image',
  ]
  for (const name of metas) {
    const found = usableImageUrl(metaContent(html, name), pageUrl)
    if (found) return found
  }

  const shopify =
    /"(?:featured_image|featuredImage|product_image|image)"\s*:\s*"(?:https?:)?(\/\/[^"]+)"/i.exec(
      html,
    )?.[1]
  const fromShopify = usableImageUrl(shopify ? `https:${shopify}` : undefined, pageUrl)
  if (fromShopify) return fromShopify

  const itemprop = /<img[^>]+(?:itemprop=["']image["'][^>]+src|src=["']([^"']+)["'][^>]+itemprop=["']image["'])/i.exec(
    html,
  )
  const fromItemprop = usableImageUrl(itemprop?.[1], pageUrl)
  if (fromItemprop) return fromItemprop

  const images = [...html.matchAll(/<img\b[^>]*>/gi)]
    .map((match) => imageFromImgTag(match[0], pageUrl))
    .filter((url): url is string => Boolean(url))
  return images[0]
}

function imageFromImgTag(tag: string, pageUrl: string): string | undefined {
  const attr = (name: string) =>
    new RegExp(`${name}=["']([^"']+)`, 'i').exec(tag)?.[1]
  const srcset = attr('srcset') || attr('data-srcset')
  const srcsetUrl = srcset
    ?.split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean)
    .at(-1)
  const raw =
    srcsetUrl ||
    attr('data-src') ||
    attr('data-lazy-src') ||
    attr('src')
  const url = usableImageUrl(raw, pageUrl)
  if (!url) return undefined
  const context = `${attr('alt') ?? ''} ${attr('class') ?? ''} ${attr('id') ?? ''}`.toLowerCase()
  if (/(logo|icon|sprite|swatch|placeholder|avatar|badge|pixel|1x1)/.test(context + url)) {
    return undefined
  }
  return url
}

function usableImageUrl(value?: string, pageUrl?: string): string | undefined {
  const raw = decodeHtml(String(value || '').trim())
  if (!raw || raw.startsWith('data:')) return undefined
  const href = raw.startsWith('//') ? `https:${raw}` : raw
  const absolute = pageUrl ? resolveUrl(pageUrl, href) : href
  try {
    const parsed = new URL(absolute)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
    const path = `${parsed.hostname}${parsed.pathname}${parsed.search}`
    if (/(logo|favicon|sprite|placeholder|1x1|pixel)/i.test(path) && !/product/i.test(path)) {
      return undefined
    }
    return parsed.toString()
  } catch {
    return undefined
  }
}

function parseJsonLd(html: string, pageUrl?: string): ScrapedFields {
  const blocks = [
    ...html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ]
  let best: ScrapedFields = {}
  for (const block of blocks) {
    const raw = (block[1] ?? '').trim()
    try {
      const parsed = JSON.parse(raw) as unknown
      const product = findJsonLdProduct(parsed)
      if (!product) continue
      const offer = firstOffer(product.offers)
      const next: ScrapedFields = {
        title: asString(product.name),
        brand: brandName(product.brand),
        color: asString(product.color),
        description: asString(product.description),
        availability: prettyAvailability(asString(offer?.availability)),
        imageUrl: imageFromJsonLd(product.image, pageUrl),
        price: priceFromOffer(offer),
      }
      best = {
        title: best.title ?? next.title,
        brand: best.brand ?? next.brand,
        color: best.color ?? next.color,
        description: best.description ?? next.description,
        availability: best.availability ?? next.availability,
        imageUrl: best.imageUrl ?? next.imageUrl,
        price: best.price ?? next.price,
      }
      if (best.imageUrl && best.price) return best
    } catch {
      const fallbackImage = usableImageUrl(
        /"(?:image|contentUrl|url)"\s*:\s*"(https?:\/\/[^"]+\.(?:jpe?g|png|webp|avif)[^"]*)"/i.exec(
          raw,
        )?.[1],
        pageUrl,
      )
      const fallbackPrice = normalizePrice(
        /"(?:price|lowPrice|highPrice)"\s*:\s*"?([£$€]?\s*[\d,.]+)"?/i.exec(raw)?.[1],
      )
      if (fallbackImage && !best.imageUrl) {
        best = { ...best, imageUrl: fallbackImage }
      }
      if (fallbackPrice && !best.price) {
        best = { ...best, price: fallbackPrice }
      }
    }
  }
  return best
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

function imageFromJsonLd(value: unknown, pageUrl?: string): string | undefined {
  if (typeof value === 'string') return usableImageUrl(value, pageUrl)
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = imageFromJsonLd(item, pageUrl)
      if (found) return found
    }
    return undefined
  }
  if (value && typeof value === 'object') {
    const record = value as { url?: unknown; contentUrl?: unknown; src?: unknown }
    return (
      usableImageUrl(asString(record.contentUrl), pageUrl) ??
      usableImageUrl(asString(record.url), pageUrl) ??
      usableImageUrl(asString(record.src), pageUrl)
    )
  }
  return undefined
}

function metaContent(html: string, property: string): string | undefined {
  const name = escapeRegExp(property)
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name|itemprop)=["']${name}["'][^>]*?content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${name}["']`,
      'i',
    ),
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(html)?.[1]
    if (match) return decodeHtml(match)
  }
  return undefined
}

function tidyText(value: string, max = 420): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max).trim()}…`
}

function prettyAvailability(value?: string): string | undefined {
  if (!value) return undefined
  const label = value.split('/').pop() ?? value
  const spaced = label.replace(/([a-z])([A-Z])/g, '$1 $2').trim()
  return spaced || undefined
}

function extractProductPrice(html: string): string | undefined {
  const amount =
    metaContent(html, 'product:price:amount') ??
    metaContent(html, 'og:price:amount') ??
    metaContent(html, 'twitter:data1') ??
    metaContent(html, 'price')
  const currency =
    metaContent(html, 'product:price:currency') ??
    metaContent(html, 'og:price:currency')
  const fromMeta = normalizePrice(amount, currency)
  if (fromMeta) return fromMeta

  const itemprop = /itemprop=["']price["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1]
    ?? /content=["']([^"']+)["'][^>]*itemprop=["']price["']/i.exec(html)?.[1]
    ?? /itemprop=["']price["'][^>]*>\s*([£$€]?\s*[\d,.]+)/i.exec(html)?.[1]
  const fromItemprop = normalizePrice(itemprop, currency)
  if (fromItemprop) return fromItemprop

  const jsonPrice =
    /"(?:price(?:Amount)?|current_price|sale_price)"\s*:\s*"?([£$€]?\s*[\d,.]+)"?/i.exec(
      html,
    )?.[1]
  return normalizePrice(jsonPrice, currency)
}

function shopifyPrice(data: {
  price?: number | string
  price_min?: number | string
  price_currency?: string
  currency?: string
  variants?: Array<{ price?: number | string }>
}): string | undefined {
  const raw = data.price ?? data.price_min ?? data.variants?.[0]?.price
  const currency = data.price_currency || data.currency || 'USD'
  if (typeof raw === 'number' && raw > 0) {
    const dollars = Number.isInteger(raw) && raw >= 100 ? raw / 100 : raw
    return formatPrice(String(dollars), currency)
  }
  if (typeof raw === 'string' && raw.trim()) {
    if (/[£$€]/.test(raw)) return normalizePrice(raw, currency)
    const numeric = Number(raw.replace(/,/g, ''))
    if (!Number.isFinite(numeric) || numeric <= 0) return undefined
    const dollars =
      Number.isInteger(numeric) && !raw.includes('.') && numeric >= 100
        ? numeric / 100
        : numeric
    return formatPrice(String(dollars), currency)
  }
  return undefined
}

function priceFromOffer(offer: Record<string, unknown> | null): string | undefined {
  if (!offer) return undefined
  const amount = offer.price ?? offer.lowPrice ?? offer.highPrice
  const currency = asString(offer.priceCurrency)
  if (typeof amount === 'number' && amount > 0) {
    return formatPrice(String(amount), currency)
  }
  return normalizePrice(amount, currency)
}

function normalizePrice(value: unknown, currency?: string): string | undefined {
  if (typeof value === 'number' && value > 0) {
    return formatPrice(String(value), currency)
  }
  const raw = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!raw) return undefined
  if (/from|starting|\/mo|month|week/i.test(raw)) return undefined
  const withSymbol = raw.match(/([£$€])\s*([\d,.]+)/)
  if (withSymbol) {
    return `${withSymbol[1]}${trimAmount(withSymbol[2])}`
  }
  const amount = raw.match(/[\d,.]+/)?.[0]
  if (!amount) return undefined
  return formatPrice(amount, currency)
}

function trimAmount(amount: string): string {
  const numeric = Number(amount.replace(/,/g, ''))
  if (!Number.isFinite(numeric)) return amount
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2).replace(/\.00$/, '')
}

function formatPrice(amount?: string, currency?: string): string | undefined {
  if (!amount) return undefined
  const cleaned = trimAmount(amount)
  if (!cleaned) return undefined
  if (/^[£$€]/.test(amount.trim())) return `${amount.trim()[0]}${cleaned}`
  if (!currency) return cleaned
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
  }
  return `${symbols[currency.toUpperCase()] ?? `${currency} `}${cleaned}`
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
