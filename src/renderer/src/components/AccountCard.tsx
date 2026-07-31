import { useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card } from '../hooks/useBoard'
import { STALE_AFTER_DAYS } from '../lib/layouts'
import { cardSurfaceStyle, type CardColor } from '../lib/colors'
import { arr, arrExact, contactAge, daysSince, monogram } from '../lib/format'
import { CardColorToolbar } from './CardColorToolbar'

interface Props {
  card: Card
  onOpen: (orgId: string) => void
  onSetColor: (orgId: string, color: CardColor | null) => void
}

/** Presentational card body, shared by the sortable card and the drag overlay. */
export function CardFace({
  card,
  dragging = false,
  onChipClick
}: {
  card: Card
  dragging?: boolean
  /** When provided the colour chip becomes an interactive button. */
  onChipClick?: (rect: DOMRect) => void
}) {
  const age = daysSince(card.lastTouchedAt)
  const stale = age === null || age >= STALE_AFTER_DAYS
  const chipRef = useRef<HTMLButtonElement>(null)

  const chipClasses =
    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border ' +
    'border-[var(--color-line)] bg-[var(--color-surface)] font-mono text-[10px] ' +
    'font-semibold text-[var(--color-ink-muted)]'

  return (
    <div
      // Background, border, and shadow all come from cardSurfaceStyle; the
      // classes here only supply the monochrome defaults it may override.
      className={
        'group rounded-lg border bg-[var(--color-raised)] px-3 py-2.5 text-left transition-shadow ' +
        (dragging
          ? 'border-[var(--color-ink)]'
          : 'border-[var(--color-line)] hover:border-[var(--color-line-strong)]')
      }
      style={cardSurfaceStyle(card.color, dragging)}
    >
      <div className="flex items-start gap-2.5">
        {onChipClick ? (
          <button
            ref={chipRef}
            type="button"
            data-color-chip
            title="Change colour"
            aria-label={`Change colour for ${card.account.orgName}`}
            // Keep both the drag sensor and the card's own click handler out of
            // this: pointerdown would start a drag, click would open the panel.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              const rect = chipRef.current?.getBoundingClientRect()
              if (rect) onChipClick(rect)
            }}
            className={
              chipClasses +
              ' cursor-pointer transition-shadow hover:ring-2 hover:ring-[var(--color-line-strong)] ' +
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)]'
            }
          >
            {monogram(card.account.orgName)}
          </button>
        ) : (
          <span aria-hidden className={chipClasses}>
            {monogram(card.account.orgName)}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className="truncate text-[13px] font-semibold leading-tight tracking-tight"
              title={card.account.orgName}
            >
              {card.account.orgName}
            </span>
            <span
              className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--color-ink-muted)]"
              title={arrExact(card.account.arr)}
            >
              {arr(card.account.arr)}
            </span>
          </div>

          <div className="mt-1.5 flex items-center gap-1.5">
            <span
              aria-hidden
              className={
                'h-1.5 w-1.5 shrink-0 rounded-full ' +
                (stale
                  ? 'bg-[var(--color-ink)]'
                  : 'border border-[var(--color-ink-faint)] bg-transparent')
              }
            />
            <span
              className={
                'text-[11px] leading-none ' +
                (stale ? 'font-medium text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]')
              }
            >
              {contactAge(card.lastTouchedAt)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function AccountCard({ card, onOpen, onSetColor }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.account.orgId,
    // Lets the board tell a card drag apart from a column drag.
    data: { type: 'card' }
  })
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  return (
    <>
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform), transition }}
        // The original slot stays in place but goes blank while the overlay drags.
        className={isDragging ? 'opacity-0' : undefined}
        {...attributes}
        {...listeners}
        role="button"
        tabIndex={0}
        onClick={() => onOpen(card.account.orgId)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen(card.account.orgId)
          }
        }}
        aria-label={`${card.account.orgName}, ${contactAge(card.lastTouchedAt)}`}
      >
        <CardFace
          card={card}
          onChipClick={(rect) => setAnchor((open) => (open ? null : rect))}
        />
      </div>

      {anchor && (
        <CardColorToolbar
          anchor={anchor}
          value={card.color}
          onSelect={(color) => onSetColor(card.account.orgId, color)}
          onClose={() => setAnchor(null)}
        />
      )}
    </>
  )
}
