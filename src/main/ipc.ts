import { ipcMain } from 'electron'
import type { AccountsPayload, PostHogIdentity, Result } from '../shared/types.js'
import { hasKey, readKey, writeKey, clearKey } from './secrets.js'
import { fetchAccounts, verifyKey, PostHogError } from './posthog.js'
import { readCache, writeCache } from './cache.js'

/** Wraps a handler so expected failures arrive as data, not as thrown IPC noise. */
function handle<T>(channel: string, fn: (...args: never[]) => Promise<T>): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<Result<T>> => {
    try {
      return { ok: true, data: await fn(...(args as never[])) }
    } catch (err) {
      const message =
        err instanceof PostHogError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Something went wrong.'
      return { ok: false, error: message }
    }
  })
}

export function registerIpc(): void {
  /** Whether a PostHog key is already stored, and who it belongs to. */
  handle('posthog:status', async (): Promise<{ connected: boolean; identity: PostHogIdentity | null }> => {
    const key = readKey()
    if (!key) return { connected: false, identity: null }
    try {
      return { connected: true, identity: await verifyKey(key) }
    } catch {
      // The key is present but no longer valid — report disconnected rather
      // than blocking startup, so the user is prompted to re-enter it.
      return { connected: false, identity: null }
    }
  })

  /** Validates a key before storing it, so a bad key never gets persisted. */
  handle('posthog:connect', async (key: string): Promise<PostHogIdentity> => {
    const trimmed = key.trim()
    if (!trimmed) throw new Error('Paste a PostHog personal API key to continue.')
    const identity = await verifyKey(trimmed)
    writeKey(trimmed)
    return identity
  })

  handle('posthog:disconnect', async (): Promise<null> => {
    clearKey()
    return null
  })

  handle('accounts:fetch', async (email: string): Promise<AccountsPayload> => {
    const key = readKey()
    if (!key) throw new Error('Connect PostHog before loading accounts.')

    try {
      const accounts = await fetchAccounts(key, email)
      const fetchedAt = new Date().toISOString()
      writeCache(email, accounts, fetchedAt)
      return { accounts, fetchedAt, fromCache: false }
    } catch (err) {
      // Fall back to the last good fetch so the board still opens offline.
      const cached = readCache(email)
      if (!cached) throw err
      return { accounts: cached.accounts, fetchedAt: cached.fetchedAt, fromCache: true }
    }
  })

  ipcMain.handle('posthog:hasStoredKey', () => hasKey())
}
