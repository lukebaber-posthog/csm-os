import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Building2, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SEGMENTED_INK, SEGMENTED_ITEM, SEGMENTED_THUMB, SEGMENTED_TRACK } from '../lib/segmented'
import { KIND_LABELS, KIND_TITLES, TODO_KINDS, type TodoKind } from '../lib/todos'
import { GithubMark } from './icons/GithubMark'

interface Props {
  value: TodoKind
  onChange: (next: TodoKind) => void
  className?: string
}

/**
 * One mark per kind. Building for an account, GitHub's own mark for a pull
 * request, and a head-and-shoulders for everything that is just your own work.
 */
const GLYPHS: Record<TodoKind, ReactNode> = {
  account: <Building2 className="h-3 w-3" />,
  pr: <GithubMark className="h-3 w-3" />,
  other: <UserRound className="h-3 w-3" />
}

/**
 * Three-segment sliding pill in the to-do composer: what this to-do is about.
 * Shares its track and knob with the header's `ViewSlider` (see `lib/segmented`),
 * so the two read as the same control at two sizes.
 *
 * A **radiogroup**, not a tablist and not a ToggleGroup:
 *   - Unlike ViewSlider's tabs, these segments do not reveal panels; they set a
 *     field's value. Radio is the role for one-of-N over a value.
 *   - Unlike ChannelSlider's ToggleGroup, there is no "none of them" state to
 *     deselect into — a to-do is always about *something* — so the deselect a
 *     single-value ToggleGroup gives you would be a bug here, not a feature.
 *
 * Arrows select as they move (WAI-ARIA automatic activation), which is right
 * because nothing is written until the form is submitted: changing the kind is
 * free and instantly reversible, so making you press Space to confirm each one
 * would be ceremony.
 *
 * Equal cells from the grid rather than from measured label widths — same reason
 * ViewSlider does it, and the same trap avoided: `--font-sans` may resolve to SF
 * Pro or Inter, so a layout-effect measurement taken before the webfont settles
 * leaves the knob a few pixels off until an unrelated re-render fixes it.
 */
export function KindSlider({ value, onChange, className }: Props) {
  const active = TODO_KINDS.indexOf(value)

  /**
   * Focus follows selection. The segments use a roving tabIndex, so leaving
   * focus on the button we just moved off would strand it: that button is now
   * `tabIndex={-1}`, the next arrow goes nowhere, and Tab leaves the control.
   */
  const items = useRef(new Map<TodoKind, HTMLButtonElement>())

  const select = (next: TodoKind) => {
    items.current.get(next)?.focus()
    if (next !== value) onChange(next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = TODO_KINDS.length - 1
    // Left/Right only. Up/Down belong to the column scroller underneath, and the
    // group declares itself horizontal.
    const to =
      e.key === 'ArrowRight'
        ? (active + 1) % TODO_KINDS.length
        : e.key === 'ArrowLeft'
          ? (active + last) % TODO_KINDS.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : -1
    if (to < 0) return
    // Home and End would otherwise jump the column to its top or bottom.
    e.preventDefault()
    select(TODO_KINDS[to])
  }

  return (
    <div className={cn(SEGMENTED_TRACK, className)}>
      <div
        role="radiogroup"
        aria-label="What this is about"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="relative grid grid-cols-3"
      >
        <span
          aria-hidden
          style={{ transform: `translateX(${active * 100}%)` }}
          className={cn(SEGMENTED_THUMB, 'w-1/3')}
        />

        {TODO_KINDS.map((kind, i) => {
          const selected = i === active
          return (
            <button
              key={kind}
              // Cleared on unmount as well as filled on mount: a stale node left
              // behind is one `select()` would try to focus after a swap.
              ref={(el) => {
                if (el) items.current.set(kind, el)
                else items.current.delete(kind)
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              title={KIND_TITLES[kind]}
              // Roving tabIndex: the pill is one Tab stop, arrows move inside it.
              tabIndex={selected ? 0 : -1}
              onClick={() => select(kind)}
              className={cn(
                SEGMENTED_ITEM,
                'gap-1 px-1 py-1 text-[11px]',
                selected ? SEGMENTED_INK.on : SEGMENTED_INK.off
              )}
            >
              <span className="shrink-0">{GLYPHS[kind]}</span>
              {/* Truncates rather than overflows. At the board's usual width all
                  three labels fit with room to spare; the 188px column floor is
                  the only place they don't, and clipping "Account" beats the pill
                  pushing the composer wider than its column. */}
              <span className="truncate">{KIND_LABELS[kind]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
