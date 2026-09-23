import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Search } from 'lucide-react'

const READER_ID = 'barcode-reader'

function isValidBarcode(value: string) {
  return /^\d{8,14}$/.test(value.trim())
}

function isValidSearch(value: string) {
  const query = value.trim()
  return isValidBarcode(query) || query.length >= 2
}

export function Scan() {
  const navigate = useNavigate()
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const handledRef = useRef(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  function goToMatches(query: string) {
    if (handledRef.current) return
    handledRef.current = true
    navigate(`/matches/${encodeURIComponent(query.trim())}`)
  }

  useEffect(() => {
    let cancelled = false
    const scanner = new Html5Qrcode(READER_ID, {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
      ],
      verbose: false,
    })
    scannerRef.current = scanner

    function handleDecoded(decodedText: string) {
      void scanner
        .stop()
        .catch(() => undefined)
        .finally(() => {
          if (handledRef.current) return
          handledRef.current = true
          navigate(`/matches/${encodeURIComponent(decodedText.trim())}`)
        })
    }

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 140 } },
        handleDecoded,
        () => undefined,
      )
      .catch(() => {
        if (cancelled) return
        setCameraError('Camera unavailable. Search for the item instead.')
        setShowSearch(true)
      })

    return () => {
      cancelled = true
      if (scanner.isScanning) {
        void scanner.stop().catch(() => undefined)
      }
    }
  }, [navigate])

  useEffect(() => {
    if (!showSearch) return
    searchInputRef.current?.focus()
  }, [showSearch])

  function submitLookup(value: string) {
    const query = value.trim()
    if (!isValidSearch(query)) return
    const scanner = scannerRef.current
    if (scanner?.isScanning) {
      void scanner
        .stop()
        .catch(() => undefined)
        .finally(() => goToMatches(query))
      return
    }
    goToMatches(query)
  }

  function handleManualSubmit(event: FormEvent) {
    event.preventDefault()
    submitLookup(manualCode)
  }

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault()
    submitLookup(searchQuery)
  }

  return (
    <section className="page page--scan">
      <button
        type="button"
        className="scan-close"
        onClick={() => navigate('/home')}
        aria-label="Close"
      >
        ×
      </button>

      <button
        type="button"
        className={showSearch ? 'scan-search-btn is-open' : 'scan-search-btn'}
        aria-label={showSearch ? 'Hide search' : 'Search'}
        aria-expanded={showSearch}
        onClick={() => {
          setShowSearch((open) => !open)
          setShowManual(false)
        }}
      >
        <Search size={20} strokeWidth={1.75} />
      </button>

      <div className="scan-stage">
        <div id={READER_ID} className="scan-reader" />
      </div>

      {showSearch ? (
        <form className="scan-search-bar" onSubmit={handleSearchSubmit}>
          <input
            ref={searchInputRef}
            type="search"
            autoComplete="off"
            enterKeyHint="search"
            placeholder="Search product or barcode"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <button
            type="submit"
            className="scan-search-go"
            disabled={!isValidSearch(searchQuery)}
            aria-label="Look up"
          >
            <Search size={18} strokeWidth={1.75} />
          </button>
        </form>
      ) : null}

      {showManual ? (
        <form className="manual-sheet" onSubmit={handleManualSubmit}>
          <label htmlFor="manual-barcode">Barcode number</label>
          <input
            id="manual-barcode"
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 888409037816"
            value={manualCode}
            onChange={(event) => setManualCode(event.target.value)}
          />
          <button
            type="submit"
            className="btn btn--ink btn--block"
            disabled={!isValidBarcode(manualCode)}
          >
            Find retailers
          </button>
        </form>
      ) : null}

      <button
        type="button"
        className="shutter"
        aria-label={showManual ? 'Hide keypad' : 'Type barcode'}
        onClick={() => {
          setShowManual((open) => !open)
          setShowSearch(false)
        }}
      />

      {cameraError && !showSearch && !showManual ? (
        <p className="scan-note">{cameraError}</p>
      ) : null}
    </section>
  )
}
