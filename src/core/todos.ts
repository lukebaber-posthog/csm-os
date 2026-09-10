/**
 * To-do horizons — the three fixed columns of the to-do board.
 *
 * Unlike `board_stages`, this set is not editable, so it is a CHECK-constrained
 * enum on the row rather than a table of columns: no rename, no reorder, no
 * add/delete, and none of the machinery those need (the 10-column trigger, the
 * deferrable position-unique constraint, the rehoming RPC).
 */

/**
 * Order is left-to-right on the board. Note urgency *increases* rightward,
 * the reverse of the accounts board's progression: it puts the nearest deadline
 * nearest the completion rail, which is where a finished card is headed.
 */
export const TODO_BUCKETS = ['month', 'week', 'today'] as const
export type TodoBucket = (typeof TODO_BUCKETS)[number]

export const BUCKET_LABELS: Record<TodoBucket, string> = {
  month: 'This Month',
  week: 'This Week',
  today: 'Today'
}

/** Where a new to-do lands when the form doesn't say otherwise. */
export const DEFAULT_BUCKET: TodoBucket = 'week'

export function isTodoBucket(value: unknown): value is TodoBucket {
  return typeof value === 'string' && (TODO_BUCKETS as readonly string[]).includes(value)
}

/**
 * What a to-do is *about* — the second axis, orthogonal to the horizon above.
 *
 * A CHECK-constrained enum on the row for the same reason `bucket` is one: the
 * set is fixed, so there is no rename, reorder, or add to support.
 *
 * `account` is the only kind that carries an org id. The other two exist because
 * a CSM's week is not only accounts: a review left on a pull request and "draft
 * the Q3 goal" are both real work, and before this they could only be filed as
 * "no account" — indistinguishable from an account to-do you had not linked yet.
 */
export const TODO_KINDS = ['account', 'pr', 'other'] as const
export type TodoKind = (typeof TODO_KINDS)[number]

/** Segment labels. Short by necessity: three of them share one column's width. */
export const KIND_LABELS: Record<TodoKind, string> = {
  account: 'Account',
  pr: 'PR',
  other: 'Other'
}

/** The long form, for tooltips and accessible names. */
export const KIND_TITLES: Record<TodoKind, string> = {
  account: 'About one of your accounts',
  pr: 'A pull request',
  other: 'Your own work — anything that is not about an account'
}

/**
 * What a new to-do is assumed to be. Most of a CSM's list is account work, and
 * being wrong costs one click on a pill that is already on screen.
 */
export const DEFAULT_KIND: TodoKind = 'account'

export function isTodoKind(value: unknown): value is TodoKind {
  return typeof value === 'string' && (TODO_KINDS as readonly string[]).includes(value)
}

/**
 * Drops the account link from anything that is no longer an account to-do.
 *
 * The form keeps `orgId` in state while you flip through the kinds, so switching
 * to PR and back does not throw away the account you had already chosen. That
 * makes it the form's job to stop a stale link reaching the row — and a stale
 * link is not cosmetic: `TodoFace` renders the account chip off `orgId`, so a PR
 * card would sit there wearing some customer's logo.
 *
 * Applied in `useTodos`, not in the form, so it covers the optimistic patch and
 * the write in one place and holds for any future caller.
 */
export function normalizeTodoValues<T extends { kind: TodoKind; orgId: string | null }>(
  values: T
): T {
  return values.kind === 'account' ? values : { ...values, orgId: null }
}
