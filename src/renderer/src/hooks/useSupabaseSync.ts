import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

/** The tables an open board is derived from. All five carry `csm_email`. */
const TABLES = ['touches', 'todos', 'board_placements', 'board_cards', 'board_stages'] as const

/**
 * A batch of writes should cost one reload, not one per row. Long enough to
 * swallow a script logging a touch per account, short enough that a single
 * change still feels immediate.
 */
const DEBOUNCE_MS = 400

/**
 * Reloads the board when its rows change underneath it.
 *
 * Without this the app only sees its own writes: anything the MCP server does
 * is invisible until a manual sync, and worse, an open board holds stale
 * positions, so the next drag would midpoint against numbers that have moved.
 *
 * **It refetches rather than merging the payload.** Realtime hands over the
 * changed row and it is tempting to patch it into state, but both boards are
 * optimistic — every local edit is already applied before the write lands — so
 * merging would mean reconciling an echo of your own change against the version
 * you are already showing, for every table, forever. Refetching reuses the load
 * path that is already correct, and after your own write it resolves to what is
 * on screen anyway.
 *
 * Filtered server-side by `csm_email`. RLS here is permissive, so an unfiltered
 * subscription would stream every CSM's rows to every client.
 */
export function useSupabaseSync(email: string, onChange: () => void): void {
  // Held in a ref so a caller passing an inline arrow does not tear the
  // subscription down and rebuild it on every render.
  const latest = useRef(onChange)
  useEffect(() => {
    latest.current = onChange
  })

  useEffect(() => {
    if (!email) return

    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => latest.current(), DEBOUNCE_MS)
    }

    const channel = supabase.channel(`board:${email}`)
    for (const table of TABLES) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `csm_email=eq.${email}` },
        schedule
      )
    }
    channel.subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [email])
}
