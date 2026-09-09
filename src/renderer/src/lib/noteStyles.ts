/**
 * How the dialect looks, in one place.
 *
 * These strings are needed twice over and must not drift: `FormattedText` paints
 * a saved note on a card, and the editor paints the same constructs while they
 * are being typed. The whole point of the editor is that those two look the
 * same, so a class list defined once is the mechanism, not a tidiness measure.
 *
 * Tailwind v4 scans source files for candidates, so class names living in a `.ts`
 * module are generated exactly as they would be inline in a component.
 */

/**
 * An ink wash rather than `--color-surface`, which was #fafafa on a white card —
 * a one-step difference that vanished at 11px. A translucent black/white also
 * solves the dark theme, where surface is *darker* than the card it sits on and
 * the chip read as a hole.
 *
 * `ring` rather than `border`: a ring is a box-shadow, so the chip gains an edge
 * without gaining layout, which inside a line-clamped run of text would
 * otherwise nudge the line box.
 *
 * Sized in `em`, so one value serves a 13px card title, an 11px note and a 12px
 * row in the completed list.
 */
export const CODE_CHIP =
  'rounded px-[0.3em] py-[0.1em] font-mono text-[0.9em] font-normal ' +
  'text-[var(--color-ink)] bg-black/[0.07] ring-1 ring-black/[0.09] ' +
  'dark:bg-white/[0.13] dark:ring-white/[0.16]'

/**
 * A link inside a run of text. Colour is inherited rather than set, so a link
 * inside `{blue|…}` is blue and one in a card title stays title-coloured — the
 * underline is what marks it, which suits a UI whose hierarchy is weight and
 * spacing rather than hue.
 */
export const INLINE_LINK =
  'underline decoration-[var(--color-line-strong)] underline-offset-2 ' +
  'transition-colors hover:decoration-current'
