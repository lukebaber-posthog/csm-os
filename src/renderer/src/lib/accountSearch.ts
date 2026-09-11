/**
 * Ranking the book against what someone is typing.
 *
 * Not `lib/accountMatch`, which answers a different question: that one finds the
 * account *named inside a sentence* ("look into the spike for Contoso"), and is
 * deliberately strict — it refuses an ambiguous guess rather than picking, since
 * guessing wrong silently re-files a to-do. Search is the opposite trade. The
 * query is a fragment, several accounts legitimately match, and the person is
 * looking at the list and choosing, so being generous costs nothing.
 */

const COMBINING_MARK_RE = /[̀-ͯ]/g

/**
 * Punctuation and spacing thrown away on both sides, so "US Mobile", "us-mobile"
 * and "USMobile" are one string, and "Boot.dev" is reachable by typing "bootd".
 *
 * `accountMatch` folds too, but only for diacritics and case — it splits on
 * punctuation into words instead of collapsing it, because it is scanning prose
 * where word boundaries are the whole point.
 */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING_MARK_RE, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** The name split on punctuation and spacing, each part folded. */
function words(name: string): string[] {
  return name
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(fold)
    .filter(Boolean)
}

/** Every letter of `query` appears in `text`, in order but not necessarily together. */
function isSubsequence(query: string, text: string): boolean {
  let i = 0
  for (const ch of text) {
    if (ch === query[i]) i++
    if (i === query.length) return true
  }
  return query.length === 0
}

export interface SearchableAccount {
  orgId: string
  orgName: string
  domain: string | null
}

/**
 * How well an account answers the query, lowest first, or null for no match.
 *
 * The tiers are ordered by how confident the match is rather than by how much of
 * the name it covers, so typing "la" puts Lahzo (a name prefix) above LayerZero
 * (also a prefix) above Etactics (a subsequence, l…a) — and never the other way
 * round because the letters happened to be closer together.
 */
function tierOf(account: SearchableAccount, query: string): number | null {
  const name = fold(account.orgName)
  if (name === query) return 0
  if (name.startsWith(query)) return 1
  if (words(account.orgName).some((w) => w.startsWith(query))) return 2
  if (name.includes(query)) return 3
  if (account.domain && fold(account.domain).includes(query)) return 4
  if (isSubsequence(query, name)) return 5
  return null
}

/**
 * The book, filtered and ranked. An empty query returns everything in name
 * order, so opening the palette and pressing Down is a way to browse rather than
 * a dead end.
 */
export function searchAccounts<T extends SearchableAccount>(
  accounts: readonly T[],
  query: string
): T[] {
  const folded = fold(query)
  const byName = (a: T, b: T) => a.orgName.localeCompare(b.orgName)

  if (!folded) return [...accounts].sort(byName)

  return accounts
    .map((account) => ({ account, tier: tierOf(account, folded) }))
    .filter((hit): hit is { account: T; tier: number } => hit.tier !== null)
    .sort((a, b) => a.tier - b.tier || byName(a.account, b.account))
    .map((hit) => hit.account)
}
