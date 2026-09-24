import { Heart, RotateCcw, Trash2 } from 'lucide-react'
import type { RetailerMatch } from '../types'

type ProductCardProps = {
  item: RetailerMatch
  onClick?: () => void
  onHeart?: () => void
  onTrash?: () => void
  onRestore?: () => void
  hearted?: boolean
}

function productHeading(item: RetailerMatch) {
  const brand = item.brand?.trim()
  const title = item.title.trim()
  if (!brand) return title
  return `${brand} - ${title}`
}

export function ProductCard({
  item,
  onClick,
  onHeart,
  onTrash,
  onRestore,
  hearted = false,
}: ProductCardProps) {
  return (
    <article
      className={onClick ? 'product-card product-card--clickable' : 'product-card'}
      onClick={onClick}
    >
      <div className="product-card__image">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          <div className="product-card__placeholder" />
        )}
      </div>
      <div className="product-card__body">
        <p className="product-card__retailer">{item.retailer}</p>
        <h3 className="product-card__title">{productHeading(item)}</h3>
        {item.price ? <p className="product-card__price">{item.price}</p> : null}
        {(onHeart || onTrash || onRestore) && (
          <div className="product-card__actions">
            {onRestore ? (
              <button
                type="button"
                className="icon-btn"
                aria-label="Restore"
                onClick={(event) => {
                  event.stopPropagation()
                  onRestore()
                }}
              >
                <RotateCcw size={16} strokeWidth={1.75} />
              </button>
            ) : null}
            {onHeart ? (
              <button
                type="button"
                className="icon-btn"
                aria-label={hearted ? 'Saved' : 'Save'}
                onClick={(event) => {
                  event.stopPropagation()
                  onHeart()
                }}
              >
                <Heart
                  size={16}
                  strokeWidth={1.75}
                  fill={hearted ? 'currentColor' : 'none'}
                />
              </button>
            ) : null}
            {onTrash ? (
              <button
                type="button"
                className="icon-btn"
                aria-label="Remove"
                onClick={(event) => {
                  event.stopPropagation()
                  onTrash()
                }}
              >
                <Trash2 size={16} strokeWidth={1.75} />
              </button>
            ) : null}
          </div>
        )}
      </div>
    </article>
  )
}
