import type { Account, PostHogIdentity } from '../shared/types.js'

/**
 * PostHog client. Lives in the main process for two reasons: the renderer never
 * gets to see the API key, and main-process fetches aren't subject to CORS.
 */

const HOST = process.env.POSTHOG_HOST ?? 'https://us.posthog.com'
/** The project holding the `vitally_csm_managed_accounts` view. */
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
 * Pulls the accounts assigned to `csmEmail` from Vitally's CSM-managed view.
 *
 * Source note: PostHog's production billing tables only carry a CSM row for a
 * subset of a book (they miss accounts owned via TAM overlay), so ownership is
 * read from Vitally, which is the system of record for CSM assignment.
 */
export async function fetchAccounts(key: string, csmEmail: string): Promise<Account[]> {
  if (!EMAIL_RE.test(csmEmail)) {
    throw new PostHogError(`"${csmEmail}" is not a valid email address.`)
  }

  /*
   * The join is only for the logo. Vitally's own account record carries the
   * Salesforce fields, and `sfdc.Domain__c` is the account's website — which is
   * what logo.dev looks a mark up by. It is a LEFT join because a missing
   * domain must cost the account its logo, not its row; `coalesce` rather than
   * `assumeNotNull` for the same reason, since an unmatched row's traits are
   * genuinely NULL. Coverage is 295 of 304 accounts across every book.
   */
  const hogql = `
    SELECT
        v.organization_id,
        v.organization_name,
        v.segment,
        v.arr,
        toString(v.csm_date_assigned) AS csm_date_assigned,
        v.is_tam_overlay,
        JSONExtractString(coalesce(a.traits, ''), 'sfdc.Domain__c') AS domain
    FROM vitally_csm_managed_accounts v
    LEFT JOIN vitally_accounts a ON a.external_id = v.organization_id
    WHERE v.customer_success_manager = '${csmEmail}'
    ORDER BY v.organization_name
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
    segment: str(at(row, 'segment')),
    arr: at(row, 'arr') == null ? null : Number(at(row, 'arr')),
    csmDateAssigned: str(at(row, 'csm_date_assigned')),
    isTamOverlay: Number(at(row, 'is_tam_overlay') ?? 0) === 1,
    domain: str(at(row, 'domain'))
  }))
}
