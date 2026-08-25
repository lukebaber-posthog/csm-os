import { contextBridge, ipcRenderer } from 'electron'
import type { AccountsPayload, PostHogIdentity, Result } from '../shared/types.js'

/**
 * The entire surface the renderer gets. Notably absent: anything that returns
 * the PostHog API key. The renderer can connect and disconnect, but never read.
 */
const api = {
  posthog: {
    status: (): Promise<Result<{ connected: boolean; identity: PostHogIdentity | null }>> =>
      ipcRenderer.invoke('posthog:status'),
    connect: (key: string): Promise<Result<PostHogIdentity>> =>
      ipcRenderer.invoke('posthog:connect', key),
    disconnect: (): Promise<Result<null>> => ipcRenderer.invoke('posthog:disconnect')
  },
  accounts: {
    fetch: (email: string): Promise<Result<AccountsPayload>> =>
      ipcRenderer.invoke('accounts:fetch', email)
  },
  files: {
    /** Resolves to the chosen path, or null if the save dialog was dismissed. */
    saveText: (fileName: string, contents: string): Promise<Result<string | null>> =>
      ipcRenderer.invoke('files:saveText', { fileName, contents })
  },
  menu: {
    /**
     * Fires when the Settings menu item is chosen. Returns its own unsubscribe,
     * because the renderer must be able to detach on unmount — `removeAllListeners`
     * would be a footgun the moment a second listener exists.
     */
    onOpenSettings: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('menu:settings', handler)
      return () => {
        ipcRenderer.removeListener('menu:settings', handler)
      }
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type BridgeApi = typeof api
