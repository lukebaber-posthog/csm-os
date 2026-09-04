import type { Account, AccountsPayload, PostHogIdentity, Result } from '../../../shared/types'

/**
 * A stand-in for the preload bridge, so the board renders in a plain browser tab.
 *
 * The point is reviewing and annotating the UI outside Electron: the dev server
 * hands the interface to any browser, but only the app window gets a preload, so
 * a tab used to stop dead on the first bridge call.
 *
 * **Never reaches production.** The only call site is guarded by
 * `import.meta.env.DEV`, which Vite replaces with `false` in a build, so the
 * dynamic import is dead code and the module is not bundled at all. It also
 * refuses to install over a real bridge, so it can never shadow Electron's.
 *
 * What it does NOT do is fake the UI. Everything the board draws — accounts,
 * colours, channels, touches, to-dos — is the real thing: accounts come from the
 * cache the main process already wrote, and all the rest was always Supabase,
 * which the renderer reaches directly. Only the four bridge calls are stubbed.
 * That matters, because a tab is for judging pixels, and pixels drawn from
 * invented data would be worth nothing.
 */

/** The dev-only endpoint in `electron.vite.config.ts`. */
const ACCOUNTS_URL = '/__dev/accounts'

/**
 * A snapshot pasted into localStorage, used when the endpoint is not there.
 *
 * The endpoint only exists after the dev server has been restarted since the
 * plugin was added, because Vite reads its config once at startup. Until then a
 * request for it falls through to the SPA fallback and returns `index.html` —
 * which is a *200 with HTML*, so nothing throws until `res.json()` hits a `<`
 * and reports "Unexpected token '<'", naming neither the cause nor the fix.
 * This snapshot is the way to have a working board before that restart.
 */
const SNAPSHOT_KEY = 'csm-os:dev-accounts'

interface CacheFile {
  accounts: Account[]
  fetchedAt: string | null
  missing?: boolean
}

/** The snapshot, or null when there isn't a usable one. */
function readSnapshot(): CacheFile | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return null
    const file = JSON.parse(raw) as CacheFile
    return Array.isArray(file.accounts) && file.accounts.length > 0 ? file : null
  } catch {
    return null
  }
}

/**
 * Reads the book from the dev endpoint, falling back to the snapshot.
 *
 * The endpoint is preferred because it re-reads the main process's cache on
 * every call, so it follows a re-sync on its own. The snapshot is frozen at
 * whenever it was pasted.
 */
async function fetchCachedAccounts(email: string): Promise<Result<AccountsPayload>> {
  try {
    const res = await fetch(`${ACCOUNTS_URL}?email=${encodeURIComponent(email)}`)

    /*
     * Content type, not status. A missing endpoint does not 404 here — Vite's
     * SPA fallback answers 200 with `index.html`, so the status is useless as a
     * signal and only the type tells the truth.
     */
    const isJson = res.headers.get('content-type')?.includes('application/json')

    if (!res.ok || !isJson) {
      const snapshot = readSnapshot()
      if (snapshot) return payloadFrom(snapshot)
      return {
        ok: false,
        error:
          'The dev accounts endpoint is not registered, so this tab has no book ' +
          'to draw. Vite reads its config once at startup, so restart `pnpm dev` ' +
          'to pick up the /__dev/accounts plugin. (That restarts the app window too.)'
      }
    }

    const file = (await res.json()) as CacheFile

    if (file.missing || file.accounts.length === 0) {
      const snapshot = readSnapshot()
      if (snapshot) return payloadFrom(snapshot)
      return {
        ok: false,
        error:
          'No cached accounts for this email yet. Open CSM OS in the app window ' +
          'and let it sync once — this browser tab reads the cache that writes.'
      }
    }

    return payloadFrom(file)
  } catch (err) {
    // Network-level failure. The snapshot is still worth trying before giving up.
    const snapshot = readSnapshot()
    if (snapshot) return payloadFrom(snapshot)
    return { ok: false, error: err instanceof Error ? err.message : 'Dev bridge failed.' }
  }
}

function payloadFrom(file: CacheFile): Result<AccountsPayload> {
  return {
    ok: true,
    data: {
      accounts: file.accounts,
      // The cache's own timestamp, so the header's "Synced N ago" tells the
      // truth about how old this book is.
      fetchedAt: file.fetchedAt ?? new Date().toISOString(),
      /*
       * False, though the data did come from a cache. `fromCache: true` paints
       * the "PostHog was unreachable" banner across the top of the board — a
       * strip of UI the real app would not be showing, sitting exactly where
       * someone reviewing the layout is trying to look. The age is already
       * reported honestly by `fetchedAt` above, and the console line on install
       * says where the accounts came from, so nothing is hidden by keeping the
       * pixels identical to the app.
       */
      fromCache: false
    }
  }
}

/**
 * Installs the stub when there is no real bridge. Safe to call unconditionally
 * from the entry point — it no-ops inside Electron.
 */
export function installDevBridge(email: string | null): void {
  if (window.api) return

  const identity: PostHogIdentity = {
    email: email ?? 'dev@localhost',
    firstName: null,
    projectId: 0
  }

  window.api = {
    posthog: {
      // Reports connected so the app opens on the board rather than the
      // "connect your key" screen. There is no key here and there must not be:
      // the key lives in the OS keychain and is reachable only from the main
      // process, which is the whole reason the bridge exists.
      status: async () => ({ ok: true, data: { connected: true, identity } }),
      connect: async () => ({
        ok: false,
        error: 'Connecting a PostHog key needs the app window — the keychain is not reachable from a browser.'
      }),
      disconnect: async () => ({ ok: true, data: null })
    },
    accounts: {
      fetch: (forEmail: string) => fetchCachedAccounts(forEmail)
    },
    files: {
      // A real download rather than a no-op, so the weekly export can be
      // exercised here too. The native save dialog is what is missing, not the
      // document — `lib/exportActivity` is pure and runs fine in a tab.
      saveText: async (fileName: string, contents: string) => {
        const url = URL.createObjectURL(new Blob([contents], { type: 'text/markdown' }))
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        a.click()
        URL.revokeObjectURL(url)
        return { ok: true, data: fileName }
      }
    },
    // No application menu in a tab, so nothing will ever fire this. Returns the
    // same unsubscribe shape so the caller's cleanup stays symmetric.
    menu: { onOpenSettings: () => () => {} }
  }

  // Loud in the console, silent on the page: the whole value of the tab is that
  // it looks exactly like the app, so nothing here draws a badge over the UI a
  // reviewer is trying to judge.
  console.info(
    '[csm-os] No preload bridge — installed the dev browser bridge. Accounts come ' +
      'from the last sync the app window made; the keychain, native save dialog ' +
      'and app menu are stubbed. This never ships.'
  )
}
