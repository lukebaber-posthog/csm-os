/**
 * The app's motion vocabulary: one curve, shared by everything that moves.
 *
 * Three representations of the same four numbers, because three consumers want
 * three shapes and none can be derived from another at build time:
 *   EASE_SWIFT      motion's BezierDefinition tuple. It rejects easing strings.
 *   EASE_SWIFT_CSS  dnd-kit's dropAnimation, which takes a raw CSS easing.
 *   EASE            the Tailwind shorthand, reading --ease-swift from styles.css.
 *
 * Keep all four in step if the curve is ever retuned.
 */

/**
 * `as const` gives `readonly [0.2, 0, 0, 1]`, which satisfies motion's
 * `BezierDefinition = readonly [number, number, number, number]` — the literal
 * types widen to `number` on assignment, so no cast is needed.
 */
export const EASE_SWIFT = [0.2, 0, 0, 1] as const

/** For APIs that take a CSS easing string rather than a tuple. */
export const EASE_SWIFT_CSS = 'cubic-bezier(0.2, 0, 0, 1)'

/** Duration plus curve, for the CSS-transition call sites. */
export const EASE = 'duration-200 ease-swift'

/**
 * dnd-kit's own drop transform, for both boards' DragOverlay. The to-do board
 * swaps it for `null` when a card is headed for the completion rail: dnd-kit's
 * transform and a motion exit animation would otherwise both drive the same
 * node, which reads as jank and is genuinely hard to attribute.
 */
export const DROP_ANIM = { duration: 180, easing: EASE_SWIFT_CSS }
