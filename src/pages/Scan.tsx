import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

const READER_ID = 'barcode-reader'

function isValidBarcode(value: string) {
  return /^\d{8,14}$/.test(value.trim())
}

export function Scan() {
  const navigate = useNavigate()
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const handledRef = useRef(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [showManual, setShowManual] = useState(false)

  function goToMatches(barcode: string) {
    if (handledRef.current) return
    handledRef.current = true
    navigate(`/matches/${encodeURIComponent(barcode.trim())}`)
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
        setCameraError('Camera unavailable. Type the barcode instead.')
        setShowManual(true)
      })

    return () => {
      cancelled = true
      if (scanner.isScanning) {
        void scanner.stop().catch(() => undefined)
      }
    }
  }, [navigate])

  function handleManualSubmit(event: FormEvent) {
    event.preventDefault()
    const value = manualCode.trim()
    if (!isValidBarcode(value)) return
    const scanner = scannerRef.current
    if (scanner?.isScanning) {
      void scanner
        .stop()
        .catch(() => undefined)
        .finally(() => goToMatches(value))
      return
    }
    goToMatches(value)
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

      <div className="scan-stage">
        <div id={READER_ID} className="scan-reader" />
      </div>

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
        onClick={() => setShowManual((open) => !open)}
      />

      {cameraError && !showManual ? <p className="scan-note">{cameraError}</p> : null}
    </section>
  )
}
