import type { ReactNode } from 'react'
import type { CardColor } from './colors'

/**
 * The completion celebration: which effect plays when a to-do is dropped on the
 * rail, and the tiny store that keeps in-flight effects on screen.
 *
 * A module store rather than a hook, because the two halves live in different
 * components: `playCompletionFx` is called from the board's drop handler, while
 * the layer that renders the result is mounted at the app root so it paints
 * above the account drawer. A hook returning both would force them together, and
 * would re-render the board every time an effect starts and ends.
 */

/**
 * The four numbers every effect needs, and deliberately a structural subset of
 * dnd-kit's `ClientRect` so `active.rect.current.translated` and `over.rect`
 * assign straight in.
 *
 * Deliberately NOT `DOMRect`: ClientRect has no `x`, `y` or `toJSON`, so typing
 * this as DOMRect fails the typecheck at the one call site that matters. A real
 * DOMRect (from the card's own getBoundingClientRect, used by the keyboard
 * "Done" button) is structurally compatible in the other direction.
 */
export interface FxRect {
  top: number
  left: number
  width: number
  height: number
}

export const FX_KINDS = [
  'confetti',
  'explode',
  'shatter',
  'implode',
  'dissolve',
  'stamp'
] as const
export type FxKind = (typeof FX_KINDS)[number]

interface FxSpec {
  /**
   * How long the React-rendered part lives. Canvas particles outlive this and
   * clean themselves up via their own `ticks`, independently of React.
   */
  cloneMs: number
  /**
   * When the rail should acknowledge, in ms. Zero for effects that happen at
   * the card's old position; only the travelling effect defers, because pulsing
   * the rail before the card gets there reads as two unrelated events.
   */
  landAt: number
  /** Loud effects are rate-limited by the energy budget below. */
  loud: boolean
}

export const FX: Record<FxKind, FxSpec> = {
  confetti: { cloneMs: 160, landAt: 0, loud: true },
  explode: { cloneMs: 180, landAt: 0, loud: true },
  shatter: { cloneMs: 440, landAt: 0, loud: true },
  implode: { cloneMs: 320, landAt: 240, loud: false },
  dissolve: { cloneMs: 460, landAt: 0, loud: true },
  stamp: { cloneMs: 320, landAt: 0, loud: false }
}

/*
 * Every completion sets off the same two-cannon confetti explosion — that is the
 * payoff, and it should never be the luck of the draw. The six kinds above
 * describe only how the *card* comes apart on top of it, which is what varies.
 * CompletionFxLayer owns the canvas and fires it.
 */

export interface FxRequest {
  /** Where the card was on the frame it was released, in viewport coordinates. */
  rect: FxRect
  /** The rail's centre, for the effects that travel there. */
  target: { x: number; y: number }
  /** Drives particle, shard and cell colour, so the effect matches the card. */
  color: CardColor | null
  /**
   * Rendered inside each shard, so a shatter is pixel-identical to the card.
   * Must be a *static* face — no interactive props — or you get one live Radix
   * radiogroup per shard in the accessibility tree.
   */
  face: ReactNode
}

export interface FxEntry extends FxRequest {
  id: number
  kind: FxKind
}

// --- Effect selection ------------------------------------------------------

/*
 * Tetris-style bag randomiser rather than Math.random per call. Over six effects
 * a naive pick repeats back to back roughly one time in six, and "it did the
 * same thing twice" is the one outcome this feature cannot have. A bag also
 * means all six are seen within six completions rather than eventually.
 */
let bag: FxKind[] = []
/**
 * The last kind actually PLAYED — not the last drawn. The distinction is
 * load-bearing: the energy budget can discard a draw and substitute, and both the
 * bag-boundary guard and the substitute choice have to compare against what the
 * user actually saw. Set only where a pick is finalised, never inside draw().
 */
let last: FxKind | null = null

function refill(): void {
  bag = [...FX_KINDS]
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const swap = bag[i]
    bag[i] = bag[j]
    bag[j] = swap
  }
  // We draw from the end, so the next pick is the last element. Without this
  // swap the boundary between two bags is the one place a repeat survives:
  // bag A ends on 'shatter', bag B happens to start on 'shatter'.
  if (last !== null && bag[bag.length - 1] === last) {
    const carry = bag[bag.length - 1]
    bag[bag.length - 1] = bag[0]
    bag[0] = carry
  }
}

function draw(): FxKind {
  if (bag.length === 0) refill()
  return bag.pop() as FxKind
}

/*
 * Energy budget for the *card* effect. Clearing six to-dos in twenty seconds
 * should not be six shattering cards, so past three loud ones in eight seconds we
 * force the quiet pair, alternating between them. The bag itself is left
 * untouched — this only overrides the pick — so full variety resumes the moment
 * the burst is over.
 *
 * Confetti is deliberately outside this budget: the user asked for it on every
 * completion, so it fires at full strength regardless of how fast they go.
 */
