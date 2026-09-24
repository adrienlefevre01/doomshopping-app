import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, ChevronRight } from 'lucide-react'
import { BottomNav } from '../components/BottomNav'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ProductCard } from '../components/ProductCard'
import {
  deleteFromBin,
  getBin,
  getCaptured,
  getWishlist,
  moveToBin,
  moveToCaptured,
  moveToWishlist,
  restoreFromBin,
} from '../lib/wishlist'
import type { WishlistItem } from '../types'

type HomeTab = 'wishlist' | 'captured' | 'bin'

type PendingDelete = {
  item: WishlistItem
  from: 'wishlist' | 'captured' | 'bin'
}

export function Home() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<HomeTab>('wishlist')
  const [items, setItems] = useState(() => getWishlist())
  const [capturedItems, setCapturedItems] = useState(() => getCaptured())
  const [binItems, setBinItems] = useState(() => getBin())
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

  function refreshLists() {
    setItems(getWishlist())
    setCapturedItems(getCaptured())
    setBinItems(getBin())
  }

  function handleRestore(id: string) {
    restoreFromBin(id)
    refreshLists()
  }

  function handleHeart(item: WishlistItem) {
    if (tab === 'wishlist') {
      moveToCaptured(item.id)
    } else {
      moveToWishlist(item.id)
    }
    refreshLists()
  }

  function handleConfirmDelete() {
    if (!pendingDelete) return
    if (pendingDelete.from === 'bin') {
      deleteFromBin(pendingDelete.item.id)
    } else {
      moveToBin(pendingDelete.item.id)
    }
    setPendingDelete(null)
    refreshLists()
  }

  function handleOpen(item: WishlistItem) {
    navigate(`/item/${item.id}`)
  }

  const list =
    tab === 'bin' ? binItems : tab === 'captured' ? capturedItems : items
  const emptyCopy =
    tab === 'wishlist'
      ? 'Your wishlist is empty'
      : tab === 'captured'
        ? 'Nothing captured yet'
        : 'Bin is empty'

  return (
    <section className="page page--home">
      <button
        type="button"
        className="scan-pill"
        onClick={() => navigate('/scan')}
      >
        <Camera size={20} strokeWidth={1.75} />
        <span>Add a photo or scan barcode</span>
        <ChevronRight size={18} strokeWidth={1.75} />
      </button>

      <div className="tabs" role="tablist" aria-label="Lists">
        {(
          [
            ['wishlist', 'Wishlist'],
            ['captured', 'Captured'],
            ['bin', 'Bin'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'tabs__item is-active' : 'tabs__item'}
            onClick={() => setTab(id)}
          >
            {label}
            {tab === id ? <span className="tabs__dot" /> : null}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="empty-state">
          <p>{emptyCopy}</p>
        </div>
      ) : (
        <ul className="product-list">
          {list.map((item) => (
            <li key={item.id}>
              <ProductCard
                item={item}
                onClick={() => handleOpen(item)}
                hearted={tab === 'wishlist'}
                onHeart={
                  tab === 'wishlist' || tab === 'captured'
                    ? () => handleHeart(item)
                    : undefined
                }
                onTrash={
                  tab === 'wishlist' || tab === 'captured' || tab === 'bin'
                    ? () => setPendingDelete({ item, from: tab })
                    : undefined
                }
                onRestore={tab === 'bin' ? () => handleRestore(item.id) : undefined}
              />
            </li>
          ))}
        </ul>
      )}

      {pendingDelete ? (
        <ConfirmDialog
          title={pendingDelete.from === 'bin' ? 'Delete item?' : 'Move to bin?'}
          message={
            pendingDelete.from === 'bin'
              ? `Delete “${pendingDelete.item.title}” permanently? This cannot be undone.`
              : `Move “${pendingDelete.item.title}” to the bin?`
          }
          confirmLabel={pendingDelete.from === 'bin' ? 'Delete' : 'Move to bin'}
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}

      <BottomNav active="wishlist" />
    </section>
  )
}
