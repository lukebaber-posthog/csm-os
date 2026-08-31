import { useEffect, type RefObject } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { AnimatePresence, motion, useAnimate } from 'motion/react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { rgbOf } from '../lib/colors'
import { EASE_SWIFT } from '../lib/motion'

/**
 * The rail is the one place the board leaves its monochrome palette: holding a
 * card over it glows green, so "let go now" reads without having to look. Green
 * comes from the card palette rather than a new literal, so it stays in step with
 * the rest of the app.
 *
 * Inline styles because a Tailwind arbitrary value cannot interpolate the palette
 * — the same reason cardSurfaceStyle is inline.
 */
const GREEN = rgbOf('green')
const hotStyle = {
  borderColor: `rgb(${GREEN})`,
  color: `rgb(${GREEN})`,
  backgroundColor: `rgb(${GREEN} / 0.08)`,
  boxShadow: `0 0 0 1px rgb(${GREEN} / 0.45), 0 0 22px -2px rgb(${GREEN} / 0.55), inset 0 0 18px -6px rgb(${GREEN} / 0.6)`
}

/** The completion droppable's id. Not prefixed — there is only ever one. */
export const DONE_ID = 'todo-done'

/**
 * One accepted completion. A fresh object per completion, so the rail can depend
 * on its identity and replay the swallow exactly once — depending on `delay`
 * directly would replay it whenever a different effect kind was picked.
 */
export interface AcceptSignal {
  seq: number
  /** Delay before the swallow, so a travelling effect arrives with it. */
  delay: number
}

interface Props {
  count: number
  /** Any card is in flight, so the rail should show it can take one. */
  armed: boolean
  /** The pointer is over the rail specifically. */
  hot: boolean
  accept: AcceptSignal | null
  reduced: boolean
  /** Opens the completed list. The counter alone could say how many, not which. */
  onOpenCompleted: () => void
  /**
   * The rail's outer box. The keyboard "Done" path has no dnd-kit `over.rect` to
   * read, so it measures the rail through this instead.
   */
  containerRef?: RefObject<HTMLDivElement>
}

/**
 * The completion bar: a full-width strip along the bottom of the board.
 *
 * Borrows the columns' own drop-target vocabulary — a dashed border going from
 * transparent to visible — so it reads as part of the board's system rather than
 * as a fourth column. Restraint comes for free that way, which matters: the
 * effects are the payoff, and the bar should not compete with them.
 *
 * It was a narrow lane down the right-hand side. As a bottom strip every column
 * abuts it equally, so a card no longer has to be carried across the board to be
 * finished — and the drop target is the full width of the throw rather than a
 * 176px lane.
 */
export function CompleteZone({
  count,
  armed,
  hot,
  accept,
  reduced,
  containerRef,
  onOpenCompleted
}: Props) {
  const { setNodeRef } = useDroppable({ id: DONE_ID, data: { type: 'done' } })
  const [scope, animate] = useAnimate()

  useEffect(() => {
    if (!accept || reduced) return
    const t = setTimeout(() => {
      if (!scope.current) return
      /*
       * useAnimate rather than a changing `animate` target: this is a one-shot
       * re-triggered by a counter, and expressing "play this again" declaratively
       * would mean a key change that remounts the node dnd-kit holds a ref to.
       */
      void animate(
        scope.current,
        { scale: [1, 0.85, 1.12, 1] },
        { duration: 0.26, ease: EASE_SWIFT, times: [0, 0.25, 0.6, 1] }
      )
    }, accept.delay)
    return () => clearTimeout(t)
  }, [accept, animate, scope, reduced])

  return (
    /*
     * Grows taller while a card is in flight, to say "this is a target" without
     * needing a legend. That is only safe because TodoBoard measures droppables
     * with MeasuringStrategy.Always: dnd-kit otherwise caches every droppable rect
     * at drag start, and a bar that grew afterwards would leave the cached rect
     * behind — you would be pointing at the tall bar and dnd-kit would still be
     * matching the short one, which looks exactly like a collision-detection bug
     * and is not one. Growing in flow rather than overlaying, so it can never sit
     * on top of the columns and steal drops meant for them; the columns above
     * give up the height instead.
     */
    <div
      ref={containerRef}
      className={cn(
        'flex w-full shrink-0 flex-col transition-[height] duration-200 ease-swift',
        armed || hot ? 'h-[180px]' : 'h-[60px]'
      )}
    >
      {/*
        Only colours change between rest, armed and hot — never the box's own
        geometry, and the swallow scales the glyph rather than this node. The
        height change belongs to the wrapper above, which dnd-kit re-measures;
        a transform here would leave `over.rect` stale and move the target out
        from under the cursor mid-aim.
      */}
      <div
        ref={setNodeRef}
        // The glow is a box-shadow, not a ring or an outline that changes the box.
        style={hot ? hotStyle : undefined}
        className={cn(
          'relative flex flex-1 items-center justify-center gap-2.5 rounded-lg border',
          'transition-[border-color,background-color,color,box-shadow] duration-200 ease-swift',
          // Dashed at every state, and never transparent: at rest the outline is
          // what says there is somewhere to drop things, which an invisible border
          // left to the check glyph alone. Rest uses the muted line and armed the
          // strong one, so arming is a step up rather than an appearance.
          hot
            ? 'border-solid'
            : armed
              ? 'border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[var(--color-ink-muted)]'
              : 'border-dashed border-[var(--color-line)] text-[var(--color-ink-faint)]'
        )}
      >
        {/* Laid out in a row, not stacked: a wide short bar has the width to put
            the glyph and its label side by side, and stacking them in 60px would
            crowd both. */}
        <div ref={scope} className="flex items-center gap-2.5">
          <Check
            aria-hidden
            className={cn(
              'h-5 w-5 transition-transform duration-150 ease-swift',
              hot && 'scale-[1.12]'
            )}
          />
          {/* Only shown once a card is in flight, so at rest the bar stays quiet. */}
          <span
            className={cn(
              'text-[11px] font-medium transition-opacity duration-200 ease-swift',
              armed || hot ? 'opacity-100' : 'opacity-0'
            )}
          >
            {hot ? 'Release to complete' : 'Drop to complete'}
          </span>
        </div>

        {/*
          The completed-list control, parked at the right end rather than in a
          header of its own. A bar this short cannot afford a header line above it,
          and absolute keeps it out of the centring above — the glyph stays centred
          on the bar, not on the space left over beside this.
        */}
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenCompleted}
            title="See everything you have completed, and put any of it back"
            className="rounded text-[12px] font-semibold uppercase tracking-wider text-[var(--color-ink-faint)] transition-colors hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)]"
          >
            Done
          </button>
          {/*
            Fixed box plus overflow-hidden masks the slide, and tabular-nums keeps
            9 -> 10 from shifting the row. aria-live is off because the undo
            toast is already a live region — announcing both says it twice.
          */}
          <span
            aria-live="off"
            title={`${count} completed today`}
            className="relative block h-4 w-5 overflow-hidden font-mono text-[11px] tabular-nums text-[var(--color-ink-faint)]"
          >
            {/* initial={false} so the count on first paint doesn't slide in from
                below every time the board mounts. */}
            <AnimatePresence initial={false}>
              <motion.span
                key={count}
                initial={{ y: reduced ? 0 : 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: reduced ? 0 : -12, opacity: 0 }}
                transition={{ duration: 0.18, ease: EASE_SWIFT }}
                className="absolute inset-0 block text-right"
              >
                {count}
              </motion.span>
            </AnimatePresence>
          </span>
        </div>
      </div>
    </div>
  )
}
