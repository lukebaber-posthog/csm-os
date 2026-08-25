/**
 * User preferences, persisted locally.
 *
 * A tiny external store rather than React context, for the same reason the
 * completion effects use one: the writer (the settings dialog) and the reader (the
 * effect layer, mounted at the app root) sit in different branches of the tree,
 * and routing a provider around both to carry one boolean is more machinery than
 * the boolean is worth.
 */

const KEY = 'csm-os:settings'

export interface Settings {
  /** Five seconds of confetti across the whole window on every completion. */
  megaConfetti: boolean
}

const DEFAULTS: Settings = { megaConfetti: false }

function read(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<Settings>
    // Field by field, so a stored blob from an older shape cannot introduce a
    // non-boolean and put the toggle into a third state.
    return { megaConfetti: parsed.megaConfetti === true }
  } catch {
    // A corrupt preference should never stop the app opening.
    return DEFAULTS
  }
}

let current: Settings = read()
const listeners = new Set<() => void>()

/** Stable snapshot for useSyncExternalStore: replaced on write, never mutated. */
export function getSettings(): Settings {
  return current
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  if (current[key] === value) return
  current = { ...current, [key]: value }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Preferences are a convenience; failing to persist is not worth surfacing.
  }
  for (const listener of listeners) listener()
}
