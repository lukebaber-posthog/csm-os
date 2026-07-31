import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { Account } from '../shared/types.js'

/**
 * On-device cache of the last successful PostHog account fetch, so the board
 * still renders when PostHog is unreachable. This is where ARR lives at rest —
 * on this machine only, never in Supabase.
 */

interface CacheFile {
  accounts: Account[]
  fetchedAt: string
}

const cachePath = (email: string) =>
  join(app.getPath('userData'), `accounts-${encodeURIComponent(email)}.json`)

export function readCache(email: string): CacheFile | null {
  try {
    return JSON.parse(readFileSync(cachePath(email), 'utf8')) as CacheFile
  } catch {
    return null
  }
}

export function writeCache(email: string, accounts: Account[], fetchedAt: string): void {
  const payload: CacheFile = { accounts, fetchedAt }
  writeFileSync(cachePath(email), JSON.stringify(payload), { mode: 0o600 })
}
