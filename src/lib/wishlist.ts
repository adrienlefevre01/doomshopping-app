import type { RetailerMatch, WishlistItem } from '../types'

const WISHLIST_KEY = 'doomshopping.wishlist'
const CAPTURED_KEY = 'doomshopping.captured'
const BIN_KEY = 'doomshopping.bin'
const ONBOARDED_KEY = 'doomshopping.hasOnboarded'
const SEEDED_KEY = 'doomshopping.seeded.v1'

const PRESET_HAT: WishlistItem = {
  id: 'preset-be-hat-stone-blue',
  barcode: '',
  savedAt: '2026-09-23T00:00:00.000Z',
  retailer: 'b.Eautiful',
  brand: 'b.Eautiful',
  title: 'b.E Hat (Stone Blue Real Camo / White)',
  price: '$64',
  color: 'Stone Blue Real Camo / White',
  description:
    'Cotton snapback with a mid crown and structured fit. Embroidery on the front, side, and back.',
  details: [
    'Cotton',
    'Snapback',
    'Mid crown',
    'Structured fit',
    'Embroidery on front, side, and back',
    'Imported',
    '1–2 days processing',
    'All sales final',
  ],
  imageUrl:
    'https://cdn.shopify.com/s/files/1/0286/2219/2699/files/b.Eautiful_b.E_Hat_Stone_Blue_Real_Camo_White_1_41044cf6-1144-4479-b0be-3ac750e08c29.jpg?v=1788383080',
  productUrl:
    'https://b-eautiful.com/products/b-e-hat-stone-blue-real-camo-white',
  reviewsLoaded: true,
  reviews: [],
  reviewClaims: [],
  brandLoaded: true,
  brandProfile: {
    id: 'b-eautiful',
    name: 'b.Eautiful',
    description:
      'b.Eautiful is a Los Angeles-based clothing company that was launched in 2018. The brand’s core mission is to promote and provide access to underappreciated Japanese artists, designers, musicians, and other creatives globally.',
    priceTier: 'premium',
    status: 'grounded',
    claims: [
      {
        text: 'b.Eautiful is a Los Angeles-based clothing company that was launched in 2018.',
        sourceIds: ['brand-source-4', 'brand-source-1'],
        scope: 'brand',
        kind: 'fact',
      },
      {
        text: 'The brand’s core mission is to promote and provide access to underappreciated Japanese artists, designers, musicians, and other creatives globally.',
        sourceIds: ['brand-source-4', 'brand-source-1'],
        scope: 'brand',
        kind: 'positioning',
      },
      {
        text: 'b.Eautiful offers apparel focused on graphic tees, hoodies, and accessories such as hats.',
        sourceIds: ['brand-source-1', 'brand-source-3'],
        scope: 'brand',
        kind: 'category',
      },
      {
        text: 'It functions as a creative platform connecting Japanese subculture with global streetwear aesthetics.',
        sourceIds: ['brand-source-4'],
        scope: 'brand',
        kind: 'style',
      },
      {
        text: 'The brand is recognized for curated collaborations and limited-edition releases.',
        sourceIds: ['brand-source-4'],
        scope: 'brand',
        kind: 'reputation',
      },
    ],
    sources: [
      {
        id: 'brand-source-4',
        title: 'b.Eautiful is Exploring Japanese Culture Beyond Anime & Sushi',
        source: 'Highsnobiety',
        minutes: 6,
        excerpt:
          'b.Eautiful is a Los Angeles-based clothing company that was launched in 2018.',
        url: 'https://www.highsnobiety.com/p/b-eautiful-utr/',
        thumbnailUrl:
          'https://www.highsnobiety.com/static-assets/dato/1632610751-b-eautiful-utr-feature01.jpg',
        scope: 'brand',
        sourceKind: 'independent',
      },
      {
        id: 'brand-source-1',
        title: 'b.Eautiful',
        source: 'Bodega',
        minutes: 3,
        excerpt:
          'The brand’s core mission is to promote and provide access to underappreciated Japanese artists.',
        url: 'https://bdgastore.com/collections/b-eautiful',
        thumbnailUrl:
          'https://bdgastore.com/cdn/shop/collections/logotype_copy.webp?v=1773949604',
        scope: 'brand',
        sourceKind: 'independent',
      },
      {
        id: 'brand-source-3',
        title: 'b.Eautiful',
        source: 'Gallery Streetwear',
        minutes: 3,
        excerpt: 'b.Eautiful offers apparel including hats, tees, and hoodies.',
        url: 'https://gallerystreetwear.ca/collections/b-eautiful',
        thumbnailUrl:
          'https://gallerystreetwear.ca/cdn/shop/collections/f5afda75a1a542f1c25807798d63ce2e.png?v=1776757570&width=2048',
        scope: 'brand',
        sourceKind: 'independent',
      },
    ],
  },
}

function canUseStorage() {
  return typeof window !== 'undefined' && 'localStorage' in window
}

export function isOnboarded(): boolean {
  if (!canUseStorage()) return false
  return window.localStorage.getItem(ONBOARDED_KEY) === 'true'
}

export function setOnboarded() {
  if (!canUseStorage()) return
  window.localStorage.setItem(ONBOARDED_KEY, 'true')
}

