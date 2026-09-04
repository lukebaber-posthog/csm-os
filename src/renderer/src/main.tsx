import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

/**
 * In a browser tab there is no preload, so a stub bridge goes in before React
 * mounts — `App` reads the bridge in its first effect, and installing after that
 * would lose the race.
 *
 * `import.meta.env.DEV` is a literal Vite substitutes, so in a build this is
 * `if (false)` and the dynamic import is eliminated: the dev bridge is not in
 * the production bundle. Inside Electron it installs nothing — the real bridge
 * is already there and `installDevBridge` refuses to overwrite it.
 *
 * The await is why mounting happens in a function: React must not render until
 * the bridge question is settled either way.
 */
async function start(): Promise<void> {
  if (import.meta.env.DEV) {
    const { installDevBridge } = await import('./lib/devBridge')
    installDevBridge(localStorage.getItem('csm-os:email'))
  }

  createRoot(root as HTMLElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

void start()
