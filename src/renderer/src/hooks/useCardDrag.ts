import { useCallback, useEffect, useRef, useState } from 'react'
import { useAnimate } from 'motion/react'
import type { DragStartEvent } from '@dnd-kit/core'
import { EASE_SWIFT } from '../lib/motion'

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

/** How long a dropped card stays marked as "just landed". */
const LAND_MS = 400

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
    // Back to the card's own footprint, so a dropped overlay widens back out and
    // lands square with its slot rather than thin and offset. Width is kept —
    // only the offset is cleared — because the drop animation is still running.
    setPickup((p) => ({ ...p, x: 0, y: 0 }))
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
 * Returns the scope ref, which must go on a wrapper *outside* the sortable node
 * — dnd-kit writes its drag transform to the sortable's own inline style.
 */
export function useLandingWiden(landed: boolean) {
  const [scope, animate] = useAnimate()

  useEffect(() => {
    if (!landed || !scope.current) return
    void animate(scope.current, { width: ['50%', '100%'] }, { duration: 0.28, ease: EASE_SWIFT })
  }, [landed, animate, scope])

  return scope
}