const LOUD_WINDOW_MS = 8_000
const LOUD_ALLOWANCE = 3
const QUIET: readonly FxKind[] = ['implode', 'stamp']
const recentLoud: number[] = []

/** Chooses the next effect, or null for "no effect, just fade". */
export function pickEffect(reduced: boolean): FxKind | null {
  // Reduced motion short-circuits here rather than being handled per effect: one
  // mechanism, one place to audit, and the shard and cell nodes are never
  // created at all. It also fixes a real staleness bug — canvas-confetti's own
  // disableForReducedMotion snapshots the media query once, when the cannon is
  // created, so it never notices the OS setting changing mid-session.
  if (reduced) return null

  const now = performance.now()
  while (recentLoud.length > 0 && now - recentLoud[0] > LOUD_WINDOW_MS) recentLoud.shift()

  let pick = draw()

  if (FX[pick].loud && recentLoud.length >= LOUD_ALLOWANCE) {
    /*
     * Pick the substitute by what just played, not by a rotating counter. A
     * counter does not know the previous pick, so when the natural draw was
     * already quiet and the budget then substituted the same quiet kind, you got
     * the same effect twice in a row.
     */
    const quiet = QUIET.find((k) => k !== last) ?? QUIET[0]

    /*
     * Substituting has to go through the bag, not around it. Naively reassigning
     * `pick` left two things out of step: `last` still held the loud kind that
     * never played, and the quiet kind we just used was still sitting in the bag
     * — so the very next natural draw could pop it and produce the one outcome
     * this feature cannot have, the same effect twice in a row. It only shows up
     * when the budget is engaged, which is why spacing picks widely never
     * surfaced it.
     *
     * So: put the discarded loud kind back (it still deserves its turn once the
     * window clears) and consume the substitute from the bag.
     */
    bag.push(pick)
    bag = bag.filter((k) => k !== quiet)
    pick = quiet
  }

  if (FX[pick].loud) recentLoud.push(now)
  last = pick
  return pick
}

// --- The store -------------------------------------------------------------

/**
 * Overlap rather than queue, capped. Queuing would hold a second drop's effect
 * until the first finished, so a fast second completion would look like it did
 * nothing for 400ms. Past the cap the *visual* is dropped; the completion itself
 * never is.
 */
const MAX_CONCURRENT = 3

let items: readonly FxEntry[] = []
let nextId = 1
const listeners = new Set<() => void>()
const reapers = new Map<number, ReturnType<typeof setTimeout>>()

function emit(): void {
  for (const l of listeners) l()
}

function endFx(id: number): void {
  const reaper = reapers.get(id)
  if (reaper !== undefined) {
    clearTimeout(reaper)
    reapers.delete(id)
  }
  const next = items.filter((e) => e.id !== id)
  if (next.length === items.length) return
  items = next
  emit()
}

/**
 * Starts a celebration. Fire and forget, and synchronous — the caller runs it in
 * the same drop handler as the state change so React batches both into one
 * commit, which is what makes the drag overlay unmount on exactly the frame the
 * clone mounts.
 *
 * Returns the chosen kind (null when nothing will play) and when the rail should
 * acknowledge.
 */
export function playCompletionFx(
  req: FxRequest,
  reduced: boolean
): { kind: FxKind | null; landAt: number } {
  const kind = pickEffect(reduced)
  if (kind === null) return { kind: null, landAt: 0 }
  if (items.length >= MAX_CONCURRENT) return { kind: null, landAt: 0 }

  const id = nextId++
  items = [...items, { ...req, id, kind }]

  /*
   * Belt and braces. Chromium throttles requestAnimationFrame to a stop when the
   * Electron window is occluded or minimised, so motion's onAnimationComplete
   * and canvas-confetti's own loop can both simply never fire — background the
   * app mid-shatter and you return to frozen shards and a leaked entry. The
   * reaper removes the entry regardless of whether any callback ever arrived.
   * visibilitychange covers minimise; it does NOT fire for mere occlusion, which
   * is exactly why this timer exists rather than relying on callbacks.
   */
  reapers.set(
    id,
    setTimeout(() => endFx(id), FX[kind].cloneMs + 400)
  )
  emit()
  return { kind, landAt: FX[kind].landAt }
}

/** Called by an effect when its own animation reports completion. */
export function finishCompletionFx(id: number): void {
  endFx(id)
}

