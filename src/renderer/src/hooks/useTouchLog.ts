import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addTouch,
  deleteTouch,
  loadTouches,
  updateTouch,
  type Touch,
  type TouchValues
} from '../lib/board'
import { normalizeTouchValues } from '../lib/touchChannels'

/** Writes resolve to false when they failed, so the form can stay open. */
interface TouchLog {
  touches: Touch[]
  loading: boolean
  error: string | null
  add: (values: TouchValues) => Promise<boolean>
  save: (id: string, values: TouchValues) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
}

/**
 * The outreach log for one account: read, add, edit, delete.
 *
 * Every mutation re-reads the list rather than patching it locally. Ordering is
 * by date and an edit can move a row (or change which row is newest), so a
 * re-read is both simpler and the only way to be sure the recomputed
 * most-recent date matches what the board would load on its own.
 */
export function useTouchLog(
  email: string,
  orgId: string,
  /** Told the new most-recent touch date after every change; null when empty. */
  onLatestChange: (orgId: string, occurredAt: string | null) => void
): TouchLog {
  const [touches, setTouches] = useState<Touch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Guards against a slow read landing after the panel has closed.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    loadTouches(email, orgId)
      .then((rows) => active && setTouches(rows))
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [email, orgId])

  /** Runs a write, refreshes the list, and reports the new latest date. */
  const mutate = useCallback(
    async (write: () => Promise<void>): Promise<boolean> => {
      setError(null)
      try {
        await write()
        const rows = await loadTouches(email, orgId)
        if (!alive.current) return true
        setTouches(rows)
        // Rows come back newest first.
        onLatestChange(orgId, rows[0]?.occurredAt ?? null)
        return true
      } catch (err) {
        if (alive.current) {
          setError(err instanceof Error ? err.message : 'Could not save that change.')
        }
        return false
      }
    },
    [email, onLatestChange, orgId]
  )

  /*
   * Both writes normalise on the way through rather than trusting the form.
   * `TouchForm` keeps a typed URL in state across a channel change so flipping
   * to Call and back does not discard it, which makes stripping it downstream of
   * the form the only place it can be done once and hold. Same arrangement as
   * `useTodos` and `normalizeTodoValues`.
   */
  const add = useCallback(
    (values: TouchValues) =>
      mutate(() => addTouch(email, orgId, normalizeTouchValues(values))),
    [email, mutate, orgId]
  )
  const save = useCallback(
    (id: string, values: TouchValues) =>
      mutate(() => updateTouch(id, normalizeTouchValues(values))),
    [mutate]
  )
  const remove = useCallback((id: string) => mutate(() => deleteTouch(id)), [mutate])

  return { touches, loading, error, add, save, remove }
}
