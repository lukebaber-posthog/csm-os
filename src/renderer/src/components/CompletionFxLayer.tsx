import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import confetti from 'canvas-confetti'
import { particleColors } from '../lib/colors'
import { getSettings } from '../lib/settings'
import {
  clearFx,
  onBurst,
  fxSnapshot,
  subscribeFx,
  type FxEntry
} from '../lib/completionFx'
import {
  ConfettiClone,
  Dissolve,
  ExplodeClone,
  Implode,
  Shatter,
  Stamp
} from './completionEffects'

/**
 * `confetti.create` returns an augmented callable. Derived rather than written as
 * `confetti.CreateTypes` so the type does not depend on the namespace surviving
 * into type position through the package's `export =` shape.
 */
type Cannon = ReturnType<typeof confetti.create>

/** How long Mega Confetti keeps going, and how often it sends up a volley. */
const MEGA_MS = 5000
const MEGA_VOLLEY_MS = 130

/**
 * Our own confetti canvas, sized once and reused for the app's lifetime.
 *
 * `useWorker: false`, deliberately, for two independent reasons. canvas-confetti's
 * default global builds its worker from a `blob:` URL, and index.html sets
 * `script-src 'self'` with no `worker-src` — worker-src falls back to script-src,
 * the Worker constructor throws, and the library logs "Could not load worker" on
 * the first burst of every session before quietly falling back to the main thread
 * anyway. And with a caller-supplied canvas the worker path calls
 * `transferControlToOffscreen()`, after which the main thread can never resize
 * that canvas again.
 *
 * `resize: false` because we set the backing store ourselves, DPR-scaled: the
 * library sizes from clientWidth/clientHeight with no devicePixelRatio, so out of
 * the box every particle is rendered at 1x and upscaled on a Retina display.
 */
function useCannon() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  /**
   * Mega mode: five seconds of confetti across the whole window.
   *
   * A repeating timer rather than one enormous burst. canvas-confetti's particle
   * count is per call, and a single call big enough to last five seconds would put
   * every particle in the air on frame one and then thin out — which reads as one
   * big pop, not a sustained spray. Small volleys on a short interval keep the
   * screen filled for the whole run.
   */
  const megaTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const megaUntil = useRef(0)

  const stopMega = useCallback(() => {
    if (megaTimer.current === null) return
    clearInterval(megaTimer.current)
    megaTimer.current = null
    megaUntil.current = 0
  }, [])

  const cannonRef = useRef<Cannon | null>(null)
  // Clamped at 2: a 3x display would triple the backing store for no visible gain.
  const dprRef = useRef(1)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      dprRef.current = dpr
      canvas.width = Math.round(window.innerWidth * dpr)
      canvas.height = Math.round(window.innerHeight * dpr)
    }

    size()
    cannonRef.current = confetti.create(canvas, { resize: false, useWorker: false })

    const onResize = () => {
      // reset() BEFORE resizing. Resizing a canvas clears it, but the library's
      // captured size object still holds the old dimensions, and its clearRect
      // against those would leave trails across the new geometry. Losing
      // in-flight particles on a resize is fine; trails are not.
      cannonRef.current?.reset()
      size()
    }

    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return
      // Chromium throttles requestAnimationFrame to a stop for a hidden window,
      // so both motion's completion callbacks and the confetti loop stall
      // mid-flight. Without this you minimise during a shatter and come back to
      // eight frozen shards sitting over the board.
      cannonRef.current?.reset()
      clearFx()
      stopMega()
    }

    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      // StrictMode mounts, unmounts and remounts this in dev. Two create() calls
      // on one canvas are harmless (each is an independent closure and only the
      // surviving ref is used), but the first must be reset or the double-mount
      // can leave a cannon holding a stale animation object.
      cannonRef.current?.reset()
      cannonRef.current = null
      clearFx()
      stopMega()
    }
  }, [stopMega])

  /** The confetti eruption. Takes nothing: origin and palette are both constant. */
  const fire = useCallback(() => {
    const cannon = cannonRef.current
    if (!cannon) return

    const dpr = dprRef.current
    // Every length-like physics value is in backing-store pixels, so it has to
    // scale with the store. particleCount, spread, angle, decay and ticks are
    // unitless and must not.
    const px = (n: number) => n * dpr

    const shared = {
      // All seven hues, every time. Rainbow is the point.
      colors: particleColors(),
      /*
       * Bottom centre, not the card's own position.
       *
       * Firing from the card put the origin wherever the card happened to be
       * released — which is always the completion rail, hard against the right
       * edge — so a full-circle burst threw most of its particles straight off
       * screen and what remained was crammed into the corner. Erupting up the
       * middle of the window puts the whole arc in view. The card still comes
       * apart at its own rect; only the confetti moved.
       */
      origin: { x: 0.5, y: 1 },
      disableForReducedMotion: true
    }

    /*
     * Two cannons, fired on the same frame, both straight up. One alone reads as a
     * polite spray; a tight jet inside a wide fan reads as an eruption.
     *
     * Neither is `flat` any more. That was only ever there to make the old
     * full-circle burst look like hard debris, and the 3D tilt and wobble is
     * exactly what makes paper confetti tumble.
     */

    // The core jet: narrow and fast, so it carries most of the way up the window.
    // Reach is roughly startVelocity / (1 - decay) — about 620px here — before
    // gravity arcs it back over.
    cannon({
      ...shared,
      particleCount: 60,
      angle: 90,
      spread: 45,
      startVelocity: px(62),
      gravity: px(1.05),
      decay: 0.9,
      // Longer than the old bursts, because these particles now travel the height
      // of the window and fall back down rather than popping in place.
      ticks: 170,
      scalar: 1 * dpr,
      shapes: ['square', 'circle']
    })

    // The fan around it: wider and slower, so the eruption has shoulders.
    cannon({
      ...shared,
      particleCount: 70,
      angle: 90,
      spread: 130,
      startVelocity: px(46),
      gravity: px(1.1),
      decay: 0.9,
      ticks: 150,
      scalar: 1.1 * dpr,
      shapes: ['square', 'circle']
    })

    if (!getSettings().megaConfetti) return

    // Completing again mid-run extends the party rather than starting a second
    // timer, so a burst of completions cannot stack intervals.
    megaUntil.current = Date.now() + MEGA_MS
    if (megaTimer.current !== null) return

    megaTimer.current = setInterval(() => {
      if (Date.now() >= megaUntil.current) {
        stopMega()
        return
      }
      const live = cannonRef.current
      if (!live) return

      // Side cannons angled inward, so the middle of the screen fills rather than
      // just the edges.
      live({
        ...shared,
        origin: { x: 0, y: 0.85 },
        particleCount: 14,
        angle: 60,
        spread: 75,
        startVelocity: px(58),
        gravity: px(1),
        decay: 0.91,
        ticks: 200,
        scalar: 1 * dpr,
        shapes: ['square', 'circle']
      })
      live({
        ...shared,
        origin: { x: 1, y: 0.85 },
        particleCount: 14,
        angle: 120,
        spread: 75,
        startVelocity: px(58),
        gravity: px(1),
        decay: 0.91,
        ticks: 200,
        scalar: 1 * dpr,
        shapes: ['square', 'circle']
      })
      // Plus a jet from a random point along the bottom, which is what stops the
      // spray looking like two fixed streams.
      live({
        ...shared,
        origin: { x: 0.15 + Math.random() * 0.7, y: 1 },
        particleCount: 12,
        angle: 90,
        spread: 110,
        startVelocity: px(52),
        gravity: px(1.05),
        decay: 0.9,
        ticks: 180,
        scalar: 1.1 * dpr,
        shapes: ['square', 'circle']
      })
    }, MEGA_VOLLEY_MS)
  }, [stopMega])

  return { canvasRef, fire }
}