export function subscribeFx(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function fxSnapshot(): readonly FxEntry[] {
  return items
}

/*
 * A confetti burst with no completion behind it, for checking placement by eye.
 * Kept as its own listener rather than a synthetic FxEntry, so it cannot enter the
 * effect bag, spend the energy budget, or push an undo entry.
 */
const burstListeners = new Set<() => void>()

/** Subscribe to manual bursts. For CompletionFxLayer only. */
export function onBurst(listener: () => void): () => void {
  burstListeners.add(listener)
  return () => {
    burstListeners.delete(listener)
  }
}

/** Fires the confetti on its own, without completing anything. */
export function burstConfetti(): void {
  for (const listener of burstListeners) listener()
}

/** Drops everything now — on visibility loss and on layer unmount. */
export function clearFx(): void {
  for (const reaper of reapers.values()) clearTimeout(reaper)
  reapers.clear()
  if (items.length === 0) return
  items = []
  emit()
}

// --- Geometry, computed once at module load --------------------------------

/**
 * Deterministic 0..1 from an integer seed. Deliberately not Math.random: in
 * 440ms a fixed shard set is indistinguishable from a fresh one, and a fixed one
 * is something you can tune by eye without it changing under you between runs.
 */
function pseudo(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

const SHARD_COLS = 4
const SHARD_ROWS = 2
export const SHARD_COUNT = SHARD_COLS * SHARD_ROWS

/**
 * A 4x2 lattice with its interior vertices pushed off the grid lines, emitted as
 * eight quads. Neighbouring quads share vertices, so the tiling is exact and
 * there are no seams. The jitter is the point: a perfect grid reads as a sprite
 * sheet coming apart rather than as something that broke.
 */
function buildShards(): string[] {
  const cellW = 100 / SHARD_COLS
  const cellH = 100 / SHARD_ROWS

  const grid: { x: number; y: number }[][] = []
  for (let r = 0; r <= SHARD_ROWS; r++) {
    grid[r] = []
    for (let c = 0; c <= SHARD_COLS; c++) {
      // Edge vertices stay put, or the shards would not cover the whole card.
      const onEdgeX = c === 0 || c === SHARD_COLS
      const onEdgeY = r === 0 || r === SHARD_ROWS
      const jx = onEdgeX ? 0 : (pseudo(r * 31 + c * 7) - 0.5) * cellW * 0.5
      const jy = onEdgeY ? 0 : (pseudo(r * 17 + c * 41) - 0.5) * cellH * 0.5
      grid[r][c] = { x: c * cellW + jx, y: r * cellH + jy }
    }
  }

  const shapes: string[] = []
  for (let r = 0; r < SHARD_ROWS; r++) {
    for (let c = 0; c < SHARD_COLS; c++) {
      const quad = [grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]]
      const points = quad.map((p) => `${p.x.toFixed(2)}% ${p.y.toFixed(2)}%`).join(', ')
      shapes.push(`polygon(${points})`)
    }
  }
  return shapes
}

export interface ShardTraj {
  clip: string
  dx: number
  dy: number
  rot: number
  scale: number
  delay: number
}

/**
 * Where each shard goes. Biased downward — it should read as the card falling
 * apart, since exploding is already its own effect — and released in three waves
 * 20ms apart so the break propagates rather than happening all at once.
 */
export const SHARDS: readonly ShardTraj[] = buildShards().map((clip, i) => {
  const col = i % SHARD_COLS
  const row = Math.floor(i / SHARD_COLS)
  // -0.5 .. 0.5 across the card, so the outer shards throw furthest.
  const fromCentre = (col + 0.5) / SHARD_COLS - 0.5
  return {
    clip,
    dx: Math.round(fromCentre * 150 + (pseudo(i * 13 + 1) - 0.5) * 30),
    dy: Math.round(row === 0 ? -16 + pseudo(i * 7 + 3) * 22 : 52 + pseudo(i * 5 + 9) * 34),
    rot: Math.round(fromCentre * 44 + (pseudo(i * 23 + 5) - 0.5) * 28),
    scale: Number((0.72 + pseudo(i * 3 + 11) * 0.2).toFixed(2)),
    delay: ((row + col) % 3) * 20
  }
})

const CELL_COLS = 6
const CELL_ROWS = 3

export interface DissolveCell {
  left: string
  top: string
  width: string
  height: string
  dx: number
  dy: number
  delay: number
}

/**
 * An 18-cell grid of the card's surface drifting up and fading.
 *
 * Delays run on a deterministic bottom-left-to-top-right diagonal rather than
 * scattering at random: a random order reads as noise, a wipe reads as the card
 * evaporating.
 */
export const DISSOLVE_CELLS: readonly DissolveCell[] = Array.from(
  { length: CELL_COLS * CELL_ROWS },
  (_, i) => {
    const col = i % CELL_COLS
    const row = Math.floor(i / CELL_COLS)
    return {
      left: `${(col * 100) / CELL_COLS}%`,
      top: `${(row * 100) / CELL_ROWS}%`,
      width: `${100 / CELL_COLS}%`,
      height: `${100 / CELL_ROWS}%`,
      dx: Math.round((pseudo(i * 19 + 2) - 0.5) * 8),
      dy: -Math.round(6 + pseudo(i * 29 + 4) * 10),
      // The +/- 4ms jitter keeps the diagonal from looking mechanical.
      delay: (CELL_ROWS - 1 - row + col) * 14 + Math.round(pseudo(i * 37) * 8) - 4
    }
  }
)
