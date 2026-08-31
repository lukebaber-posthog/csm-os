import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAnimate } from 'motion/react'
import type { DragStartEvent } from '@dnd-kit/core'
import { DROP_ANIM, EASE_SWIFT } from '../lib/motion'

/**
 * The pickup-and-land feel both boards drag with, in one place.
 *
 * It is one effect in two halves that have to agree, which is why they live in
 * one file. The board half (`useCardDrag`) measures where you grabbed the card
 * and how wide it was; `DragCardOverlay` uses that to centre the card on the
 * cursor and thin it to half width while it is in flight. The card half
 * (`useLandingWiden`) plays the other end: the dropped card widens from 50% back
 * out into its slot. Change the half here and you must change the half there.
 *
 * Extracted from the to-do board, which had all of it; the accounts board had a
 * fixed-width overlay and none of it, so a card behaved differently depending on
 * which tab you were on.
 */

export interface Pickup {
  /** How far the overlay must move to sit centred on the cursor. */
  x: number
  y: number
  /** The source card's own footprint at the moment it was grabbed. */
  width: number
  height: number
}

const AT_REST: Pickup = { x: 0, y: 0, width: 0, height: 0 }

/**
 * The landing is two beats, not one: hold at half width while dnd-kit flies the
 * overlay home, and only then expand into the slot.
 *
 * Without the hold both played at once — the card widened *underneath* the
 * overlay and was already near full width by the time the overlay unmounted, so
 * the expansion was never actually visible and the card read as popping to full
 * width. HOLD is the drop animation's own duration, taken from `DROP_ANIM` so the
 * two cannot drift apart.
 */
const HOLD_MS = DROP_ANIM.duration
const WIDEN_MS = 320

/**
 * How long a dropped card stays marked as "just landed". Must outlast the whole
 * two-beat animation, or the flag clears while it is still playing.
 */
const LAND_MS = HOLD_MS + WIDEN_MS + 60

export interface CardDrag {
  pickup: Pickup
  /** The card that just landed, so it widens back out into its slot. */
  landedId: string | null
  /** Call from `onDragStart` for a card drag. Reads the grab point. */
  grab: (event: DragStartEvent) => void
  /** Call from `onDragEnd` and `onDragCancel`. Returns the card to its footprint. */
  release: () => void
  /** Call when a drop actually moved something. */
  land: (id: string) => void
}

export function useCardDrag(): CardDrag {
  const [pickup, setPickup] = useState<Pickup>(AT_REST)
  const [landedId, setLandedId] = useState<string | null>(null)
  const landTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (landTimer.current !== null) clearTimeout(landTimer.current)
    }
  }, [])

  const grab = useCallback((e: DragStartEvent) => {
    /*
     * dnd-kit lines the overlay's top-left up with the source card's top-left and
     * then applies the drag delta, so by default the cursor sits wherever it
     * happened to grab. To centre the card on the cursor instead, shift it by the
     * grab point measured from the card's own centre.
     *
     * The activator event is the pointerdown that armed the drag — five pixels of
     * movement earlier — which is exactly "where you grabbed it".
     *
     * The rect is read straight from the DOM rather than from
     * `active.rect.current.initial`, which is still null this early: dnd-kit
     * populates it after onDragStart, so using it silently left the offset at zero
     * and the card never moved off dnd-kit's default alignment.
     */
    const activator = e.activatorEvent as Partial<PointerEvent> | undefined
    const node = document.querySelector(`[data-drag-id="${CSS.escape(String(e.active.id))}"]`)
    const rect = node?.getBoundingClientRect()
    if (!rect) return

    if (typeof activator?.clientX === 'number' && typeof activator?.clientY === 'number') {
      setPickup({
        // Halved width, so a quarter of the full width is its new half-extent:
        // the thing being centred is what the card becomes, not what it was.
        x: activator.clientX - rect.left - rect.width / 4,
        y: activator.clientY - rect.top - rect.height / 2,
        width: rect.width,
        height: rect.height
      })
    } else {
      // Keyboard drags have no pointer to centre on; leave the card where it is.
      setPickup({ x: 0, y: 0, width: rect.width, height: rect.height })
    }
  }, [])

  const release = useCallback(() => {
    /*
     * Land the overlay CENTRED in the slot, not flush left.
     *
     * dnd-kit flies the overlay home to the source node's rect, which is the
     * card's full width; the overlay inside it is half that. Sending x to 0 put
     * that half-width card against the left edge of a full-width slot, while the
     * placed card underneath is centred by its own auto margins — so the moment
     * the overlay unmounted the card appeared to hop sideways into the middle.
     *
     * width / 4 is the offset that centres it: the slot is `width`, the overlay
     * is `width / 2`, so the leftover space either side is `width / 4`.
     *
     * Width itself is kept, not reset — the drop animation is still running and
     * the overlay must stay the size it was in flight.
     */
    setPickup((p) => ({ ...p, x: p.width / 4, y: 0 }))
  }, [])

  const land = useCallback((id: string) => {
    setLandedId(id)
    if (landTimer.current !== null) clearTimeout(landTimer.current)
    landTimer.current = setTimeout(() => setLandedId(null), LAND_MS)
  }, [])

  return { pickup, landedId, grab, release, land }
}

/**
 * The card half: widen from 50% back to full on arrival.
 *
 * It has to happen on the card rather than on the overlay, because dnd-kit
 * caches the overlay's rendered node for the drop animation — re-rendering that
 * wider has no effect on what is on screen.
 *
 * Imperative rather than declarative: a card dragged within its own column is
 * never unmounted, so an `initial` would not re-run, and a state-driven
 * `animate` would have to pass through the half-width value on the way in.
 * `useAnimate` just plays it.
 *
 * Returns the scope ref. Two requirements on the element it goes on:
 *
 *  - It must be a wrapper *outside* the sortable node — dnd-kit writes its drag
 *    transform to the sortable's own inline style.
 *  - It must carry `mx-auto`. A block element animated from 50% to 100% width
 *    grows from its left edge, so the card would cling to the left of the column
 *    and unfurl rightwards; auto margins keep it centred and let it open out both
 *    ways at once. Cheaper and safer than a transform, which would also make the
 *    wrapper a containing block for anything positioned inside it.
 */
export function useLandingWiden(landed: boolean) {
  const [scope, animate] = useAnimate()

  /*
   * useLayoutEffect, and the width is set by hand before the animation is asked
   * for. Both halves of that matter.
   *
   * The card is placed at its natural full width in the same commit that sets
   * `landed`. A useEffect runs after paint and motion schedules its first
   * keyframe a frame later still, so the card painted full width and then snapped
   * to half — read as the card flashing to the left before the animation began.
   * Writing the width in a layout effect lands it before that first paint, so the
   * card is never seen at anything but half width.
   */
  useLayoutEffect(() => {
    if (!landed || !scope.current) return
    scope.current.style.width = '50%'

    const total = HOLD_MS + WIDEN_MS
    void animate(
      scope.current,
      // Three keyframes, not two: the repeated 50% is the hold. A plain `delay`
      // would leave the card at its natural full width for the wait and then
      // snap to half before expanding, which is a flash rather than a fix.
      { width: ['50%', '50%', '100%'] },
      { duration: total / 1000, times: [0, HOLD_MS / total, 1], ease: EASE_SWIFT }
    )
  }, [landed, animate, scope])

  return scope
}
