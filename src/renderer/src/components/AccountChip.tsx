import { useRef, useState } from 'react'
import { logoUrl } from '../lib/logos'
import { monogram } from '../lib/format'

interface Props {
  orgId: string
  orgName: string
  /**
   * The account's website, which is what the logo is looked up by. Optional so
   * a caller that genuinely has no account record still renders a monogram
   * rather than failing to compile.
   */
  domain?: string | null
  /** When provided the tile becomes an interactive button that reports its own rect. */
  onClick?: (rect: DOMRect) => void
  /** Tooltip + aria-label prefix for the interactive form. Ignored when static. */
  label?: string
  /** `sm` for dense rows (select options); `md` is the card tile. */
  size?: 'sm' | 'md'
}

/**
 * The account tile: the org's own mark when logo.dev has one, its monogram when
 * it doesn't. Shared by every card that names an account, so the white-tile
 * invariant below only has to hold in one place.
 */
export function AccountChip({ orgId, orgName, domain, onClick, label, size = 'md' }: Props) {
  const ref = useRef<HTMLButtonElement>(null)

  /*
   * Which URL 404'd, rather than a boolean "it failed". The chip is rendered
   * inside sortable lists, so React reuses the same instance for a different
   * account as cards move — a boolean would follow the instance and blank out
   * the logo of whichever account landed there next. Comparing against the
   * current URL means the state corrects itself the moment the account changes,
   * with no effect to keep in step.
   */
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const src = logoUrl(orgId, domain)
  const logo = src && src !== failedSrc ? src : null

  const box =
    size === 'sm' ? 'h-4 w-4 text-[8px]' : 'mt-0.5 h-6 w-6 text-[10px]'

  const classes =
    `${box} flex shrink-0 items-center justify-center overflow-hidden rounded border ` +
    'border-[var(--color-line)] ' +
    // About half of these marks arrive as PNGs with real transparency, and a
    // fair few are dark glyphs. A white tile in both themes is the only backdrop
    // that keeps all of them legible — which is also why the request asks for
    // `theme=light`.
    (logo
      ? 'bg-white'
      : 'bg-[var(--color-surface)] font-mono font-semibold text-[var(--color-ink-muted)]')

  const face = logo ? (
    <img
      src={logo}
      alt=""
      aria-hidden
      draggable={false}
      // A 404 from logo.dev is the normal "no mark for this company" answer, so
      // this is the monogram path rather than an error path.
      onError={() => setFailedSrc(logo)}
      className="h-full w-full object-contain"
    />
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
