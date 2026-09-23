type IconProps = {
  size?: number
}

export function CameraIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="13" r="3.25" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8.5 6.75h1.2l.7-1.1h3.2l.7 1.1H15.5A2.75 2.75 0 0 1 18.25 9.5v7.25A2.75 2.75 0 0 1 15.5 19.5h-7A2.75 2.75 0 0 1 5.75 16.75V9.5A2.75 2.75 0 0 1 8.5 6.75Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  )
}

export function ChevronIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 6.5 15.5 12 9 17.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function BookmarkIcon({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7.25 4.75h9.5a.75.75 0 0 1 .75.75v13.2l-5.5-3.1-5.5 3.1V5.5a.75.75 0 0 1 .75-.75Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ProfileIcon({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8.25" r="2.75" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M6.5 18.25c.7-2.6 2.7-4 5.5-4s4.8 1.4 5.5 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
