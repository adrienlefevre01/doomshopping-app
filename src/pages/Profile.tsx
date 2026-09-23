import { BottomNav } from '../components/BottomNav'
import { getWishlist } from '../lib/wishlist'

export function Profile() {
  const count = getWishlist().length

  return (
    <section className="page page--profile">
      <div className="profile-card">
        <div className="profile-card__avatar" aria-hidden="true">
          You
        </div>
        <h1>Profile</h1>
        <p>
          {count === 1 ? '1 saved item' : `${count} saved items`} on this device.
        </p>
      </div>
      <BottomNav active="profile" />
    </section>
  )
}
