/// <reference types="vite/client" />
import type { BridgeApi } from '../../preload/index'

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /**
   * Optional, unlike the two above: without it cards fall back to monograms
   * rather than failing to start, so it is typed as possibly undefined and
   * `lib/logos.ts` checks for it.
   */
  readonly VITE_PUBLIC_LOGO_DEV_API: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  interface Window {
    api: BridgeApi
  }
}
