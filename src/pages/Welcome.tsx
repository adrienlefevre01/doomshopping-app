import { useNavigate } from 'react-router-dom'
import { setOnboarded } from '../lib/wishlist'

const MANIFESTO = [
  'Doomshopping',
  'Mindless consumerism',
  'Overpaying',
  'Impulse purchases',
]

export function Welcome() {
  const navigate = useNavigate()

  function handleStart() {
    setOnboarded()
    navigate('/home', { replace: true })
  }

  return (
    <section className="page page--welcome">
      <h1 className="welcome__hero">NO MORE</h1>
      <div className="welcome__body">
        <p className="welcome__kicker">NO MORE</p>
        <ul className="welcome__list">
          {MANIFESTO.map((item) => (
            <li key={item}>
              <s>{item}</s>
            </li>
          ))}
        </ul>
      </div>
      <button type="button" className="btn btn--ink btn--block" onClick={handleStart}>
        Get started
      </button>
    </section>
  )
}
