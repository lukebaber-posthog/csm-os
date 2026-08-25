/** Display helpers. Kept pure so they're trivial to eyeball and reuse. */

/** Compact ARR: 652065.24 -> "$652k", 14780 -> "$14.8k". */
export function arr(value: number | null): string {
  if (value == null) return '—'
  if (value >= 1_000_000) {
    const m = value / 1_000_000
    return `$${m >= 10 ? Math.round(m) : m.toFixed(1)}M`
  }
  if (value >= 1_000) {
    const k = value / 1_000
    return `$${k >= 100 ? Math.round(k) : k.toFixed(1)}k`
  }
  return `$${Math.round(value)}`
}

/** Full ARR for tooltips and the detail drawer. */
export function arrExact(value: number | null): string {
  if (value == null) return 'No ARR recorded'
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  })
}

/** Whole days between an ISO timestamp and now. Null-safe. */
export function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000))
}

/** Days-since-contact as it appears on a card. */
export function contactAge(iso: string | null): string {
  const d = daysSince(iso)
  if (d === null) return 'No contact logged'
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  return `${d}d ago`
}

/** "Synced 2 min ago" for the header. */
export function syncAge(iso: string | null): string {
  if (!iso) return 'Not synced'
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'Synced just now'
  if (secs < 3600) return `Synced ${Math.floor(secs / 60)} min ago`
  if (secs < 86_400) return `Synced ${Math.floor(secs / 3600)}h ago`
  return `Synced ${Math.floor(secs / 86_400)}d ago`
}

/*
 * `<input type="date">` speaks yyyy-mm-dd in local time, Supabase speaks ISO.
 * Both hops go through midday so a date-only entry can't drift across a
 * timezone edge and land on the neighbouring day.
 */

/** Today as a date-input value, for defaults and `max`. */
export function todayInput(): string {
  return toDateInput(new Date().toISOString())
}

/** ISO timestamp -> yyyy-mm-dd in the viewer's timezone. */
export function toDateInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** yyyy-mm-dd -> ISO timestamp anchored at local midday. */
export function fromDateInput(value: string): string {
  return new Date(`${value}T12:00:00`).toISOString()
}

/**
 * Local midnight today, as an ISO timestamp — the lower bound of a "done today"
 * window.
 *
 * Deliberately NOT `fromDateInput(todayInput())`. That function anchors at
 * midday on purpose, so a date-only entry can't drift across a timezone edge
 * onto the neighbouring day — correct for a logged touch, and catastrophic for
 * a count window, where a midday boundary silently drops everything completed
 * before lunch.
 */
export function startOfTodayIso(): string {
  return new Date(`${todayInput()}T00:00:00`).toISOString()
}

/**
 * Local midnight `days` before today, as an ISO timestamp — the lower bound of a
 * "last N days" window. Anchored at midnight for the same reason
 * startOfTodayIso is, and stepped with setDate so month, year and DST rollovers
 * are the platform's problem rather than ours.
 */
export function startOfDaysAgoIso(days: number): string {
  const d = new Date(`${todayInput()}T00:00:00`)
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

/** Two-letter monogram for the card avatar: "Clinical Notes AI" -> "CN". */
export function monogram(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/)
  if (words.length === 0 || !words[0]) return '??'
  // A leading number reads better whole ("713 Online" -> "71", not "7O").
  if (/^\d/.test(words[0]) || words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
