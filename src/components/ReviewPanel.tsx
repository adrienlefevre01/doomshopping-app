import { BookOpen } from 'lucide-react'
import type { ReviewClaim, ReviewSource } from '../types'
import { CollapsibleCard } from './CollapsibleCard'

type ReviewPanelProps = {
  title: string
  loading: boolean
  claims: ReviewClaim[]
  sources: ReviewSource[]
}

function sourceNumbers(sources: ReviewSource[]) {
  return new Map(sources.map((source, index) => [source.id, index + 1]))
}

export function ReviewPanel({ title, loading, claims, sources }: ReviewPanelProps) {
  if (loading && !claims.length && !sources.length) {
    return (
      <CollapsibleCard title={title} defaultOpen>
        <p className="muted">Looking this up…</p>
      </CollapsibleCard>
    )
  }

  if (!claims.length && !sources.length) return null

  const numbers = sourceNumbers(sources)

  return (
    <CollapsibleCard title={title} defaultOpen>
      {claims.length ? (
        <div className="review-panel__claims">
          {claims.map((claim) => (
            <p key={claim.text}>
              {claim.text}
              {claim.sourceIds.map((id) =>
                numbers.has(id) ? (
                  <sup key={id} className="review-panel__ref">
                    {numbers.get(id)}
                  </sup>
                ) : null,
              )}
            </p>
          ))}
        </div>
      ) : null}
      {sources.length ? (
        <div className="review-panel__sources">
          {sources.map((source, index) => {
            const inner = (
              <>
                <div className="review-panel__art">
                  {source.thumbnailUrl ? <img src={source.thumbnailUrl} alt="" /> : null}
                  <span>{index + 1}</span>
                </div>
                <div>
                  <p className="review-panel__source-title">{source.title}</p>
                  <p className="muted">
                    <BookOpen size={12} strokeWidth={1.75} />
                    {source.source} · {Math.max(source.minutes, 1)} min read
                  </p>
                </div>
              </>
            )
            return source.url ? (
              <a
                key={source.id}
                className="review-panel__source"
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {inner}
              </a>
            ) : (
              <article key={source.id} className="review-panel__source">
                {inner}
              </article>
            )
          })}
        </div>
      ) : null}
    </CollapsibleCard>
  )
}
