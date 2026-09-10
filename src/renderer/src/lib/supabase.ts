import { createClient } from '@supabase/supabase-js'
import { setSupabaseClient } from '../../../core/supabase'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.'
  )
}

/**
 * Board state and the outreach log only. Login is an email allowlist check
 * rather than a Supabase auth session, so persistSession is off.
 */
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

/**
 * Hands the client to `src/core`, which holds the queries but cannot build a
 * client of its own — it is shared with the MCP server, which has no
 * `import.meta.env` to read. `lib/board` imports this module for the side
 * effect, so the registration cannot be missed by a caller that only wants a
 * query.
 */
setSupabaseClient(supabase)
