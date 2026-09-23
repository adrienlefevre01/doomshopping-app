import type { RetailerMatch } from '../types'

type ProductCardProps = {
  item: RetailerMatch
  actionLabel?: string
  onAction?: () => void
  onClick?: () => void
  secondaryLabel?: string
  onSecondary?: () => void
}

export function ProductCard({
  item,
  actionLabel,
  onAction,
  onClick,
  secondaryLabel,
  onSecondary,
}: ProductCardProps) {
  return (
    <article
      className={onClick ? 'product-card product-card--clickable' : 'product-card'}
      onClick={onClick}
    >
      <div className="product-card__image">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" />
        ) : (
          <div className="product-card__placeholder" />
        )}
      </div>
      <div className="product-card__body">
        <p className="product-card__retailer">{item.retailer}</p>
        <h3 className="product-card__title">{item.title}</h3>
        {item.brand ? <p className="product-card__brand">{item.brand}</p> : null}
        {item.price ? <p className="product-card__price">{item.price}</p> : null}
        {(actionLabel || secondaryLabel) && (
          <div className="product-card__actions">
            {actionLabel && onAction ? (
              <button
                type="button"
                className="btn btn--ink btn--small"
                onClick={(event) => {
                  event.stopPropagation()
                  onAction()
                }}
              >
                {actionLabel}
              </button>
            ) : null}
            {secondaryLabel && onSecondary ? (
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={(event) => {
                  event.stopPropagation()
                  onSecondary()
                }}
              >
                {secondaryLabel}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </article>
  )
}
