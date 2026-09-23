import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ProductCard } from '../components/ProductCard'
import { getWishlist, removeWishlistItem } from '../lib/wishlist'

export function Home() {
  const navigate = useNavigate()
  const [items, setItems] = useState(() => getWishlist())

  const isEmpty = items.length === 0
  const countLabel = useMemo(() => {
    if (items.length === 1) return '1 saved item'
    return `${items.length} saved items`
  }, [items.length])

  function handleRemove(id: string) {
    removeWishlistItem(id)
    setItems(getWishlist())
  }

  function handleOpen(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <section className="page page--home">
      <header className="page-header">
        <div>
          <p className="eyebrow">Your list</p>
          <h1>Wishlist</h1>
        </div>
        {!isEmpty ? <p className="page-header__meta">{countLabel}</p> : null}
      </header>

      {isEmpty ? (
        <div className="empty-state">
          <div className="empty-state__icon" aria-hidden="true">
            +
          </div>
          <h2>No saved items yet</h2>
          <p>Scan a barcode in store to add your first piece.</p>
        </div>
      ) : (
        <ul className="product-list">
          {items.map((item) => (
            <li key={item.id}>
              <ProductCard
                item={item}
                onClick={() => handleOpen(item.productUrl)}
                secondaryLabel="Remove"
                onSecondary={() => handleRemove(item.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="scan-fab"
        onClick={() => navigate('/scan')}
      >
        Scan
      </button>
    </section>
  )
}
