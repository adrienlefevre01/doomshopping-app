import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

type CollapsibleCardProps = {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}

export function CollapsibleCard({
  title,
  defaultOpen = false,
  children,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="review-panel">
      <button
        type="button"
        className="review-panel__head"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="review-panel__title">{title}</span>
        <ChevronDown
          className={open ? 'review-panel__caret is-open' : 'review-panel__caret'}
          size={18}
          strokeWidth={1.75}
        />
      </button>
      {open ? <div className="review-panel__body">{children}</div> : null}
    </section>
  )
}
