import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BottomNav } from '../components/BottomNav'
import { CameraIcon, ChevronIcon } from '../components/Icons'
import { ProductCard } from '../components/ProductCard'
import { getBin, getWishlist, moveToBin } from '../lib/wishlist'

type HomeTab = 'wishlist' | 'captured' | 'bin'

export function Home() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<HomeTab>('wishlist')
  const [items, setItems] = useState(() => getWishlist())
  const [binItems, setBinItems] = useState(() => getBin())

  function handleRemove(id: string) {
    moveToBin(id)
    setItems(getWishlist())
    setBinItems(getBin())
  }

  function handleOpen(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const list = tab === 'bin' ? binItems : tab === 'wishlist' ? items : []
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
        <CameraIcon />
        <span>Add a photo or scan barcode</span>
        <ChevronIcon />
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
                onClick={() => handleOpen(item.productUrl)}
                secondaryLabel={tab === 'wishlist' ? 'Remove' : undefined}
                onSecondary={tab === 'wishlist' ? () => handleRemove(item.id) : undefined}
              />
            </li>
          ))}
        </ul>
      )}

      <BottomNav active="wishlist" />
    </section>
  )
}
