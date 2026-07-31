import type { BridgeApi } from './index.js'

declare global {
  interface Window {
    api: BridgeApi
  }
}
