import { EASE } from './motion'

/**
 * The sliding-pill recipe: a translucent track, a knob that slides between equal
 * cells, and segments that sit above it.
 *
 * Extracted because there are now two of these in different corners of the app —
 * the header's view switcher and the to-do composer's kind picker — and the whole
 * point of the second one is that it reads as a sibling of the first. Sharing the
 * classes rather than copying them means retuning the pill retunes both.
 *
 * Deliberately class strings, not a component. The two differ in everything a
 * component would have to abstract: ARIA role (tablist vs radiogroup), keyboard
 * model, segment contents, and cell count. What they genuinely share is the
 * *look*, and that is exactly what a class string carries.
 *
 * ChannelSlider is not a third consumer: its track collapses to a single segment
 * on blur and unfurls on hover, which is a width animation these two don't have.
 */

/**
 * The padded track. Note what is *not* here: the segment grid. The knob is
 * absolutely positioned against the grid, not against this element — a
 * percentage width resolves against the containing block's padding box, so a
 * knob parented here would be sized against (track − borders) and sit a couple
 * of pixels wide and left.
 */
export const SEGMENTED_TRACK =
  'rounded-full border p-0.5 ' +
  'border-black/[0.07] bg-black/[0.05] ' +
  'dark:border-white/[0.09] dark:bg-white/[0.07]'

/**
 * The knob. The caller supplies its width (`w-1/2` for two cells, `w-1/3` for
 * three) and its `translateX`, in whole multiples of 100% — a percentage in a
 * transform resolves against the element's own box, so 100% is exactly one cell
 * of travel.
 *
 * A CSS transition rather than motion: the two pills can be on screen at once,
 * and a spring beside a bezier reads as one of the two being broken.
 */
export const SEGMENTED_THUMB =
  'pointer-events-none absolute inset-y-0 left-0 rounded-full ' +
  'bg-[var(--color-raised)] shadow-[0_1px_3px_rgb(0_0_0/0.18)] ' +
  'ring-1 ring-black/5 dark:bg-white/[0.22] dark:ring-white/20 ' +
  'transition-transform ' +
  EASE

/**
 * A segment. `relative` is load-bearing: the knob is absolutely positioned and
 * paints over static siblings, so without it every label disappears under a
 * white disc.
 */
export const SEGMENTED_ITEM =
  'relative z-10 flex min-w-0 items-center justify-center rounded-full font-medium ' +
  'transition-colors ' +
  EASE +
  ' focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)]'

/** Ink for the chosen segment, muted for the rest. */
export const SEGMENTED_INK = {
  on: 'text-[var(--color-ink)]',
  off: 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
} as const
