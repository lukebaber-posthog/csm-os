import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildAccountIndex, matchAccount } from '../core/accountMatch.js'
import type { Account } from '../shared/types.js'
import { userDataDir, type Config } from './config.js'

/**
 * The account book, and turning a name into an org id.
 *
 * Accounts are the one thing not in Supabase — they are read live from PostHog
 * by the main process, which caches them on disk so the board still opens
 * offline. This server reads that cache rather than querying PostHog itself,
 * which is what keeps it free of the API key: the key lives in the OS keychain
 * and only Electron can decrypt it. The dev browser bridge takes the same route
 * for the same reason.
 *
 * The cost is that the book is only as fresh as the last sync in the app. That
 * is the right trade here — names, domains and ARR change on the order of weeks,
 * and the alternative is a second copy of the PostHog credentials on disk.
 */

interface CacheFile {
  accounts: Account[]
  fetchedAt: string
}

export interface Book {
  accounts: Account[]
  fetchedAt: string | null
}

export function readBook(config: Config): Book {
  const path = join(userDataDir(), `accounts-${encodeURIComponent(config.email)}.json`)
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as CacheFile
    return { accounts: parsed.accounts ?? [], fetchedAt: parsed.fetchedAt ?? null }
  } catch {
    // An empty book rather than a throw: "you have not synced yet" is a state
    // the tools can describe, and it reads better than a stack trace about a
    // missing file whose path the reader has never heard of.
    return { accounts: [], fetchedAt: null }
  }
}

export class UnknownAccountError extends Error {
  constructor(query: string, accounts: Account[]) {
    const known = accounts.map((a) => a.orgName).sort()
    super(
      `No account matches "${query}". ` +
        (known.length === 0
          ? 'The account book is empty — open CSM OS and let it sync once, then try again.'
          : `Your book is: ${known.join(', ')}.`)
    )
    this.name = 'UnknownAccountError'
  }
}

/**
 * An account from whatever the caller called it.
 *
 * Tools take names because that is what a person says, and an id would mean a
 * lookup call before every real one. Three ways in, cheapest first: the org id
 * itself, an exact name, then the same fuzzy matcher the to-do composer uses to
 * link a to-do from its own words — so "US Mobile", "us-mobile" and "USMobile"
 * all land on the same account, and an ambiguous guess is refused rather than
 * picked.
 */
export function resolveAccount(book: Book, query: string): Account {
  const trimmed = query.trim()
  if (!trimmed) throw new UnknownAccountError(query, book.accounts)

  const byId = book.accounts.find((a) => a.orgId === trimmed)
  if (byId) return byId

  const lower = trimmed.toLowerCase()
  const exact = book.accounts.find((a) => a.orgName.toLowerCase() === lower)
  if (exact) return exact

  const match = matchAccount(buildAccountIndex(book.accounts), trimmed)
  const fuzzy = match && book.accounts.find((a) => a.orgId === match.orgId)
  if (fuzzy) return fuzzy

  throw new UnknownAccountError(query, book.accounts)
}
