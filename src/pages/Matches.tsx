import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronIcon } from '../components/Icons'
import { ProductCard } from '../components/ProductCard'
import { lookupProduct } from '../lib/lookup'
import { addWishlistItem } from '../lib/wishlist'
import type { LookupResult, RetailerMatch } from '../types'

type LookupError = {
  barcode: string
  message: string
}

export function Matches() {
  const { barcode = '' } = useParams()
  const navigate = useNavigate()
  const [result, setResult] = useState<LookupResult | null>(null)
  const [lookupError, setLookupError] = useState<LookupError | null>(null)

  useEffect(() => {
    let cancelled = false

    lookupProduct(barcode)
      .then((next) => {
        if (cancelled) return
        if (next.candidates.length === 0) {
          setResult(null)
          setLookupError({
            barcode,
            message: 'No retailer listings found for this barcode.',
          })
          return
        }
        setResult(next)
        setLookupError(null)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setResult(null)
        setLookupError({
          barcode,
          message:
            error instanceof Error
              ? error.message
              : 'Could not find retailer links for this barcode.',
        })
      })

    return () => {
      cancelled = true
    }
  }, [barcode])

  const error = lookupError?.barcode === barcode ? lookupError.message : null
  const loading = result?.barcode !== barcode && lookupError?.barcode !== barcode

  function handleSave(match: RetailerMatch) {
    addWishlistItem(barcode, match)
    navigate('/home', { replace: true })
  }

  return (
    <section className="page page--matches">
      <header className="sheet-header">
        <button
          type="button"
          className="back-btn"
          onClick={() => navigate('/home')}
          aria-label="Back"
        >
          <ChevronIcon />
        </button>
        <div>
          <p className="muted">Barcode {barcode}</p>
          <h1>Choose a listing</h1>
        </div>
      </header>

      {loading ? (
        <div className="status-block">
          <div className="spinner" aria-hidden="true" />
          <p className="muted">Finding retailer links…</p>
        </div>
      ) : null}

      {error ? <p className="status-block status-block--error">{error}</p> : null}

      {!loading && result ? (
        <ul className="product-list">
          {result.candidates.map((item) => (
            <li key={`${item.retailer}-${item.productUrl}`}>
              <ProductCard
                item={item}
                actionLabel="Save"
                onAction={() => handleSave(item)}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
