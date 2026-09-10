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

let lastWriteAt = 0

/**
 * The same client, noting that this process is about to change something.
 *
 * Every mutating query in `board.ts` goes through this rather than `db()`, so
 * that a realtime subscriber can tell its own writes from someone else's. It
 * cannot ask the subscription: a `postgres_changes` payload says what changed,
 * never who changed it, so an app that reloads on every event spends the whole
 * time reloading in response to itself.
 *
 * A no-op anywhere nothing is subscribed, which is the MCP server's case.
 */
export function write(): SupabaseClient {
  lastWriteAt = Date.now()
  return db()
}

/** Milliseconds since this process last wrote, or Infinity if it never has. */
export function msSinceLocalWrite(): number {
  return lastWriteAt === 0 ? Infinity : Date.now() - lastWriteAt
}
