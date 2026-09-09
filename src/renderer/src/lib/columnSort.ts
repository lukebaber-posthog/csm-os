/**
 * How one column orders its cards.
 *
 * Hand order is the default and the only order that is stored on the server;
 * the two touch orders are a view over the same placements, so turning one off
 * restores exactly the order you dragged. That also makes the preference local
 * — it is chrome, like the view pill, not content that should follow you
 * between machines.
 */

import type { Card } from '../hooks/useBoard'

export type ColumnSort = 'manual' | 'newest' | 'oldest'

/** Clicking the header control walks this cycle. */
const CYCLE: readonly ColumnSort[] = ['manual', 'newest', 'oldest']

export function nextSort(sort: ColumnSort): ColumnSort {
  const i = CYCLE.indexOf(sort)
  return CYCLE[(i + 1) % CYCLE.length]
}

/** Tooltip on the control: what you are looking at, and what a click does. */
export const SORT_HINT: Record<ColumnSort, string> = {
  manual: 'Ordered by hand — click to sort by most recently touched',
  newest: 'Most recently touched first — click to flip to longest untouched',
  oldest: 'Longest untouched first — click to go back to hand order'
}

export const SORT_LABEL: Record<ColumnSort, string> = {
  manual: 'By hand',
  newest: 'Newest touch first',
  oldest: 'Oldest touch first'
}

function touchedAt(iso: string | null): number {
  if (!iso) return -Infinity
  const t = new Date(iso).getTime()
  // An unparseable date is no more useful than a missing one.
  return Number.isNaN(t) ? -Infinity : t
}

/**
 * Cards in the requested order. `manual` returns the array untouched, so the
 * common case allocates nothing and keeps referential equality for memos.
 *
 * An account with no logged touch counts as infinitely stale rather than being
 * pushed to the end: on the cadence board a never-contacted account is the most
 * overdue thing in the column, so oldest-first has to surface it.
 */
export function sortCards(cards: Card[], sort: ColumnSort): Card[] {
  if (sort === 'manual') return cards
  const direction = sort === 'newest' ? -1 : 1

  return [...cards].sort((a, b) => {
    const x = touchedAt(a.lastTouchedAt)
    const y = touchedAt(b.lastTouchedAt)
    // Same day (or both never touched) falls back to hand order, which keeps
    // the column stable instead of reshuffling ties on every render.
    if (x === y) return a.position - b.position
    return (x - y) * direction
  })
}

const KEY = 'csm-os:column-sort'

export type SortMap = Record<string, ColumnSort>

/**
 * Stage keys are only unique within a layout, so entries are keyed by both.
 * A column sorted on the cadence board therefore stays sorted there without
 * touching the same-named column of another layout.
 */
export function sortMapKey(layoutKey: string, stageKey: string): string {
  return `${layoutKey}:${stageKey}`
}

function isColumnSort(value: unknown): value is ColumnSort {
  return CYCLE.includes(value as ColumnSort)
}

export function loadSorts(): SortMap {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const clean: SortMap = {}
    // Entry by entry: a stored blob from an older shape can't put a column
    // into a state the cycle doesn't know how to leave.
    for (const [k, v] of Object.entries(parsed)) if (isColumnSort(v)) clean[k] = v
    return clean
  } catch {
    // A corrupt preference should never stop the board opening.
    return {}
  }
}

export function saveSorts(map: SortMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // Preferences are a convenience; failing to persist isn't worth surfacing.
  }
}
