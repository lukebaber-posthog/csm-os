import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CARD_COLORS, LABELS, accentOf, type CardColor } from '../lib/colors'

interface Props {
  /** Screen rect of the chip that opened this, used to position the popover. */
  anchor: DOMRect
  value: CardColor | null
  onSelect: (color: CardColor | null) => void
  onClose: () => void
}

const GAP = 6

/**
 * Floating colour picker. Rendered in a portal because the column it sits in
 * scrolls and would otherwise clip it.
 */
export function CardColorToolbar({ anchor, value, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: anchor.bottom + GAP, left: anchor.left })

  // Clamp into the viewport after measuring, so a card near an edge still
  // shows the whole toolbar.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    let left = anchor.left
    let top = anchor.bottom + GAP
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8
    if (left < 8) left = 8
    if (top + height > window.innerHeight - 8) top = anchor.top - height - GAP
    setPos({ top, left })
  }, [anchor])

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (ref.current?.contains(target as Node)) return
      // The chip that opened this handles its own toggle; closing here too
      // would make it reopen immediately.
      if (target?.closest?.('[data-color-chip]')) return
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    // Capture phase: the card underneath also listens for pointerdown to drag.
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [onClose])

  const swatch = (color: CardColor | null) => {
    const selected = value === color
    const label = color ? LABELS[color] : 'No colour'
    return (
      <button
        key={color ?? 'none'}
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={selected}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(color)
          onClose()
        }}
        className={
          'flex h-6 w-6 items-center justify-center rounded-full transition-transform hover:scale-110 ' +
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)] ' +
          (selected ? 'ring-2 ring-[var(--color-ink)] ring-offset-2 ring-offset-[var(--color-raised)]' : '')
        }
      >
        <span
          aria-hidden
          className={
            'h-4 w-4 rounded-full ' +
            (color ? '' : 'border border-dashed border-[var(--color-ink-faint)]')
          }
          style={color ? { backgroundColor: accentOf(color) } : undefined}
        />
      </button>
    )
  }

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Card colour"
      // Only the resolved position stays inline; it is computed per card.
      style={{ top: pos.top, left: pos.left }}
      // Stop drag sensors on the card underneath from seeing these events.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-[60] flex w-[232px] items-center gap-1.5 rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-raised)] px-2.5 py-2 shadow-xl"
    >
      {swatch(null)}
      <span aria-hidden className="mx-0.5 h-5 w-px bg-[var(--color-line)]" />
      {CARD_COLORS.map((c) => swatch(c))}
    </div>,
    document.body
  )
}
