import type { BrandProfile, ReviewClaim, ReviewSource } from '../../src/types.ts'

type Env = Record<string, string | undefined>

export type ResearchRequest = {
  phase: 'reviews' | 'brand'
  url?: string
  product?: {
    name?: string
    brand?: string
    category?: string
    color?: string
    price?: string
    identifiers?: { gtin?: string }
  }
  extracted?: {
    name?: string
    brand?: string
    color?: string
    price?: string
    description?: string
    image?: string
  }
}

export type ResearchResponse = {
  status: number
  body:
    | {
        reviews?: ReviewSource[]
        reviewClaims?: ReviewClaim[]
        summary?: string
        brandProfile?: BrandProfile
        error?: string
      }
    | { error: string }
}

type GeminiResponse = {
  error?: { message?: string; status?: string }
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    groundingMetadata?: {
      groundingChunks?: Array<{
        web?: { uri?: string; url?: string; title?: string }
      }>
      groundingSupports?: Array<{
        segment?: { startIndex?: number; endIndex?: number; text?: string }
        groundingChunkIndices?: number[]
      }>
    }
  }>
}

type GroundingSource = {
  id: string
  index: number
  title: string
  url: string
}

type Grounding = {
  text: string
  sources: GroundingSource[]
  supports: Array<{
    start: number
    end: number
    text: string
    sourceIndexes: number[]
  }>
}

const GEMINI_TIMEOUT_MS = 22000
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-3.6-flash']
const FETCH_TIMEOUT_MS = 4000

export async function handleResearch(
  request: ResearchRequest,
  env: Env,
): Promise<ResearchResponse> {
  const apiKey = env.GEMINI_API_KEY?.trim() || env.SEARCH_API_KEY?.trim()
  if (!apiKey) {
    return {
      status: 503,
      body: { error: 'Search is not configured yet. Add GEMINI_API_KEY on the server.' },
    }
  }

  const phase = request.phase
  const product = request.product ?? {}
  const extracted = request.extracted ?? {}
  const name = String(product.name || extracted.name || '').trim()
  const brand = String(product.brand || extracted.brand || '').trim()

  try {
    if (phase === 'reviews') {
      if (!name) {
        return { status: 400, body: { error: 'Reviews need a product name.' } }
      }
      const generated = await generateJson(apiKey, reviewsPrompt(name, brand, product, extracted), env)
      const grounded = groundedReviewResult(generated.parsed, generated.text, generated.geminiJson, 'product')
      const reviews = await attachArticleCovers(grounded.reviews)
      const validIds = new Set(reviews.map((review) => review.id))
      const reviewClaims = grounded.claims
        .map((claim) => ({
          ...claim,
          sourceIds: claim.sourceIds.filter((id) => validIds.has(id)),
        }))
        .filter((claim) => claim.sourceIds.length)
      return {
        status: 200,
        body: {
          reviews,
          reviewClaims,
          summary: reviewClaims.map((claim) => claim.text).join(' '),
        },
      }
    }

    if (phase === 'brand') {
      if (!brand) {
        return { status: 400, body: { error: 'Brand research needs a manufacturer name.' } }
      }
      const generated = await generateJson(apiKey, brandPrompt(name, brand, product), env)
      const profile = groundedBrandResult(generated.parsed, generated.text, generated.geminiJson, brand)
      const sources = await attachArticleCovers(profile.sources)
      const validIds = new Set(sources.map((source) => source.id))
      const claims = profile.claims
        .map((claim) => ({
          ...claim,
          sourceIds: claim.sourceIds.filter((id) => validIds.has(id)),
        }))
        .filter((claim) => claim.sourceIds.length)
      const brandProfile: BrandProfile = {
        ...profile,
        description: claims.map((claim) => claim.text).join(' '),
        claims,
        sources,
        status: claims.length && sources.length ? 'grounded' : 'provisional',
      }
      return { status: 200, body: { brandProfile } }
    }

    return { status: 400, body: { error: 'Unknown research phase.' } }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'gemini unauthorized') {
      return { status: 502, body: { error: 'Gemini rejected the API key.' } }
    }
    return { status: 502, body: { error: 'Could not research this product right now.' } }
  }
}

