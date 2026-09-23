import { Bookmark, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

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
        <Bookmark size={20} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className={active === 'profile' ? 'dock__btn is-active' : 'dock__btn'}
        aria-label="Profile"
        onClick={() => navigate('/profile')}
      >
        <User size={20} strokeWidth={1.75} />
      </button>
    </nav>
  )
}
