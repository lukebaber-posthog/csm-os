import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { rgbOf } from '../lib/colors'
import { EASE_SWIFT } from '../lib/motion'
import {
  DISSOLVE_CELLS,
  FX,
  SHARDS,
  finishCompletionFx,
  type FxEntry
} from '../lib/completionFx'

/**
 * The six completion effects. Each renders at the card's captured rect and is
 * responsible only for its own visuals — selection, queueing and teardown live
 * in lib/completionFx.ts, and the canvas-driven half of `confetti` and `explode`
 * is fired by CompletionFxLayer, which owns the canvas.
 *
 * Every effect animates transform and opacity only. Electron means a known
 * GPU-composited Chromium, so that set is the safe one and there is no reason to
 * leave it.
 */

/** The card's footprint in viewport coordinates, as a fixed-position box. */
function rectStyle(entry: FxEntry): CSSProperties {
  return {
    position: 'fixed',
    top: entry.rect.top,
    left: entry.rect.left,
    width: entry.rect.width,
    height: entry.rect.height
  }
}

/**
 * Removes the entry once the CSS animation is done. The store's reaper is a
 * backstop for a throttled window, not the primary path, so the keyframe-driven
 * effects say when they are finished rather than lingering for the grace period.
 */
function useSelfRemoval(entry: FxEntry): void {
  useEffect(() => {
    const t = setTimeout(() => finishCompletionFx(entry.id), FX[entry.kind].cloneMs)
    return () => clearTimeout(t)
  }, [entry.id, entry.kind])
}

/**
 * The DOM half of `confetti`. The card settles and fades rather than vanishing on
 * the release frame — without it the burst reads as unrelated decoration instead
 * of as something the card did.
 */
export function ConfettiClone({ entry, face }: { entry: FxEntry; face: ReactNode }) {
  return (
    <motion.div
      style={rectStyle(entry)}
      initial={{ scale: 1, opacity: 1 }}
      animate={{ scale: 0.94, opacity: 0 }}
      transition={{ duration: FX.confetti.cloneMs / 1000, ease: EASE_SWIFT }}
      onAnimationComplete={() => finishCompletionFx(entry.id)}
    >
      {face}
    </motion.div>
  )
}

/** The DOM half of `explode`: the card inflates a little before it goes. */
export function ExplodeClone({ entry, face }: { entry: FxEntry; face: ReactNode }) {
  return (
    <motion.div
      style={rectStyle(entry)}
      initial={{ scale: 1, opacity: 1 }}
      animate={{ scale: [1, 1.06, 0.9], opacity: [1, 1, 0] }}
      transition={{
        duration: FX.explode.cloneMs / 1000,
        ease: EASE_SWIFT,
        times: [0, 0.35, 1]
      }}
      onAnimationComplete={() => finishCompletionFx(entry.id)}
    >
      {face}
    </motion.div>
  )
}

/**
 * The card breaks into eight pieces.
 *
 * Each shard is a wrapper clipped to one quad of a jittered lattice, holding a
 * pixel-identical copy of the card's face. `clip-path` applies in the element's
 * own coordinate space *before* its transform, so a shard keeps its shape for the
 * whole flight — no per-frame clip-path animation, which would not composite.
 * Rendering the same React element eight times is legal: an element is a
 * descriptor, so this creates eight independent instances.
 *
 * Per-shard trajectories arrive as inline custom properties so one keyframe
 * serves all eight — the same pattern ChannelSlider uses for its widths.
 *
 * Note the clip also crops each copy's box-shadow, which is what we want: eight
 * separately glowing rectangles would read as a slideshow transition.
 */
export function Shatter({ entry, face }: { entry: FxEntry; face: ReactNode }) {
  useSelfRemoval(entry)
  const base = rectStyle(entry)

  return (
    <>
      {SHARDS.map((shard, i) => (
        <div
          key={i}
          style={
            {
              ...base,
              clipPath: shard.clip,
              animationDelay: `${shard.delay}ms`,
              '--fx-dx': `${shard.dx}px`,
              '--fx-dy': `${shard.dy}px`,
              '--fx-rot': `${shard.rot}deg`,
              '--fx-scale': `${shard.scale}`
            } as CSSProperties
          }
          // will-change earns its keep here precisely because these nodes are
          // ephemeral — eight of them, gone in 440ms. It must never go on
          // something mounted for the app's lifetime.
          className="animate-fx-shard will-change-[transform,opacity]"
        >
          {face}
        </div>
      ))}
    </>
  )
}