function reviewsPrompt(
  name: string,
  brand: string,
  product: ResearchRequest['product'],
  extracted: ResearchRequest['extracted'],
) {
  return [
    'Find independent written article reviews for this exact product. Focus only on editorial reviews; do not suggest products or deals.',
    `Exact product: ${JSON.stringify({
      name,
      brand,
      category: product?.category || 'clothing',
      color: product?.color || extracted?.color,
    })}`,
    'Return ONLY JSON:',
    '{ "claims": [{ "text": "one concise factual sentence supported by the searched articles" }] }',
    'Rules:',
    '- Search using the exact brand and model together plus the word "review".',
    '- Synthesize a balanced 2 to 4 sentence review from genuine written reviews of the exact product from magazines, newspapers, or specialist review sites.',
    '- Every sentence must be directly supported by at least one Google Search grounding source. Make each claim a complete standalone sentence.',
    '- Do not return YouTube, TikTok, or other video reviews.',
    '- Reject similarly named products, accessories, category roundups that do not review this model, and invented URLs.',
    '- Do not type or invent URLs; source URLs are taken from Google grounding metadata.',
    '- If no verifiable written review of this exact product exists, return "claims": [] and do not substitute another product.',
  ].join('\n')
}

function brandPrompt(name: string, brand: string, product: ResearchRequest['product']) {
  return [
    `Build an objective, source-grounded profile of the ${brand} brand as context for evaluating ${name || 'this product'}.`,
    `Product context: ${JSON.stringify({
      name,
      category: product?.category || 'clothing',
      identifiers: product?.identifiers || {},
    })}`,
    'Return ONLY JSON:',
    `{
  "profile": {
    "name": "canonical manufacturer name",
    "priceTier": "budget"|"mid-range"|"premium"|"luxury"
  },
  "claims": [{
    "text": "one concise factual sentence",
    "kind": "fact"|"category"|"style"|"audience"|"positioning"|"reputation"
  }]
}`,
    'Rules:',
    `- Confirm that ${brand} is the manufacturer, not merely the retailer hosting the source product page.`,
    '- Search the official brand site for factual self-description, then independent editorial, business, or specialist review sources for external context.',
    `- Return 3 to 6 standalone claims about ${brand}. Every sentence must be directly supported by Google Search grounding.`,
    '- Official sources may support founding facts, stated mission, products, and categories. Style, audience, positioning, quality, and reputation claims require independent sources.',
    '- Do not type URLs. The server obtains source URLs from grounding metadata.',
  ].join('\n')
}

async function generateJson(apiKey: string, prompt: string, env: Env) {
  const models = [
    env.GEMINI_MODEL?.trim(),
    ...GEMINI_MODELS,
  ].filter((model, index, all): model is string => Boolean(model) && all.indexOf(model) === index)

  let lastError: Error | null = null
  for (const model of models) {
    try {
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
            generationConfig: { temperature: 0.15 },
          }),
        },
      )
      if (response.status === 401 || response.status === 403) {
        throw new Error('gemini unauthorized')
      }
      if (response.status === 404) {
        lastError = new Error('gemini model missing')
        continue
      }
      if (!response.ok) {
        lastError = new Error('search failed')
        continue
      }
      const geminiJson = (await response.json()) as GeminiResponse
      if (geminiJson.error) {
        const status = geminiJson.error.status ?? ''
        if (status.includes('UNAUTHENTICATED') || status.includes('PERMISSION')) {
          throw new Error('gemini unauthorized')
        }
        lastError = new Error('search failed')
        continue
      }
      const text =
        geminiJson.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? '')
          .join('\n') ?? ''
      return { parsed: extractJson(text), geminiJson, text }
    } catch (error) {
      if (error instanceof Error && error.message === 'gemini unauthorized') {
        throw error
      }
      lastError = error instanceof Error ? error : new Error('search failed')
    }
  }
  throw lastError ?? new Error('search failed')
}

function extractJson(text: string): Record<string, unknown> {
  if (!text.trim()) return {}
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const raw = (fenced?.[1] ?? text).trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) return {}
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function groundingContext(text: string, geminiJson: GeminiResponse): Grounding {
  const metadata = geminiJson.candidates?.[0]?.groundingMetadata ?? {}
  const sources = (metadata.groundingChunks ?? [])
    .map((chunk, index) => {
      const url = httpUrl(chunk.web?.uri) || httpUrl(chunk.web?.url)
      if (!url) return null
      return {
        id: `source-${index + 1}`,
        index,
        title: String(chunk.web?.title || hostLabel(url)),
        url,
      }
    })
    .filter((item): item is GroundingSource => Boolean(item))

  const supports = (metadata.groundingSupports ?? [])
    .map((support) => ({
      start: Math.max(0, Number(support.segment?.startIndex) || 0),
      end: Math.max(0, Number(support.segment?.endIndex) || 0),
      text: String(support.segment?.text || ''),
      sourceIndexes: (support.groundingChunkIndices ?? [])
        .map(Number)
        .filter(Number.isInteger),
    }))
    .filter((support) => support.sourceIndexes.length)

  return { text: String(text || ''), sources, supports }
}

