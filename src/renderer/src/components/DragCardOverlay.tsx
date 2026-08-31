import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import type { Pickup } from '../hooks/useCardDrag'

interface Props {
  pickup: Pickup
  /**
   * Drops the tilt. The to-do board sets it as a card nears the completion rail,
   * so squaring up foreshadows the swallow; the accounts board has no rail and
   * never sets it.
   */
  squareUp?: boolean
  children: ReactNode
}

/**
 * The in-flight card, for both boards' `<DragOverlay>`.
 *
 * No fixed width class, deliberately — that is the whole point of it. dnd-kit
 * sizes the overlay wrapper to the card's own measured rect and the child
 * animates within it: full width at the moment of pickup, then half, so the card
 * visibly thins as you lift it and widens back out into its column when you let
 * go (`useLandingWiden` plays that second half). The accounts board used to
 * hard-code `w-[212px]` here, which was both a different feel and wrong by a
 * couple of dozen pixels against its own columns.
 *
 * Width rather than scaleX, deliberately — scaling would squash the text
 * horizontally, where narrowing lets it rewrap and still read.
 *
 * motion drives it so picking a card up is a glide rather than a jump. Note this
 * composes rather than conflicts: dnd-kit writes the drag translation to its own
 * wrapper element and this transform sits on a child, so the two never fight
 * over one element's `transform`.
 */
export function DragCardOverlay({ pickup, squareUp = false, children }: Props) {
  return (
    <motion.div
      initial={{ x: 0, y: 0, rotate: 0, width: pickup.width || undefined }}
      animate={{
        x: pickup.x,
        y: pickup.y,
        rotate: squareUp ? 0 : 1,
        width: pickup.width ? pickup.width / 2 : undefined
      }}
      transition={{ type: 'spring', stiffness: 520, damping: 42, mass: 0.6 }}
      className="dragging-card cursor-grabbing"
    >
      {children}
    </motion.div>
  )
}
