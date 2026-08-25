import type { CSSProperties, ReactNode } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import {
  CHANNEL_ICONS,
  CHANNEL_ICON_CLASS,
  CHANNEL_LABELS,
  CONTACT_CHANNELS,
  isContactChannel,
  type ContactChannel
} from '../lib/channels'
import { EASE } from '../lib/motion'

interface Props {
  value: ContactChannel | null
  /**
   * Omit to render a static copy: no buttons, no focus stops. The drag overlay
   * uses that so a card in flight looks identical without being operable.
   */
  onChange?: (next: ContactChannel | null) => void
  /** `sm` sits on a card, `md` in the account panel. */
  size?: 'sm' | 'md'
}

/** Segment and icon box, in px. The thumb is offset by whole segments. */
const SIZES = {
  sm: { seg: 20, icon: 13 },
  md: { seg: 30, icon: 18 }
} as const

const PAD = 2
/** The track's own border. Widths are border-box, so it has to be counted or
 *  the row is clipped on the right and the padding looks lopsided. */
const BORDER = 1

/**
 * Pill-shaped channel picker: one segment per service, with a thumb that slides
 * to whichever is chosen. Single-select — a contact has one place you actually
 * reach them — and choosing the current segment again clears it, which Radix
 * gives us for free (a single-value ToggleGroup deselects to '').
 *
 * At rest it collapses to just the chosen mark and unfurls to the full row while
 * the card is hovered, so a board of set accounts reads as one logo per card
 * instead of five. An account with nothing chosen has nothing to collapse to, so
 * it stays open — that's also the one that still needs a decision.
 *
 * Built on shadcn's ToggleGroup, so focus roving, looping arrow keys and the
 * deselect are the primitive's, not ours. Note the keyboard model that comes
 * with it: arrows move focus, Space or Enter commits — a toggle group, not a
 * radio group where arrows select as they move.
 */
export function ChannelSlider({ value, onChange, size = 'sm' }: Props) {
  const { seg, icon } = SIZES[size]
  const active = value ? CONTACT_CHANNELS.indexOf(value) : -1

  const chrome = (PAD + BORDER) * 2
  const open = seg * CONTACT_CHANNELS.length + chrome
  const collapsed = active < 0 ? open : seg + chrome

  /**
   * Widths and the row offset are custom properties so the hover and focus
   * states can be plain utilities: a Tailwind variant can switch which var it
   * reads, but it can't switch an inline style.
   */
  const vars = {
    padding: PAD,
    '--pill': `${collapsed}px`,
    '--pill-open': `${open}px`,
    // Collapsed, the row slides so the chosen segment — not the first one —
    // is what the narrowed window shows.
    '--pill-shift': `${-Math.max(active, 0) * seg}px`
  } as CSSProperties

  // Hovering the pill itself unfurls it — not hovering the card, which would set
  // every pill in a swept column in motion.
  const shellClass = cn(
    'group/pill relative flex w-[var(--pill)] shrink-0 items-center overflow-hidden rounded-full',
    'border border-black/[0.07] bg-black/[0.05] dark:border-white/[0.09] dark:bg-white/[0.07]',
    'transition-[width]',
    EASE,
    'hover:w-[var(--pill-open)] focus-within:w-[var(--pill-open)]'
  )

  const rowClass = cn(
    'relative flex flex-none items-center translate-x-[var(--pill-shift)] transition-transform',
    EASE,
    'group-hover/pill:translate-x-0 group-focus-within/pill:translate-x-0'
  )

  const glyph = (channel: ContactChannel, selected: boolean) => (
    <img
      src={CHANNEL_ICONS[channel]}
      alt=""
      aria-hidden
      // Images drag natively, which would spawn a ghost mid-card-drag.
      draggable={false}
      // Sized by height, not by a square box: Gmail's mark is 4:3, so a square
      // box renders it a quarter shorter than the others and it reads as the
      // faint one in the row.
      style={{ height: icon, width: 'auto' }}
      className={cn(
        'transition-[opacity,filter] duration-150',
        selected ? 'opacity-100' : 'opacity-45 grayscale',
        CHANNEL_ICON_CLASS[channel]
      )}
    />
  )

  /* The slider knob. Hidden rather than absent when nothing is chosen, so the
     first pick slides in instead of popping into place. Light: a white knob on
     a dark track; dark: the reverse, or it reads as a hole in the card. */
  const thumb = (
    <span
      aria-hidden
      style={{
        width: seg,
        height: seg,
        transform: `translateX(${Math.max(active, 0) * seg}px)`,
        opacity: active < 0 ? 0 : 1
      }}
      className={cn(
        'pointer-events-none absolute left-0 top-0 rounded-full bg-[var(--color-raised)]',
        'shadow-[0_1px_3px_rgb(0_0_0/0.18)] ring-1 ring-black/5 transition-[transform,opacity]',
        EASE,
        'dark:bg-white/[0.22] dark:ring-white/20'
      )}
    />
  )

  const segments = (render: (channel: ContactChannel, i: number) => ReactNode) =>
    CONTACT_CHANNELS.map((channel, i) => render(channel, i))

  if (!onChange) {
    return (
      <div style={vars} className={cn(shellClass, 'pointer-events-none')}>
        <div className={rowClass}>
          {thumb}
          {segments((channel, i) => (
            <span
              key={channel}
              style={{ width: seg, height: seg }}
              className="relative flex items-center justify-center"
            >
              {glyph(channel, i === active)}
            </span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={vars} className={shellClass}>
      <ToggleGroup
        type="single"
        value={value ?? ''}
        onValueChange={(next) => onChange(isContactChannel(next) ? next : null)}
        aria-label="Reachable on"
        // pointerdown would arm the card's drag sensor, click would open its
        // panel, and Enter/Space on a segment would do the same.
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className={rowClass}
      >
        {thumb}
        {segments((channel, i) => {
          const selected = i === active
          const label = CHANNEL_LABELS[channel]
          return (
            <ToggleGroupItem
              key={channel}
              value={channel}
              aria-label={label}
              title={selected ? `${label} — choose again to clear` : `Reachable on ${label}`}
              style={{ width: seg, height: seg }}
              className={cn(
                // `relative` is load-bearing: ToggleGroupItem is statically
                // positioned, and an absolute thumb paints over static siblings —
                // the marks disappeared under a white disc without it.
                'relative',
                // The thumb is the only selection indicator, so the segment's own
                // hover and checked backgrounds are dropped. `!` on the radius
                // because ToggleGroupItem squares off its inner edges by default.
                'min-w-0 rounded-full! p-0 hover:bg-transparent data-[state=on]:bg-transparent',
                'focus-visible:outline-none',
                // Focus tints the segment — but never the chosen one, whose white
                // knob would go grey under it. Hovering previews in full colour.
                !selected &&
                  ' hover:[&>img]:opacity-100 hover:[&>img]:grayscale-0' +
                    ' focus-visible:bg-black/[0.12] dark:focus-visible:bg-white/[0.16]'
              )}
            >
              {glyph(channel, selected)}
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
    </div>
  )
}
