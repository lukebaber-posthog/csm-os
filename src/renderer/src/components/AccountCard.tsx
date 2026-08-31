import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card } from '../hooks/useBoard'
import { useLandingWiden } from '../hooks/useCardDrag'
import { STALE_AFTER_DAYS } from '../lib/layouts'
import { cardSurfaceStyle, type CardColor } from '../lib/colors'
import type { ContactChannel } from '../lib/channels'
import { cn } from '@/lib/utils'
import { arr, arrExact, contactAge, daysSince } from '../lib/format'
import { AccountChip } from './AccountChip'
import { CardColorToolbar } from './CardColorToolbar'
import { ChannelSlider } from './ChannelSlider'

interface Props {
  card: Card
  onOpen: (orgId: string) => void
  onSetColor: (orgId: string, color: CardColor | null) => void
  onSetChannel: (orgId: string, channel: ContactChannel | null) => void
  /** True for the moment after this card is dropped, so it widens into its slot. */
  landed: boolean
}

/** Presentational card body, shared by the sortable card and the drag overlay. */
export function CardFace({
  card,
  dragging = false,
  onChipClick,
  onSetChannel
}: {
  card: Card
  dragging?: boolean
  /** When provided the colour chip becomes an interactive button. */
  onChipClick?: (rect: DOMRect) => void
  /** When provided the channel pill becomes operable. */
  onSetChannel?: (channel: ContactChannel | null) => void
}) {
  const age = daysSince(card.lastTouchedAt)
  const stale = age === null || age >= STALE_AFTER_DAYS

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
        <AccountChip
          orgId={card.account.orgId}
          orgName={card.account.orgName}
          domain={card.account.domain}
          onClick={onChipClick}
          label={`Change colour for ${card.account.orgName}`}
        />

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

          {/* The pill sits inline with the contact age, absolutely positioned at
              the right so unfurling it overlays the text instead of reflowing
              the row. `min-h` reserves the pill's height, since an absolute
              element contributes none. */}
          <div className="relative mt-1.5 flex min-h-[26px] items-center gap-1.5 pr-8">
            {/* First in the DOM so the age can react to its hover: Tailwind's
                `peer` only reaches *later* siblings. Position is unaffected — the
                pill is absolute either way. */}
            <span className="peer/pill absolute right-0 top-1/2 -translate-y-1/2">
              <ChannelSlider value={card.channel} onChange={onSetChannel} />
            </span>

            {/* The age steps aside while the pill is open. The track is
                translucent, so without this the text would read through it. */}
            <span
              aria-hidden
              className={
                'h-1.5 w-1.5 shrink-0 rounded-full transition-opacity ' +
                'peer-hover/pill:opacity-0 peer-focus-within/pill:opacity-0 ' +
                (stale
                  ? 'bg-[var(--color-ink)]'
                  : 'border border-[var(--color-ink-faint)] bg-transparent')
              }
            />
            <span
              className={
                'truncate text-[11px] leading-none transition-opacity ' +
                'peer-hover/pill:opacity-0 peer-focus-within/pill:opacity-0 ' +
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

export function AccountCard({ card, onOpen, onSetColor, onSetChannel, landed }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.account.orgId,
    // Lets the board tell a card drag apart from a column drag.
    data: { type: 'card' }
  })
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  // The landing half of the shared pickup effect; the to-do board's cards use the
  // same hook. The scope has to sit on a wrapper OUTSIDE the sortable node —
  // dnd-kit writes its drag transform to that node's own inline style.
  const scope = useLandingWiden(landed)

  return (
    <>
      <div ref={scope}>
        <div
          ref={setNodeRef}
          style={{ transform: CSS.Translate.toString(transform), transition }}
          // The board measures this at drag start to work out where the pointer
          // grabbed the card. Same attribute name on both boards, because
          // `useCardDrag` does the measuring for both.
          data-drag-id={card.account.orgId}
          // cursor-pointer sits here rather than on CardFace so it doesn't fight
          // the drag overlay's cursor-grabbing. The original slot stays in place
          // but goes blank while the overlay drags.
          className={cn('cursor-pointer', isDragging && 'opacity-0')}
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
            onSetChannel={(channel) => onSetChannel(card.account.orgId, channel)}
          />
        </div>
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
