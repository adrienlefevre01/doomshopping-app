import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import { CollapsibleCard } from '../components/CollapsibleCard'
import { ReviewPanel } from '../components/ReviewPanel'
import { fetchBrandProfile, fetchProductReviews } from '../lib/research'
import { findSavedItem, updateSavedItem } from '../lib/wishlist'
import type { BrandProfile, ReviewClaim, ReviewSource, WishlistItem } from '../types'

function formatSavedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function ProductDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [item, setItem] = useState<WishlistItem | undefined>(() => findSavedItem(id))
  const [reviewsBusy, setReviewsBusy] = useState(false)
  const [brandBusy, setBrandBusy] = useState(false)

  useEffect(() => {
    const saved = findSavedItem(id)
    setItem(saved)
    if (!saved) return

    let cancelled = false

    if (!saved.reviewsLoaded) {
      setReviewsBusy(true)
      void fetchProductReviews(saved)
        .then((result) => {
          if (cancelled) return
          const next = updateSavedItem(saved.id, {
            reviews: result.reviews,
            reviewClaims: result.reviewClaims,
            reviewsLoaded: true,
          })
          if (next) setItem(next)
        })
        .catch(() => {
          if (cancelled) return
          const next = updateSavedItem(saved.id, {
            reviews: [],
            reviewClaims: [],
            reviewsLoaded: true,
          })
          if (next) setItem(next)
        })
        .finally(() => {
          if (!cancelled) setReviewsBusy(false)
        })
    }

    if (!saved.brandLoaded && saved.brand) {
      setBrandBusy(true)
      void fetchBrandProfile(saved)
        .then((result) => {
          if (cancelled) return
          const next = updateSavedItem(saved.id, {
            brandProfile: result.brandProfile,
            brandLoaded: true,
          })
          if (next) setItem(next)
        })
        .catch(() => {
          if (cancelled) return
          const next = updateSavedItem(saved.id, { brandLoaded: true })
          if (next) setItem(next)
        })
        .finally(() => {
          if (!cancelled) setBrandBusy(false)
        })
    }

    return () => {
      cancelled = true
    }
  }, [id])

  if (!item) return <Navigate to="/home" replace />

  const facts = [
    item.brand ? { label: 'Brand', value: item.brand } : null,
    item.color ? { label: 'Color', value: item.color } : null,
    item.availability ? { label: 'Availability', value: item.availability } : null,
    item.barcode ? { label: 'Barcode', value: item.barcode } : null,
    { label: 'Saved', value: formatSavedAt(item.savedAt) },
    { label: 'Source', value: item.retailer },
  ].filter((row): row is { label: string; value: string } => Boolean(row))

  const reviewClaims: ReviewClaim[] = item.reviewClaims ?? []
  const reviews: ReviewSource[] = item.reviews ?? []
  const brandProfile: BrandProfile | undefined = item.brandProfile
  const brandClaims = brandProfile?.claims ?? []
  const brandSources = brandProfile?.sources ?? []

  return (
    <section className="page page--product">
      <div className="product-hero">
        <button
          type="button"
          className="product-hero__back"
          onClick={() => navigate('/home')}
          aria-label="Back"
        >
          <ChevronLeft size={22} strokeWidth={1.75} />
        </button>
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.title} />
        ) : (
          <div className="product-hero__placeholder" aria-hidden="true" />
        )}
      </div>

      <div className="product-detail">
        <p className="muted">{item.retailer}</p>
        <h1>{item.title}</h1>
        {item.price ? <p className="product-detail__price">{item.price}</p> : null}

        {item.description ? (
          <p className="product-detail__copy">{item.description}</p>
        ) : null}

        <div className="product-detail__cards">
          {item.details?.length || facts.length ? (
            <CollapsibleCard title="Details">
              {item.details?.length ? (
                <ul className="product-detail__facts">
                  {item.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              ) : null}
              <dl className="product-detail__meta">
                {facts.map((row) => (
                  <div key={row.label} className="product-detail__row">
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </CollapsibleCard>
          ) : null}

          <ReviewPanel
            title="Product review"
            loading={reviewsBusy}
            claims={reviewClaims}
            sources={reviews.filter((review) => review.scope !== 'brand')}
          />

          <ReviewPanel
            title="About the brand"
            loading={brandBusy}
            claims={brandClaims}
            sources={brandSources}
          />
        </div>

        <a
          className="btn btn--ink btn--block product-detail__link"
          href={item.productUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>View on {item.retailer}</span>
          <ExternalLink size={16} strokeWidth={1.75} />
        </a>
      </div>
    </section>
  )
}
