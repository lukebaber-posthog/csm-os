/**
 * The two top-level views the header pill switches between. The accounts board
 * is where the book of business lives; to-dos are your own work.
 */

export const MAIN_VIEWS = ['accounts', 'todos'] as const
export type MainView = (typeof MAIN_VIEWS)[number]

export const VIEW_LABELS: Record<MainView, string> = {
  accounts: 'Accounts',
  todos: 'To-dos'
}

/**
 * Guards the value read back out of localStorage — the one place an
 * unvalidated string enters the app. (`csm-os:layout` gets away without a guard
 * only because `layoutDef()` silently falls back; a view key has no equivalent.)
 */
export function isMainView(value: unknown): value is MainView {
  return typeof value === 'string' && (MAIN_VIEWS as readonly string[]).includes(value)
}
