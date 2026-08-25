import { useRef } from 'react'
import { ACCOUNT_LOGOS } from '../lib/logos'
import { monogram } from '../lib/format'

interface Props {
  orgId: string
  orgName: string
  /** When provided the tile becomes an interactive button that reports its own rect. */
  onClick?: (rect: DOMRect) => void
  /** Tooltip + aria-label prefix for the interactive form. Ignored when static. */
  label?: string
  /** `sm` for dense rows (select options); `md` is the card tile. */
  size?: 'sm' | 'md'
}

/**
 * The account tile: the org's own mark when we scraped one, its monogram
 * when we didn't. Shared by every card that names an account, so the white-tile
 * invariant below only has to hold in one place.
 */
export function AccountChip({ orgId, orgName, onClick, label, size = 'md' }: Props) {
  const ref = useRef<HTMLButtonElement>(null)

  // The account's own logo when it was scraped, the monogram when it wasn't.
  const logo = ACCOUNT_LOGOS[orgId]

  const box =
    size === 'sm' ? 'h-4 w-4 text-[8px]' : 'mt-0.5 h-6 w-6 text-[10px]'

  const classes =
    `${box} flex shrink-0 items-center justify-center overflow-hidden rounded border ` +
    'border-[var(--color-line)] ' +
    // Every one of these marks is a favicon or touch icon, so it was drawn for a
    // light background — several are dark glyphs on transparency. A white tile
    // in both themes is the only backdrop that keeps all of them legible.
    (logo
      ? 'bg-white'
      : 'bg-[var(--color-surface)] font-mono font-semibold text-[var(--color-ink-muted)]')

  const face = logo ? (
    <img src={logo} alt="" aria-hidden draggable={false} className="h-full w-full object-contain" />
  ) : (
    monogram(orgName)
  )

  if (!onClick) {
    return (
      <span aria-hidden className={classes}>
        {face}
      </span>
    )
  }

  return (
    <button
      ref={ref}
      type="button"
      // CardColorToolbar's dismiss handler skips anything inside this attribute,
      // so the button that opened it doesn't reopen from its own toggle.
      data-color-chip
      title={label}
      aria-label={label}
      // Keep both the drag sensor and the card's own click handler out of
      // this: pointerdown would start a drag, click would open the panel.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        const rect = ref.current?.getBoundingClientRect()
        if (rect) onClick(rect)
      }}
      className={
        classes +
        ' cursor-pointer transition-shadow hover:ring-2 hover:ring-[var(--color-line-strong)] ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)]'
      }
    >
      {face}
    </button>
  )
}
