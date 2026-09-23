import { useNavigate } from 'react-router-dom'
import { setOnboarded } from '../lib/wishlist'

export function Welcome() {
  const navigate = useNavigate()

  function handleStart() {
    setOnboarded()
    navigate('/home', { replace: true })
  }

  return (
    <section className="page page--welcome">
      <div className="welcome__mark">D</div>
      <div className="welcome__copy">
        <p className="eyebrow">In-store, on your phone</p>
        <h1>Doomshopping</h1>
        <p className="lede">
          Scan barcodes on clothes while you browse the racks. We find retailer
          links so you can save the piece to your wishlist.
        </p>
      </div>
      <button type="button" className="btn btn--primary btn--block" onClick={handleStart}>
        Get Started
      </button>
    </section>
  )
}
