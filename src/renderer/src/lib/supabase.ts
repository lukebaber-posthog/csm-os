import { createClient } from '@supabase/supabase-js'

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