/** Renders how the card itself comes apart. The confetti is fired separately. */
function Effect({ entry }: { entry: FxEntry }) {
  switch (entry.kind) {
    case 'confetti':
      return <ConfettiClone entry={entry} face={entry.face} />
    case 'explode':
      return <ExplodeClone entry={entry} face={entry.face} />
    case 'shatter':
      return <Shatter entry={entry} face={entry.face} />
    case 'implode':
      return <Implode entry={entry} face={entry.face} />
    case 'dissolve':
      return <Dissolve entry={entry} />
    case 'stamp':
      return <Stamp entry={entry} face={entry.face} />
  }
}

/**
 * Where completion celebrations are drawn. Mounted once at the app root rather
 * than inside the to-do board, so an effect keeps playing if you flick back to
 * the accounts view mid-flight, and so it paints above the account panel.
 *
 * Subscribes to the effect store directly, so starting an effect re-renders this
 * and nothing else — the board that fired it is untouched.
 */
export function CompletionFxLayer() {
  const entries = useSyncExternalStore(subscribeFx, fxSnapshot)
  const { canvasRef, fire } = useCannon()

  // Ids are monotonic and entries are appended in order, so a high-water mark is
  // enough to fire each one exactly once — and it survives StrictMode's
  // double-invoked mount effect, where a Set of seen ids would also work but grow
  // without bound.
  const lastFired = useRef(0)
  useEffect(() => {
    for (const entry of entries) {
      if (entry.id <= lastFired.current) continue
      lastFired.current = entry.id
      // Unconditional: confetti is the payoff for every completion.
      fire()
    }
  }, [entries, fire])

  // The manual trigger, for checking placement without completing anything.
  useEffect(() => onBurst(() => fire()), [fire])

  return createPortal(
    <div
      // aria-hidden is not decoration: eight shard clones would otherwise put
      // eight duplicate to-do titles into the accessibility tree for 440ms, a bug
      // that is completely invisible if you only ever look at the screen.
      aria-hidden
      // z-70 sits above the account panel (z-50) and the colour toolbar (z-60).
      //
      // pointer-events-none is load-bearing beyond the obvious: Chromium excludes
      // pointer-events:none elements from the non-client-area hit test, which is
      // what keeps the -webkit-app-region titlebar draggable underneath. Give this
      // element or the canvas pointer-events:auto and dragging the window by its
      // titlebar silently stops working, with no error anywhere.
      className="pointer-events-none fixed inset-0 z-[70]"
    >
      {/*
        h-full w-full is NOT redundant with the parent's inset-0, and removing it
        breaks the confetti in a way that is very hard to see.
        <canvas> is a *replaced* element, so `position: fixed; inset: 0` does not
        stretch it: with `width: auto` CSS uses its intrinsic size — the width and
        height attributes, which we set to the retina backing store — and treats
        the box as over-constrained, ignoring right/bottom. The canvas then renders
        at 2960x1748 CSS px over a 1480x874 window, so only its top-left quadrant
        is on screen and a burst aimed at bottom centre appears at the right edge,
        below the fold. Explicit CSS sizing keeps the backing store at 2x while the
        box matches the viewport.
      */}
      <canvas ref={canvasRef} className="pointer-events-none fixed left-0 top-0 h-full w-full" />
      {entries.map((entry) => (
        <Effect key={entry.id} entry={entry} />
      ))}
    </div>,
    document.body
  )
}
