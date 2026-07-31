import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'

/**
 * The PostHog personal API key, encrypted at rest by the OS keychain via
 * Electron's safeStorage. It is deliberately never sent to the renderer —
 * only the main process reads it, and only to sign PostHog requests.
 */

const keyPath = () => join(app.getPath('userData'), 'posthog.key')

export function hasKey(): boolean {
  return existsSync(keyPath())
}

export function readKey(): string | null {
  if (!hasKey()) return null
  try {
    const blob = readFileSync(keyPath())
    return safeStorage.decryptString(blob)
  } catch {
    // A failed decrypt means the keychain entry no longer matches this machine
    // or user. Drop it so the app falls back to asking for the key again.
    clearKey()
    return null
  }
}

export function writeKey(key: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS keychain is unavailable, so the API key cannot be stored securely.')
  }
  writeFileSync(keyPath(), safeStorage.encryptString(key), { mode: 0o600 })
}

export function clearKey(): void {
  rmSync(keyPath(), { force: true })
}