function groundedSourcesForValue(value: string, grounding: Grounding): GroundingSource[] {
  const needle = value.trim()
  if (!needle || !grounding.text) return []
  const ranges: Array<{ start: number; end: number }> = []
  let at = grounding.text.indexOf(needle)
  while (at !== -1) {
    ranges.push({ start: at, end: at + needle.length })
    at = grounding.text.indexOf(needle, at + Math.max(1, needle.length))
  }
  const sourceIndexes = new Set<number>()
  for (const support of grounding.supports) {
    const supportText = support.text
    const overlaps = ranges.some(
      (range) => support.end > range.start && support.start < range.end,
    )
    const contains =
      supportText.includes(needle) ||
      (needle.length >= 12 && needle.includes(supportText))
    if (overlaps || contains) {
      for (const index of support.sourceIndexes) sourceIndexes.add(index)
    }
  }
  const mapped = grounding.sources.filter((source) => sourceIndexes.has(source.index))
  if (mapped.length) return mapped
  return grounding.sources.filter((source) => httpUrl(source.url) && !isVideoPage(source.url))
}

function groundedReviewResult(
  parsed: Record<string, unknown>,
  text: string,
  geminiJson: GeminiResponse,
  scope: 'product' | 'brand',
) {
  const grounding = groundingContext(text, geminiJson)
  const claims: ReviewClaim[] = []
  const used = new Map<string, GroundingSource>()
  for (const item of asList(parsed.claims).slice(0, 6)) {
    const claim = String(asRecord(item)?.text || '').replace(/\s+/g, ' ').trim()
    if (claim.length < 20) continue
    const sources = groundedSourcesForValue(claim, grounding)
      .filter((source) => httpUrl(source.url) && !isVideoPage(source.url))
      .map((source) => ({ ...source, id: `${scope}-${source.id}` }))
    if (!sources.length) continue
    for (const source of sources) used.set(source.id, source)
    claims.push({
      text: claim,
      sourceIds: sources.map((source) => source.id),
      scope,
    })
  }
  const reviews = [...used.values()].slice(0, 5).map((source) =>
    sourceRow(
      source,
      scope,
      claims
        .filter((claim) => claim.sourceIds.includes(source.id))
        .map((claim) => claim.text)
        .join(' '),
    ),
  )
  return { claims, reviews }
}

function groundedBrandResult(
  parsed: Record<string, unknown>,
  text: string,
  geminiJson: GeminiResponse,
  fallbackName: string,
): BrandProfile {
  const grounding = groundingContext(text, geminiJson)
  const profile = asRecord(parsed.profile)
  const name = String(profile?.name || fallbackName).trim() || fallbackName
  const claims: ReviewClaim[] = []
  const used = new Map<string, GroundingSource>()
  for (const item of asList(parsed.claims).slice(0, 8)) {
    const record = asRecord(item)
    const claim = String(record?.text || '').replace(/\s+/g, ' ').trim()
    if (claim.length < 20) continue
    const mapped = groundedSourcesForValue(claim, grounding).filter(
      (source) => httpUrl(source.url) && !isVideoPage(source.url) && !isSearchUrl(source.url),
    )
    const sources = (mapped.length ? mapped : grounding.sources)
      .filter((source) => httpUrl(source.url) && !isVideoPage(source.url))
      .map((source) => ({
        ...source,
        id: `brand-${source.id}`,
      }))
    if (!sources.length) continue
    const kind = [
      'fact',
      'category',
      'style',
      'audience',
      'positioning',
      'reputation',
    ].includes(String(record?.kind || ''))
      ? (record?.kind as ReviewClaim['kind'])
      : 'fact'
    for (const source of sources) used.set(source.id, source)
    claims.push({
      text: claim,
      sourceIds: sources.map((source) => source.id),
      scope: 'brand',
      kind,
    })
  }
  const sources = [...used.values()].slice(0, 5).map((source) =>
    sourceRow(
      source,
      'brand',
      claims
        .filter((claim) => claim.sourceIds.includes(source.id))
        .map((claim) => claim.text)
        .join(' '),
      isOfficialBrandSource(source.url, name) ? 'official' : 'independent',
    ),
  )
  const priceTier = ['budget', 'mid-range', 'premium', 'luxury'].includes(
    String(profile?.priceTier || ''),
  )
    ? (profile?.priceTier as BrandProfile['priceTier'])
    : undefined
  return {
    id: slug(name),
    name,
    description: claims.map((claim) => claim.text).join(' '),
    priceTier,
    claims,
    sources,
    status: claims.length && sources.length ? 'grounded' : 'provisional',
  }
}

