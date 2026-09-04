/** Types shared across the main, preload, and renderer processes. */

/** One account in the signed-in CSM's book, as it comes back from PostHog. */
export interface Account {
  orgId: string
  orgName: string
  segment: string | null
  /** Annual recurring revenue in USD. Never persisted to Supabase. */
  arr: number | null
  csmDateAssigned: string | null
  /**
   * The account's own website domain, used to fetch its logo. Null when
   * Salesforce has no domain for it (about 3% of accounts), which the chip
   * renders as a monogram. Read at display time only — never persisted to
   * Supabase.
   */
  domain: string | null
}

/** Result of checking a stored PostHog credential. */
export interface PostHogIdentity {
  email: string
  firstName: string | null
  /** Which PostHog project the key resolved against. */
  projectId: number
}

export interface AccountsPayload {
  accounts: Account[]
  /** ISO timestamp of the fetch that produced these accounts. */
  fetchedAt: string
  /** True when PostHog was unreachable and this came off the on-device cache. */
  fromCache: boolean
}

/** Discriminated result so the renderer never has to parse thrown strings. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

/**
 * How one logged outreach went out. Order is the order of the picker.
 *
 * Not to be confused with `ContactChannel` in `renderer/lib/channels`, which is
 * where an account's contact lives and is one standing choice per account.
 * Only 'slack' appears in both.
 *
 * 'link' is the odd one: the others describe a conversation, that one describes
 * something you sent — a doc, a dashboard, a recording — so it is the only
 * channel that carries a URL alongside the note.
 */
export const TOUCH_CHANNELS = ['email', 'call', 'meeting', 'slack', 'link', 'other'] as const
export type TouchChannel = (typeof TOUCH_CHANNELS)[number]