/**
 * The card is swallowed by the completion rail.
 *
 * A bezier rather than a spring, deliberately: a spring travelling a few hundred
 * pixels to a target overshoots past the rail, which reads as the card *missing*.
 * This curve's hard deceleration is exactly "sucked in and stopped". The one
 * place where the obvious motion-library move is the wrong one.
 */
export function Implode({ entry, face }: { entry: FxEntry; face: ReactNode }) {
  const dx = entry.target.x - (entry.rect.left + entry.rect.width / 2)
  const dy = entry.target.y - (entry.rect.top + entry.rect.height / 2)
  const seconds = FX.implode.cloneMs / 1000

  return (
    <motion.div
      style={rectStyle(entry)}
      initial={{ x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 }}
      animate={{
        x: dx,
        y: dy,
        // A little anticipation before it goes.
        scale: [1, 1.03, 0.08],
        rotate: 10,
        opacity: [1, 1, 0]
      }}
      transition={{
        duration: seconds,
        ease: EASE_SWIFT,
        scale: { duration: seconds, times: [0, 0.2, 1], ease: EASE_SWIFT },
        opacity: { duration: seconds, times: [0, 0.72, 1] }
      }}
      onAnimationComplete={() => finishCompletionFx(entry.id)}
    >
      {face}
    </motion.div>
  )
}

/**
 * The card evaporates: an 18-cell grid of its surface drifting up and fading on a
 * bottom-left-to-top-right wipe.
 *
 * The cells carry the card's tint, not its content. Nobody reads text off an
 * 18-cell grid in 320ms, and 18 copies of the face to prove it would make this
 * the most expensive effect in the set by an order of magnitude.
 */
export function Dissolve({ entry }: { entry: FxEntry }) {
  useSelfRemoval(entry)

  // An uncoloured card's tint is transparent, so it would dissolve into nothing.
  // A 12% ink wash is the monochrome equivalent, and color-mix keeps it correct
  // in both themes without the component knowing which one is active.
  const fill = entry.color
    ? `rgb(${rgbOf(entry.color)} / var(--card-tint-alpha))`
    : 'color-mix(in srgb, var(--color-ink) 12%, transparent)'

  return (
    <div style={rectStyle(entry)} className="overflow-hidden rounded-lg">
      {DISSOLVE_CELLS.map((cell, i) => (
        <span
          key={i}
          style={
            {
              position: 'absolute',
              left: cell.left,
              top: cell.top,
              width: cell.width,
              height: cell.height,
              backgroundColor: fill,
              animationDelay: `${cell.delay}ms`,
              '--fx-dx': `${cell.dx}px`,
              '--fx-dy': `${cell.dy}px`
            } as CSSProperties
          }
          className="animate-fx-grain will-change-[transform,opacity]"
        />
      ))}
    </div>
  )
}

/**
 * The card is filed: a mild overshoot on the clone plus one expanding ring. No
 * particles, no pieces.
 *
 * This is what the energy budget falls back to, and it is what makes the fifth
 * completion in a row feel considerate rather than tiring.
 */
export function Stamp({ entry, face }: { entry: FxEntry; face: ReactNode }) {
  const base = rectStyle(entry)

  useEffect(() => {
    // The ring outlives the clone, so the entry is removed on the spec's clock
    // rather than on the clone's shorter animation.
    const t = setTimeout(() => finishCompletionFx(entry.id), FX.stamp.cloneMs)
    return () => clearTimeout(t)
  }, [entry.id])

  return (
    <>
      <motion.div
        style={base}
        initial={{ scale: 1, opacity: 1 }}
        animate={{ scale: [1, 1.05, 0.9], opacity: [1, 1, 0] }}
        transition={{
          duration: 0.22,
          times: [0, 0.45, 1],
          // The app's only anticipation curve. Everything else decelerates.
          ease: [0.34, 1.4, 0.64, 1]
        }}
      >
        {face}
      </motion.div>
      <div
        style={base}
        className="animate-fx-ring rounded-lg border-[1.5px] border-[var(--color-ink)] will-change-[transform,opacity]"
      />
    </>
  )
}
