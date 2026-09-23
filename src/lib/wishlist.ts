import type { RetailerMatch, WishlistItem } from '../types'

const WISHLIST_KEY = 'doomshopping.wishlist'
const BIN_KEY = 'doomshopping.bin'
const ONBOARDED_KEY = 'doomshopping.hasOnboarded'

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

export function getWishlist(): WishlistItem[] {
  if (!canUseStorage()) return []
  try {
    const raw = window.localStorage.getItem(WISHLIST_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as WishlistItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
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

export function getBin(): WishlistItem[] {
  if (!canUseStorage()) return []
  try {
    const raw = window.localStorage.getItem(BIN_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as WishlistItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveBin(items: WishlistItem[]) {
  if (!canUseStorage()) return
  window.localStorage.setItem(BIN_KEY, JSON.stringify(items))
}

export function moveToBin(id: string) {
  const item = getWishlist().find((entry) => entry.id === id)
  if (!item) return
  saveWishlist(getWishlist().filter((entry) => entry.id !== id))
  saveBin([item, ...getBin().filter((entry) => entry.id !== id)])
}
