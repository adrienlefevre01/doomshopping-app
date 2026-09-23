import { useNavigate } from 'react-router-dom'
import { BookmarkIcon, ProfileIcon } from './Icons'

type BottomNavProps = {
  active: 'wishlist' | 'profile'
}

export function BottomNav({ active }: BottomNavProps) {
  const navigate = useNavigate()

  return (
    <nav className="dock" aria-label="Main">
      <button
        type="button"
        className={active === 'wishlist' ? 'dock__btn is-active' : 'dock__btn'}
        aria-label="Wishlist"
        onClick={() => navigate('/home')}
      >
        <BookmarkIcon />
      </button>
      <button
        type="button"
        className={active === 'profile' ? 'dock__btn is-active' : 'dock__btn'}
        aria-label="Profile"
        onClick={() => navigate('/profile')}
      >
        <ProfileIcon />
      </button>
    </nav>
  )
}
