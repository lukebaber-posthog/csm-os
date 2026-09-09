import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin, ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Where the main process keeps its on-device account cache, mirroring
 * Electron's own `app.getPath('userData')` for each platform. Duplicated rather
 * than imported because Vite's config runs outside Electron and cannot ask it.
 */
function userDataDir(): string {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'csm-os')
  if (process.platform === 'win32') return join(process.env.APPDATA ?? homedir(), 'csm-os')
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'csm-os')
}

/**
 * Serves the account cache to a browser tab, for the dev-only browser bridge.
 *
 * The board's accounts normally arrive over the preload bridge, which a browser
 * tab does not have — so opening the dev server outside Electron used to give a
 * dead app. This hands the same book to a plain tab so the UI can be reviewed
 * and annotated in a browser.
 *
 * `apply: 'serve'` keeps it out of every build. It reads the cache the main
 * process already writes on each successful sync, so the browser never needs the
 * PostHog key: run the app once and the tab has real accounts, ARR and all.
 * There is nothing here a packaged build can reach.
 */
function devAccountsEndpoint(): Plugin {
  return {
    name: 'csm-os-dev-accounts',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__dev/accounts', (req, res) => {
        const email = new URL(req.url ?? '', 'http://localhost').searchParams.get('email') ?? ''
        res.setHeader('Content-Type', 'application/json')
        try {
          const file = join(userDataDir(), `accounts-${encodeURIComponent(email)}.json`)
          res.end(readFileSync(file, 'utf8'))
        } catch {
          // A 200 with an empty book, not a 500: "you have not synced in the app
          // yet" is a state the board already renders, and an error status would
          // send the reader hunting for a broken endpoint instead.
          res.end(JSON.stringify({ accounts: [], fetchedAt: null, missing: true }))
        }
      })
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve('src/main/index.ts') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve('src/preload/index.ts') } }
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: {
      alias: { '@': resolve('src/renderer/src') }
    },
    plugins: [react(), tailwindcss(), devAccountsEndpoint()],
    build: {
      rollupOptions: { input: resolve('src/renderer/index.html') }
    }
  }
})
