import type { BrandProfile, ReviewClaim, ReviewSource, WishlistItem } from '../types'

export type ReviewsResult = {
  reviews: ReviewSource[]
  reviewClaims: ReviewClaim[]
}

export type BrandResult = {
  brandProfile?: BrandProfile
}

function apiBase() {
  return import.meta.env.VITE_LOOKUP_API_URL?.replace(/\/$/, '') ?? ''
}

function payloadFromItem(item: WishlistItem) {
  return {
    url: item.productUrl,
    product: {
      name: item.title,
      brand: item.brand,
      category: 'clothing',
      color: item.color,
      price: item.price,
      identifiers: item.barcode ? { gtin: item.barcode } : undefined,
    },
    extracted: {
      name: item.title,
      brand: item.brand,
      color: item.color,
      price: item.price,
      description: item.description,
      image: item.imageUrl,
    },
  }
}

async function postResearch<T>(phase: 'reviews' | 'brand', item: WishlistItem): Promise<T> {
  const response = await fetch(`${apiBase()}/api/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phase, ...payloadFromItem(item) }),
  })
  const payload = (await response.json().catch(() => null)) as T & { error?: string }
  if (!response.ok) {
    throw new Error(payload?.error || 'Research failed.')
  }
  return payload
}

export async function fetchProductReviews(item: WishlistItem): Promise<ReviewsResult> {
  const data = await postResearch<ReviewsResult>('reviews', item)
  return {
    reviews: data.reviews ?? [],
    reviewClaims: data.reviewClaims ?? [],
  }
}

export async function fetchBrandProfile(item: WishlistItem): Promise<BrandResult> {
  return postResearch<BrandResult>('brand', item)
}
