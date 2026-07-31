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
  }
}

contextBridge.exposeInMainWorld('api', api)

export type BridgeApi = typeof api
