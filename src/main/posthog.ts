import type { Account, PostHogIdentity } from '../shared/types.js'

/**
 * PostHog client. Lives in the main process for two reasons: the renderer never
 * gets to see the API key, and main-process fetches aren't subject to CORS.
 */

const HOST = process.env.POSTHOG_HOST ?? 'https://us.posthog.com'
/** The project holding the customer-analytics account tables. */
const PROJECT_ID = Number(process.env.POSTHOG_PROJECT_ID ?? 2)

const REQUEST_TIMEOUT_MS = 30_000

/**
 * Deliberately strict. The email is interpolated into HogQL as a quoted
 * literal, so this validation is the thing that makes that safe: no quote,
 * backslash, or whitespace can survive it.
 */
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export class PostHogError extends Error {}

async function call<T>(
  path: string,
  key: string,
  init?: { method: string; body: unknown }
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${HOST}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: init ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'unreachable'
    throw new PostHogError(`PostHog ${reason}. Check your network connection.`)
  }

  if (res.status === 401 || res.status === 403) {
    throw new PostHogError(
      'PostHog rejected the API key. Confirm it is valid and has the "query:read" scope.'
    )
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new PostHogError(
      `PostHog returned ${res.status}. ${detail.slice(0, 300) || 'No detail provided.'}`
    )
  }
  return (await res.json()) as T
}

/** Confirms a key works and reports who it belongs to. */
export async function verifyKey(key: string): Promise<PostHogIdentity> {
  const me = await call<{ email: string; first_name?: string }>('/api/users/@me/', key)
  return {
    email: me.email,
    firstName: me.first_name ?? null,
    projectId: PROJECT_ID
  }
}

/**
 * Pulls the accounts assigned to `csmEmail` from PostHog's own Customer
 * Analytics tables.
 *
 * Ownership is `system.account_relationships` — the native assignment record,
 * one row per user-to-account role with an effective range. Filtering on
 * `ended_at IS NULL` gives the current holders; the same table keeps ended
 * assignments, so this is a live view rather than a snapshot.
 *
 * This replaced `vitally_csm_managed_accounts`. Customer Analytics is not just
 * a like-for-like source, it is ahead of Vitally: compared across every CSM's
 * book on 2026-09-01, 308 organizations appeared in both, 15 only in Customer
 * Analytics, and 1 only in Vitally. For this book the two agreed exactly — same
 * 31 organizations, same assignment dates.
 */
export async function fetchAccounts(key: string, csmEmail: string): Promise<Account[]> {
  if (!EMAIL_RE.test(csmEmail)) {
    throw new PostHogError(`"${csmEmail}" is not a valid email address.`)
  }

  /*
   * Notes on the joins, in the order they bite:
   *
   * - `postgres_posthog_user` is the email-to-user-id hop. Relationships key on
   *   a numeric PostHog user id and no system table exposes the email, so the
   *   alternative was an extra `/api/users/@me/` round trip that would also have
   *   silently changed the semantics from "this email's book" to "the key
   *   owner's book". Resolving it here keeps the caller's contract.
   * - Domain feeds logo.dev and is `coalesce`d across two sources because
   *   neither covers the book alone: Salesforce's `domain_c` (the same field the
   *   Vitally query reached through cached traits) misses 5 of 31, and the
   *   account's own `website_domain` property misses 15. Together they miss 2 —
   *   the same coverage the Vitally join gave, without Vitally.
   * - ARR is the `MRR` account custom property annualised. There is no native
   *   field equal to Vitally's `arr`; see the README for what changes.
   *
   * Every join is LEFT ANY: enrichment must cost an account a field, never its
   * row. ANY also stops a duplicate on the right multiplying the book.
   *
   * Careful with the custom-property join — do NOT add a second one beside it
   * for another property. Two subqueries of this shape against the same table
   * returned each other's values (measured: `Confirmed MRR` came back carrying
   * `MRR`'s numbers). Pivot with `argMaxIf` over one scan instead.
   */
  const hogql = `
    SELECT
        a.external_id AS organization_id,
        a.name AS organization_name,
        round(p.mrr * 12, 2) AS arr,
        toString(toDate(r.started_at)) AS csm_date_assigned,
        coalesce(
            nullIf(sf.domain_c, ''),
            nullIf(JSONExtractString(toString(a.properties), 'website_domain'), '')
        ) AS domain
    FROM system.account_relationships AS r
    LEFT ANY JOIN system.accounts AS a ON a.id = r.account_id
    LEFT ANY JOIN system.account_relationship_definitions AS d ON d.id = r.definition_id
    LEFT ANY JOIN (SELECT id, domain_c FROM salesforce_account) AS sf ON sf.id = a.sfdc_id
    LEFT ANY JOIN (
        SELECT account_id, argMax(value_num, created_at) AS mrr
        FROM postgres_customer_analytics_custompropertyvalue
        WHERE is_deleted = 0
          AND definition_id IN (
              SELECT toString(id) FROM system.custom_property_definitions WHERE name = 'MRR'
          )
        GROUP BY account_id
    ) AS p ON p.account_id = toString(a.id)
    WHERE d.name = 'CSM'
      AND r.ended_at IS NULL
      AND a.churned_at IS NULL
      AND r.user_id IN (
          SELECT id FROM postgres_posthog_user
          WHERE lower(email) = '${csmEmail.toLowerCase()}' AND is_active
      )
    ORDER BY a.name
    LIMIT 500
  `.trim()

  const body = { query: { kind: 'HogQLQuery', query: hogql } }
  const res = await call<{ results: unknown[][]; columns: string[] }>(
    `/api/projects/${PROJECT_ID}/query/`,
    key,
    { method: 'POST', body }
  )

  // Map by column name rather than index — column order is not a contract.
  const at = (row: unknown[], name: string) => {
    const i = res.columns.indexOf(name)
    return i === -1 ? null : row[i]
  }

  const str = (v: unknown) => (v == null || v === '' ? null : String(v))

  return (res.results ?? []).map((row) => ({
    orgId: String(at(row, 'organization_id') ?? ''),
    orgName: String(at(row, 'organization_name') ?? 'Unknown account'),
    /*
     * A literal, not a column. Vitally's `segment` was 'CSM Managed' for every
     * row of every book — the view only contained CSM-managed accounts, so the
     * field was constant by construction and carried no information. Customer
     * Analytics has no equivalent, and its `Region` property is unset across
     * this whole book, so nothing native can fill the slot yet. Kept as the same
     * constant rather than dropped so the panel does not grow a hole.
     */
    segment: 'CSM Managed',
    arr: at(row, 'arr') == null ? null : Number(at(row, 'arr')),
    csmDateAssigned: str(at(row, 'csm_date_assigned')),
    domain: str(at(row, 'domain'))
  }))
}