function sourceRow(
  source: GroundingSource,
  scope: 'product' | 'brand',
  excerpt: string,
  sourceKind: ReviewSource['sourceKind'] = 'independent',
): ReviewSource {
  return {
    id: source.id,
    title: source.title || (scope === 'brand' ? 'Brand source' : 'Review source'),
    source: publisherFromUrl(source.url),
    minutes: 5,
    excerpt: excerpt.slice(0, 240),
    url: source.url,
    scope,
    sourceKind,
  }
}

async function attachArticleCovers(reviews: ReviewSource[]): Promise<ReviewSource[]> {
  const hydrated = await Promise.all(
    reviews.map(async (review) => {
      const start = httpUrl(review.url)
      if (!start || isVideoPage(start)) {
        return { ...review, url: '', thumbnailUrl: review.thumbnailUrl }
      }
      const resolved = await resolveRedirectUrl(start)
      const page = await scrapeArticle(resolved || start)
      const url = page.finalUrl || resolved || start
      if (isVideoPage(url) || isSearchUrl(url)) {
        return { ...review, url: '' }
      }
      return {
        ...review,
        url,
        title: (page.title || review.title).slice(0, 180),
        source: publisherFromUrl(url),
        minutes: Math.max(1, page.minutes || review.minutes || 5),
        thumbnailUrl: page.imageUrl || review.thumbnailUrl,
      }
    }),
  )
  return hydrated.filter((review) => Boolean(httpUrl(review.url)) && !isVideoPage(review.url))
}

async function scrapeArticle(pageUrl: string): Promise<{
  title?: string
  imageUrl?: string
  minutes?: number
  finalUrl?: string
}> {
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
    if (!response.ok) return { finalUrl: response.url || pageUrl }
    const html = await response.text()
    const title =
      metaContent(html, 'og:title') ??
      metaContent(html, 'twitter:title') ??
      /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
    const image =
      metaContent(html, 'og:image') ?? metaContent(html, 'twitter:image')
    const words = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').split(/\s+/).length
    return {
      title: title ? decodeHtml(title).replace(/\s+/g, ' ').trim() : undefined,
      imageUrl: image ? resolveUrl(response.url || pageUrl, image) : undefined,
      minutes: Math.max(1, Math.min(12, Math.round(words / 220))),
      finalUrl: response.url || pageUrl,
    }
  } catch {
    return {}
  }
}

async function resolveRedirectUrl(pageUrl: string): Promise<string> {
  if (!pageUrl.includes('vertexaisearch') && !pageUrl.includes('grounding-api-redirect')) {
    return pageUrl
  }
  try {
    const response = await fetch(pageUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(3000),
      headers: { Accept: 'text/html' },
    })
    return response.url || pageUrl
  } catch {
    return pageUrl
  }
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

function httpUrl(value?: string): string {
  const raw = String(value || '').trim().replace(/&amp;/g, '&')
  const href = raw.startsWith('//') ? `https:${raw}` : raw
  try {
    const parsed = new URL(href)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    return parsed.toString()
  } catch {
    return ''
  }
}

function isVideoPage(value?: string) {
  return /(?:youtu\.be|youtube\.com|vimeo\.com|tiktok\.com|dailymotion\.com)/i.test(
    String(value || ''),
  )
}

function isSearchUrl(value?: string) {
  return /(?:google\.|bing\.|duckduckgo\.|vertexaisearch)/i.test(String(value || ''))
}

function isOfficialBrandSource(url: string, brandName: string) {
  const brand = compactKey(brandName)
  const host = compactKey(hostLabel(url))
  if (!brand || !host) return false
  return host === brand || host.startsWith(brand) || (brand.length >= 4 && host.includes(brand))
}

function publisherFromUrl(value?: string) {
  const host = hostLabel(value)
  if (!host) return 'Web'
  const label = host.split('.')[0]?.replace(/[-_]+/g, ' ') ?? host
  return label.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function hostLabel(value?: string) {
  try {
    return new URL(String(value)).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'item'
  )
}

function compactKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function resolveUrl(pageUrl: string, maybeRelative: string) {
  try {
    return new URL(maybeRelative, pageUrl).toString()
  } catch {
    return maybeRelative
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
