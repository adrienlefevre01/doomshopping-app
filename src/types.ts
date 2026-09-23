export type RetailerMatch = {
  retailer: string
  title: string
  brand?: string
  price?: string
  color?: string
  availability?: string
  description?: string
  details?: string[]
  imageUrl?: string
  productUrl: string
}

export type ReviewSource = {
  id: string
  title: string
  source: string
  minutes: number
  excerpt: string
  url?: string
  thumbnailUrl?: string
  scope?: 'product' | 'brand'
  sourceKind?: 'official' | 'independent'
}

export type ReviewClaim = {
  text: string
  sourceIds: string[]
  scope?: 'product' | 'brand'
  kind?: 'fact' | 'category' | 'style' | 'audience' | 'positioning' | 'reputation'
}

export type BrandProfile = {
  id: string
  name: string
  description: string
  logoUrl?: string
  priceTier?: 'budget' | 'mid-range' | 'premium' | 'luxury'
  claims: ReviewClaim[]
  sources: ReviewSource[]
  status: 'provisional' | 'grounded'
}

export type WishlistItem = RetailerMatch & {
  id: string
  barcode: string
  savedAt: string
  reviewClaims?: ReviewClaim[]
  reviews?: ReviewSource[]
  reviewsLoaded?: boolean
  brandProfile?: BrandProfile
  brandLoaded?: boolean
}

export type LookupResult = {
  barcode: string
  candidates: RetailerMatch[]
}
