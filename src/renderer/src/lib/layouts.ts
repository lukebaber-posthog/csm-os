/**
 * Board layouts. Each is an ordered set of columns; an account has an
 * independent placement in every layout, so switching layouts never loses work.
 * These are the seeded defaults — labels are editable per user in Supabase, so
 * treat this as the fallback rather than the source of truth.
 */

export interface StageDef {
  key: string
  label: string
}

export interface LayoutDef {
  key: string
  label: string
  /** One-line explanation shown in the layout picker. */
  hint: string
  stages: readonly StageDef[]
  /**
   * Columns are derived from the data rather than from where cards were
   * dropped. A computed layout ignores `board_placements` entirely, and its
   * columns cannot be renamed, added, deleted, or reordered — there is nothing
   * to persist, and a rename would only make the label disagree with the rule
   * that fills it.
   */
  computed?: boolean
}

/**
 * A cadence column: everything whose last contact falls in this many days.
 *
 * Bounds are inclusive and `maxDays: null` is open-ended. Ordered most stale
 * first, so the column that wants attention is the one you read first — the same
 * left-to-right urgency the to-do board uses in reverse.
 */
export interface CadenceBucket {
  key: string
  label: string
  minDays: number
  maxDays: number | null
}

/** The column an account with no logged contact at all falls into. */
export const NEVER_CONTACTED = 'never'

export const CADENCE_BUCKETS: readonly CadenceBucket[] = [
  { key: 'd31_plus', label: '31+ days', minDays: 31, maxDays: null },
  { key: 'd21_30', label: '21–30 days', minDays: 21, maxDays: 30 },
  { key: 'd11_20', label: '11–20 days', minDays: 11, maxDays: 20 },
  { key: 'd4_10', label: '4–10 days', minDays: 4, maxDays: 10 },
  { key: 'd0_3', label: '0–3 days', minDays: 0, maxDays: 3 }
] as const

/**
 * Which cadence column an account belongs in.
 *
 * `null` last contact is its own column rather than "infinitely stale": never
 * having spoken to an account is a different fact from having let it go quiet,
 * and only one of them is fixed by getting in touch again.
 */
export function cadenceBucketOf(days: number | null): string {
  if (days === null) return NEVER_CONTACTED
  const hit = CADENCE_BUCKETS.find((b) => days >= b.minDays && (b.maxDays === null || days <= b.maxDays))
  // Ordered and contiguous from 0, so only a negative day count could miss.
  return hit?.key ?? CADENCE_BUCKETS[CADENCE_BUCKETS.length - 1].key
}

/**
 * How many days back a touch must be dated to land in this column.
 *
 * The *newest* end of the range, which is the edge that keeps the card there
 * longest: dropping into "21–30 days" and dating it 30 days back would push the
 * card out of the column again tomorrow.
 */
export function cadenceDaysFor(bucketKey: string): number | null {
  return CADENCE_BUCKETS.find((b) => b.key === bucketKey)?.minDays ?? null
}

export const LAYOUTS: readonly LayoutDef[] = [
  {
    key: 'relationship',
    label: 'Relationship',
    hint: 'How deep the relationship is',
    stages: [
      { key: 'not_reached', label: "Haven't reached out" },
      { key: 'introed', label: 'Introed' },
      { key: 'responded', label: 'Responded' },
      { key: 'relationship', label: 'Relationship' },
      { key: 'self_serve', label: 'Happy self-serve' }
    ]
  },
  {
    key: 'cadence',
    label: 'Cadence',
    hint: 'Sorted by days since last contact',
    /*
     * Derived, not dragged. The columns were once relationship words — Introed,
     * Sent, Replied — placed by hand, which meant the board could disagree with
     * the touch log sitting behind it. Now the log decides, so the labels say
     * only what the rule actually knows: how long it has been.
     */
    computed: true,
    stages: [
      { key: NEVER_CONTACTED, label: 'Never contacted' },
      ...CADENCE_BUCKETS.map((b) => ({ key: b.key, label: b.label }))
    ]
  }
] as const

export const DEFAULT_LAYOUT = 'relationship'

export function layoutDef(key: string): LayoutDef {
  return LAYOUTS.find((l) => l.key === key) ?? LAYOUTS[0]
}

/** Leftmost column of a layout: where newly synced accounts land. */
export function intakeStageOf(layoutKey: string): string {
  return layoutDef(layoutKey).stages[0].key
}

/** Days without contact before a card is flagged stale. */
export const STALE_AFTER_DAYS = 30

/**
 * Ceiling on columns per layout. Also enforced by a trigger on board_stages,
 * so the limit holds even if something writes to Supabase directly.
 */
export const MAX_COLUMNS = 10

/** A layout needs at least two columns for dragging between them to mean anything. */
export const MIN_COLUMNS = 2

export interface Stage {
  key: string
  label: string
  position: number
}

export interface Layout {
  key: string
  label: string
  position: number
}
