import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import {
  SEGMENTED_INK,
  SEGMENTED_ITEM,
  SEGMENTED_THUMB,
  SEGMENTED_TRACK
} from '../lib/segmented'
import { MAIN_VIEWS, VIEW_LABELS, type MainView } from '../lib/views'

interface Props {
  value: MainView
  onChange: (next: MainView) => void
}

/**
 * Two-segment sliding pill in the top bar: accounts board or to-do board. Track
 * and knob come from `lib/segmented`, shared with the to-do composer's
 * `KindSlider`, so every pill in the app reads as the same control.
 *
 * Hand-rolled `role="tablist"` rather than shadcn's `ToggleGroup`, which is what
 * ChannelSlider uses, for two reasons:
 *   - Keyboard model. ToggleGroup gives arrows-move-focus / Space-commits, and
 *     ChannelSlider *wants* that: every commit there writes a row to Supabase, so
 *     arrowing across five channels must not fire five writes. Switching views
 *     writes nothing and is instantly reversible, so this uses the WAI-ARIA
 *     **automatic activation** tabs pattern instead — arrows, Home and End select
 *     as they move, one keystroke per switch.
 *   - A `type="single"` ToggleGroup deselects when you press the active item
 *     again. There is no "no view selected" state to fall into, so here that
 *     behaviour would be a bug, not a feature.
 */
export function ViewSlider({ value, onChange }: Props) {
  const active = MAIN_VIEWS.indexOf(value)

  /**
   * Focus has to follow selection: the tabs use a roving tabIndex, so if focus
   * stayed on the button we just moved *off*, that button is now `tabIndex={-1}`
   * — the next arrow press goes nowhere and Tab leaves the control entirely.
   */
  const tabs = useRef(new Map<MainView, HTMLButtonElement>())

  const select = (next: MainView) => {
    tabs.current.get(next)?.focus()
    // Re-pressing the active tab is a no-op, not a deselect (see doc comment).
    if (next !== value) onChange(next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = MAIN_VIEWS.length - 1
    // Left/Right only, no Up/Down: the tablist declares itself horizontal, and
    // Up/Down have to stay with the board scroller underneath.
    const to =
      e.key === 'ArrowRight'
        ? // Wraps. With two segments a non-wrapping arrow at either end is a dead
          // key, so wrapping makes both arrows a plain toggle.
          (active + 1) % MAIN_VIEWS.length
        : e.key === 'ArrowLeft'
          ? (active + last) % MAIN_VIEWS.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : -1
    if (to < 0) return
    // Home and End would otherwise jump the board to its top or bottom.
    e.preventDefault()
    select(MAIN_VIEWS[to])
  }

  return (
    // The padded track. The thumb is deliberately *not* parented here: an
    // absolutely positioned child sizes its percentage width against its
    // containing block's padding box, so `w-1/2` on this element would be half of
    // (track − borders) — ~3px too wide and ~2px too far left. Same border-box
    // trap the README documents for ChannelSlider's collapsed row.
    <div className={SEGMENTED_TRACK}>
      {/* Equal halves from the grid, not from measured label widths. "Accounts"
          is ~58px and "To-dos" ~44px at 12px/600, so equal cells hand the shorter
          label ~7px more side padding — invisible, because the only visible edge
          is the thumb itself. That's what macOS segmented controls do, and it
          dodges a real bug: `--font-sans` starts at `ui-sans-serif` and may
          resolve to SF Pro or Inter, so a useLayoutEffect measurement taken
          before the webfont settles leaves the thumb 2-4px off until some
          unrelated re-render fixes it. Revisit only if a label ends up more than
          roughly 30% wider than its siblings; then `grid-cols-2` and the thumb's
          `w-1/2` both need rethinking. */}
      <div
        role="tablist"
        aria-label="Board"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="relative grid grid-cols-2"
      >
        <span
          aria-hidden
          // Percentages in a transform resolve against the element's own box, so
          // 100% is exactly one thumb — one cell — of travel.
          style={{ transform: `translateX(${active * 100}%)` }}
          className={cn(SEGMENTED_THUMB, 'w-1/2')}
        />

        {MAIN_VIEWS.map((view, i) => {
          const selected = i === active
          return (
            <button
              key={view}
              // Cleared on unmount, not just filled on mount: a stale node left
              // in the map is one `select()` would try to focus after a swap.
              ref={(el) => {
                if (el) tabs.current.set(view, el)
                else tabs.current.delete(view)
              }}
              type="button"
              role="tab"
              id={`view-tab-${view}`}
              aria-controls="view-panel"
              aria-selected={selected}
              // Roving tabIndex: the control is one Tab stop, arrows move inside.
              tabIndex={selected ? 0 : -1}
              onClick={() => select(view)}
              className={cn(
                SEGMENTED_ITEM,
                'px-3 py-1 text-[12px]',
                selected ? SEGMENTED_INK.on : SEGMENTED_INK.off
              )}
            >
              {VIEW_LABELS[view]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
