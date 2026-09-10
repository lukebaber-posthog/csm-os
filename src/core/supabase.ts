import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The Supabase client, supplied by whoever is hosting this code.
 *
 * `src/core` is shared by two processes that get their configuration in
 * completely different ways: the renderer reads `import.meta.env`, which Vite
 * inlines at build time, and the MCP server reads `process.env`, which does not
 * exist in a browser. A module that read either one directly could only ever
 * work in one of them, so the client is handed in instead.
 *
 * A module-level singleton rather than a parameter threaded through forty
 * functions. There is exactly one client per process and it never changes, so
 * passing it to every call would be ceremony that each call site could get
 * wrong.
 */

let client: SupabaseClient | null = null

export function setSupabaseClient(next: SupabaseClient): void {
  client = next
}

/**
 * Throws rather than returning null. Every caller is a query that cannot do
 * anything useful without a client, so the alternative is the same failure one
 * line later with less to say about it.
 */
export function db(): SupabaseClient {
  if (!client) {
    throw new Error(
      'No Supabase client registered. Call setSupabaseClient() before any board query — ' +
        'the renderer does this in lib/supabase.ts, the MCP server in its entry point.'
    )
  }
  return client
}
