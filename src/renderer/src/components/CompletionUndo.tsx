import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { EASE_SWIFT } from '../lib/motion'

/** How long the offer stays up after the most recent completion. */
const DISMISS_MS = 6000

interface Props {
  /** The most recent completion, or null when there is nothing to offer. */
  top: { id: string; title: string; runLength: number } | null
  onUndo: (id: string) => void
  onDismiss: () => void
  reduced: boolean
}

/**
 * The undo offer, bottom-right.
 *
 * One slot with a LIFO stack behind it rather than a pile of toasts — a
 * productive minute should not become a wall of notifications. `role="status"`
 * makes this the single live region for the whole interaction, which is why the
 * rail's counter is aria-live="off".
 *
 * Sits at z-65: above the account panel (z-50) but below the effect layer (z-70),
 * so shards fly over the toast rather than under it.
 */
export function CompletionUndo({ top, onUndo, onDismiss, reduced }: Props) {
  const [paused, setPaused] = useState(false)

  const id = top?.id ?? null
  const runLength = top?.runLength ?? 0

  /*
   * The dismiss clock is driven by the completion itself and by nothing else.
   *
   * `top` is built inline in the parent's JSX, so it is a fresh object every
   * render, and `onDismiss` ultimately closes over the to-do list, so its
   * identity changes on every mutation. Depending on either would restart this
   * timeout whenever the board re-rendered for an unrelated reason — moving a
   * card in another column would silently extend the offer, and a re-render loop
   * would keep it up forever. So the handler goes in a ref and the effect depends
   * only on what should actually restart the clock.
   *
   * id and runLength are exactly those triggers: each completion in a run bumps
   * runLength, so five in a row keeps one toast up for six seconds after the
   * last rather than the first.
   */
  const dismissRef = useRef(onDismiss)
  useEffect(() => {
    dismissRef.current = onDismiss
  }, [onDismiss])

  /*
   * Clear the pause whenever there is no toast.
   *
   * This component never unmounts — only the inner motion.div is conditional — so
   * `paused` outlives a toast. And to reach Undo at all you must be hovering it or
   * have focused it, both of which set paused. Browsers do not fire blur or
   * pointerleave for a node that is removed from under a stationary cursor, so the
   * flag latched: the NEXT completion's toast then created no timer at all and sat
   * on screen indefinitely, still offering to un-complete an old row.
   */
  useEffect(() => {
    if (id === null) setPaused(false)
  }, [id])

  useEffect(() => {
    if (id === null || paused) return
    const t = setTimeout(() => dismissRef.current(), DISMISS_MS)
    return () => clearTimeout(t)
  }, [id, runLength, paused])

  return createPortal(
    <AnimatePresence>
      {top && (
        /*
          One element for the shell, with the label updating in place. Keying the
          shell on the completion id would make a second completion wait for the
          first to exit, and the toast would visibly blink between two wins.
        */
        <motion.div
          key="undo-toast"
          role="status"
          initial={{ opacity: 0, y: reduced ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduced ? 0 : 6 }}
          transition={{
            duration: 0.18,
            ease: EASE_SWIFT,
            // The effect plays mid-board and this is in the corner, so they do not
            // collide spatially — but starting both on the same frame makes them
            // compete for the eye. The payoff gets to read first.
            delay: reduced ? 0 : 0.12
          }}
          // Reaching for Undo with the mouse should not be a race against a timer
          // that doesn't know you're coming.
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          /*
            Clears the completion bar rather than covering it. The bar is 60px at
            rest plus the board's 24px bottom padding, and the toast only ever
            appears after a drop — when the bar has already shrunk back — so it is
            the resting height that has to be cleared, not the armed one.
          */
          className="fixed bottom-24 right-5 z-[65] flex items-center gap-3 rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-raised)] px-3 py-2 shadow-[var(--card-shadow-lift)]"
        >
          <span className="max-w-[220px] truncate text-[12px] text-[var(--color-ink)]">
            {top.runLength > 1 ? `${top.runLength} to-dos completed` : `Completed ${top.title}`}
          </span>
          <button
            type="button"
            onClick={() => onUndo(top.id)}
            className="rounded px-1.5 py-0.5 text-[12px] font-semibold text-[var(--color-ink)] underline decoration-[var(--color-line-strong)] underline-offset-2 hover:bg-[var(--color-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)]"
          >
            Undo
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
