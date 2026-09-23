export type RetailerMatch = {
  retailer: string
  title: string
  brand?: string
  price?: string
  imageUrl?: string
  productUrl: string
}

export type WishlistItem = RetailerMatch & {
  id: string
  barcode: string
  savedAt: string
}

export type LookupResult = {
  barcode: string
  candidates: RetailerMatch[]
}
