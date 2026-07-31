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
    hint: 'How stale each account is',
    stages: [
      { key: 'overdue', label: 'Overdue' },
      { key: 'due_soon', label: 'Due Soon' },
      { key: 'introed', label: 'Introed' },
      { key: 'sent', label: 'Sent' },
      { key: 'replied', label: 'Replied' },
      { key: 'touched', label: 'Recently Touched' }
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
