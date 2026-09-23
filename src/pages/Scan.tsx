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
      <header className="scan-header">
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => navigate('/home')}
        >
          Cancel
        </button>
        <h1>Scan barcode</h1>
        <span className="scan-header__spacer" />
      </header>

      <div className="scan-stage">
        <div id={READER_ID} className="scan-reader" />
        {!cameraError ? <div className="scan-reticle" aria-hidden="true" /> : null}
        <p className="scan-hint">
          {cameraError ?? 'Line up the barcode on the clothing tag'}
        </p>
      </div>

      <div className="scan-manual">
        {showManual ? (
          <form className="manual-form" onSubmit={handleManualSubmit}>
            <label htmlFor="manual-barcode">Barcode number</label>
            <input
              id="manual-barcode"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 8445305131204"
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value)}
            />
            <button
              type="submit"
              className="btn btn--primary btn--block"
              disabled={!isValidBarcode(manualCode)}
            >
              Find retailers
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={() => setShowManual(true)}
          >
            Type barcode instead
          </button>
        )}
      </div>
    </section>
  )
}