function enrichKnownItem(item: WishlistItem): WishlistItem {
  if (item.productUrl !== PRESET_HAT.productUrl) return item
  return {
    ...item,
    brand: item.brand ?? PRESET_HAT.brand,
    color: item.color ?? PRESET_HAT.color,
    description: item.description ?? PRESET_HAT.description,
    details: item.details?.length ? item.details : PRESET_HAT.details,
    brandProfile: item.brandProfile ?? PRESET_HAT.brandProfile,
    brandLoaded: item.brandLoaded ?? PRESET_HAT.brandLoaded,
    reviews: item.reviews ?? PRESET_HAT.reviews,
    reviewClaims: item.reviewClaims ?? PRESET_HAT.reviewClaims,
    reviewsLoaded: item.reviewsLoaded ?? PRESET_HAT.reviewsLoaded,
  }
}

function readWishlist(): WishlistItem[] {
  if (!canUseStorage()) return []
  try {
    const raw = window.localStorage.getItem(WISHLIST_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as WishlistItem[]
    return Array.isArray(parsed) ? parsed.map(enrichKnownItem) : []
  } catch {
    return []
  }
}

function seedDefaultWishlist() {
  if (!canUseStorage()) return
  if (window.localStorage.getItem(SEEDED_KEY) === 'true') return

  const items = readWishlist()
  const alreadySaved = items.some(
    (item) => item.productUrl === PRESET_HAT.productUrl,
  )
  if (!alreadySaved) {
    saveWishlist([PRESET_HAT, ...items])
  }
  window.localStorage.setItem(SEEDED_KEY, 'true')
}

export function getWishlist(): WishlistItem[] {
  seedDefaultWishlist()
  return readWishlist()
}

function saveWishlist(items: WishlistItem[]) {
  if (!canUseStorage()) return
  window.localStorage.setItem(WISHLIST_KEY, JSON.stringify(items))
}

export function addWishlistItem(
  barcode: string,
  match: RetailerMatch,
): WishlistItem {
  const items = getWishlist()
  const existing = items.find(
    (item) => item.barcode === barcode && item.productUrl === match.productUrl,
  )
  if (existing) return existing

  const next: WishlistItem = {
    ...match,
    id: crypto.randomUUID(),
    barcode,
    savedAt: new Date().toISOString(),
  }
  saveWishlist([next, ...items])
  return next
}

function readList(key: string): WishlistItem[] {
  if (!canUseStorage()) return []
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as WishlistItem[]
    return Array.isArray(parsed) ? parsed.map(enrichKnownItem) : []
  } catch {
    return []
  }
}

function saveList(key: string, items: WishlistItem[]) {
  if (!canUseStorage()) return
  window.localStorage.setItem(key, JSON.stringify(items))
}

export function getCaptured(): WishlistItem[] {
  return readList(CAPTURED_KEY)
}

function saveCaptured(items: WishlistItem[]) {
  saveList(CAPTURED_KEY, items)
}

export function getBin(): WishlistItem[] {
  return readList(BIN_KEY)
}

export function findSavedItem(id: string): WishlistItem | undefined {
  return (
    getWishlist().find((item) => item.id === id) ??
    getCaptured().find((item) => item.id === id) ??
    getBin().find((item) => item.id === id)
  )
}

function saveBin(items: WishlistItem[]) {
  saveList(BIN_KEY, items)
}

function takeSavedItem(id: string): WishlistItem | undefined {
  const fromWishlist = getWishlist().find((entry) => entry.id === id)
  if (fromWishlist) {
    saveWishlist(getWishlist().filter((entry) => entry.id !== id))
    return fromWishlist
  }
  const fromCaptured = getCaptured().find((entry) => entry.id === id)
  if (fromCaptured) {
    saveCaptured(getCaptured().filter((entry) => entry.id !== id))
    return fromCaptured
  }
  return undefined
}

export function moveToCaptured(id: string) {
  const item = takeSavedItem(id)
  if (!item) return
  saveCaptured([item, ...getCaptured().filter((entry) => entry.id !== id)])
}

export function moveToWishlist(id: string) {
  const captured = getCaptured().find((entry) => entry.id === id)
  const item = captured ?? getBin().find((entry) => entry.id === id)
  if (!item) return
  if (captured) {
    saveCaptured(getCaptured().filter((entry) => entry.id !== id))
  } else {
    saveBin(getBin().filter((entry) => entry.id !== id))
  }
  const items = getWishlist()
  if (items.some((entry) => entry.id === id || entry.productUrl === item.productUrl)) {
    return
  }
  saveWishlist([item, ...items])
}

export function moveToBin(id: string) {
  const item = takeSavedItem(id)
  if (!item) return
  saveBin([item, ...getBin().filter((entry) => entry.id !== id)])
}

export function restoreFromBin(id: string) {
  const item = getBin().find((entry) => entry.id === id)
  if (!item) return
  saveBin(getBin().filter((entry) => entry.id !== id))
  const items = getWishlist()
  if (items.some((entry) => entry.id === id || entry.productUrl === item.productUrl)) {
    return
  }
  saveWishlist([item, ...items])
}

export function deleteFromBin(id: string) {
  saveBin(getBin().filter((entry) => entry.id !== id))
}

export function updateSavedItem(
  id: string,
  patch: Partial<WishlistItem>,
): WishlistItem | undefined {
  const lists: Array<{
    read: () => WishlistItem[]
    write: (items: WishlistItem[]) => void
  }> = [
    { read: getWishlist, write: saveWishlist },
    { read: getCaptured, write: saveCaptured },
    { read: getBin, write: saveBin },
  ]

  for (const list of lists) {
    const items = list.read()
    const index = items.findIndex((item) => item.id === id)
    if (index === -1) continue
    const next = { ...items[index], ...patch }
    const copy = [...items]
    copy[index] = next
    list.write(copy)
    return next
  }
  return undefined
}
