import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addTodo,
  completeTodo,
  deleteTodo,
  loadTodos,
  loadTodosDoneToday,
  moveTodo,
  todoPositionFor,
  uncompleteTodo,
  updateTodo,
  POSITION_STEP,
  type Todo,
  type TodoValues
} from '../lib/board'
import { todayInput } from '../lib/format'
import {
  BUCKET_LABELS,
  TODO_BUCKETS,
  normalizeTodoValues,
  type TodoBucket
} from '../lib/todos'

/** One of the three fixed columns, with its open to-dos in position order. */
export interface TodoColumn {
  bucket: TodoBucket
  label: string
  todos: Todo[]
}

/** Writes that a form drives resolve to false when they failed, so the draft stays. */
export interface TodoBoardState {
  columns: TodoColumn[]
  /** Today's completions, newest first. Its length is the rail's count. */
  doneToday: Todo[]
  openCount: number
  loading: boolean
  error: string | null
  /** Re-reads everything. The only way back from a failed initial load. */
  reload: () => Promise<void>
  add: (values: TodoValues) => Promise<boolean>
  save: (id: string, values: TodoValues) => Promise<boolean>
  move: (id: string, toBucket: TodoBucket, toIndex: number) => Promise<void>
  complete: (id: string) => Promise<void>
  undo: (id: string) => Promise<void>
  /**
   * Puts a completed to-do back. Takes the whole row, not an id, because the
   * completed list can surface something finished days ago that the board never
   * loaded — `undo` looks the row up in local state and would find nothing.
   */
  restore: (todo: Todo) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
}

/** Local midnight for a yyyy-mm-dd key, as epoch millis. */
function dayStartMs(dayKey: string): number {
  return new Date(`${dayKey}T00:00:00`).getTime()
}


/** The tail of a bucket, counting archived rows so a reclaimed slot isn't reused. */
function tailOf(all: Todo[], bucket: TodoBucket, excludeId?: string): number {
  return all
    .filter((t) => t.bucket === bucket && t.id !== excludeId)
    .reduce((max, t) => Math.max(max, t.position), 0)
}

/**
 * The to-do board's state machine.
 *
 * One flat array holds both open and completed-today rows; `columns` and
 * `doneToday` are derived from it. That is `useBoard`'s shape, and it is what
 * makes complete and undo one-field patches on one array.
 *
 * Every mutation is optimistic, and every one of them reads through a ref rather
 * than through render scope. That is deliberate: a callback that closes over the
 * `todos` array snapshots it, so two mutations in flight at once would compute
 * against stale data, and — worse — a rollback would restore the whole snapshot
 * and silently discard any unrelated change that landed meanwhile. Rollbacks here
 * revert one row, functionally.
 */
export function useTodos(email: string): TodoBoardState {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /*
   * The local day, refreshed on a timer and whenever the window comes back. The
   * "done today" window has to move with the actual day: without this, a session
   * left open past midnight keeps counting yesterday's work, and the rail's
   * counter is visibly wrong the next morning. Setting the same string is a no-op
   * for React, so the interval costs nothing on the 1439 minutes it doesn't fire.
   */
  const [dayKey, setDayKey] = useState(() => todayInput())
  useEffect(() => {
    const check = () => setDayKey(todayInput())
    const timer = setInterval(check, 60_000)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  // Guards against a slow read landing after the user has signed out.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  /*
   * State and ref move together, synchronously, so a second mutation in the same
   * tick reads what the first just wrote. An effect-synced ref would lag by a
   * render and reintroduce exactly the staleness this exists to remove.
   */
  const todosRef = useRef<Todo[]>([])
  const applyTodos = useCallback((fn: (prev: Todo[]) => Todo[]) => {
    todosRef.current = fn(todosRef.current)
    setTodos(todosRef.current)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const from = new Date(dayStartMs(todayInput())).toISOString()
      const [open, done] = await Promise.all([
        loadTodos(email),
        loadTodosDoneToday(email, from)
      ])
      if (!alive.current) return
      applyTodos(() => [...open, ...done])
    } catch (err) {
      if (!alive.current) return
      setError(err instanceof Error ? err.message : 'Could not load your to-dos.')
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [applyTodos, email])

  useEffect(() => {
    void load()
  }, [load])

  const columns = useMemo<TodoColumn[]>(
    () =>
      TODO_BUCKETS.map((bucket) => ({
        bucket,
        label: BUCKET_LABELS[bucket],
        todos: todos
          .filter((t) => !t.completedAt && t.bucket === bucket)
          .sort((a, b) => a.position - b.position)
      })),
    [todos]
  )

  const sinceMs = useMemo(() => dayStartMs(dayKey), [dayKey])

  /*
   * Compared as epoch millis, NOT as strings. The two sources disagree on format:
   * an optimistic local completion is `toISOString()` ("…T07:00:00.000Z") while a
   * row read back through PostgREST carries a numeric offset and trims trailing
   * zeros from the fraction ("…T07:00:00+00:00"). Lexically '+' sorts before '.',
   * so a string compare can drop a row that is genuinely inside the window.
   */
  const doneToday = useMemo(
    () =>
      todos
        .filter((t): t is Todo & { completedAt: string } => t.completedAt !== null)
        .map((t) => ({ todo: t, at: new Date(t.completedAt).getTime() }))
        .filter((x) => x.at >= sinceMs)
        .sort((a, b) => b.at - a.at)
        .map((x) => x.todo),
    [todos, sinceMs]
  )

  const openCount = useMemo(() => todos.filter((t) => !t.completedAt).length, [todos])

  /** Applies a patch immediately, then persists, reverting just that row on failure. */
  const commit = useCallback(
    async (
      mutate: (prev: Todo[]) => Todo[],
      revert: (prev: Todo[]) => Todo[],
      write: () => Promise<void>,
      fallback: string
    ): Promise<boolean> => {
      setError(null)
      applyTodos(mutate)
      try {
        await write()
        return true
      } catch (err) {
        if (!alive.current) return false
        applyTodos(revert)
        setError(err instanceof Error ? err.message : fallback)
        return false
      }
    },
    [applyTodos]
  )

  /** Reverts one row to how it was, leaving every other change alone. */
  const revertRow = (row: Todo) => (prev: Todo[]) =>
    prev.map((t) => (t.id === row.id ? row : t))

  const add = useCallback(
    async (raw: TodoValues): Promise<boolean> => {
      const values = normalizeTodoValues(raw)
      if (!values.title.trim()) return false
      setError(null)
      try {
        // Pessimistic, deliberately: the id is server-generated, and a row
        // inserted under a fake id would be draggable before it exists.
        const created = await addTodo(email, values, todosRef.current)
        if (!alive.current) return true
        applyTodos((prev) => [...prev, created])
        return true
      } catch (err) {
        if (alive.current) {
          setError(err instanceof Error ? err.message : 'Could not add the to-do.')
        }
        return false
      }
    },
    [applyTodos, email]
  )

  const save = useCallback(
    async (id: string, raw: TodoValues): Promise<boolean> => {
      const values = normalizeTodoValues(raw)
      const all = todosRef.current
      const before = all.find((t) => t.id === id)
      if (!before || !values.title.trim()) return false

      // A bucket change moves the row to the tail of its new column. Position
      // travels with the write so the two cannot half-apply.
      const position =
        values.bucket === before.bucket
          ? before.position
          : tailOf(all, values.bucket, id) + POSITION_STEP

      return commit(
        (prev) =>
          prev.map((t) =>
            t.id === id
              ? {
                  ...t,
                  title: values.title.trim(),
                  note: values.note.trim() || null,
                  bucket: values.bucket,
                  kind: values.kind,
                  orgId: values.orgId,
                  position
                }
              : t
          ),
        revertRow(before),
        () => updateTodo(email, id, values, position),
        'Could not save the to-do.'
      )
    },
    [commit, email]
  )

  const move = useCallback(
    async (id: string, toBucket: TodoBucket, toIndex: number) => {
      const all = todosRef.current
      const before = all.find((t) => t.id === id)
      if (!before) return

      // Excluding the dragged row and nudging clear of a collision both live in
      // `todoPositionFor`, so the MCP server places a to-do the same way a drag
      // does rather than reimplementing the arithmetic.
      const position = todoPositionFor(all, id, toBucket, toIndex)

      await commit(
        (prev) => prev.map((t) => (t.id === id ? { ...t, bucket: toBucket, position } : t)),
        revertRow(before),
        () => moveTodo(email, id, toBucket, position),
        'Could not move the to-do.'
      )
    },
    [commit, email]
  )

  /**
   * Soft-archives a to-do. The celebration is fired separately by the board's drop
   * handler and never awaits this: a Supabase round trip is longer than most of
   * the effects, so awaiting would leave the card on screen for a beat and then
   * burst confetti at a position it had already left.
   *
   * Bucket and position are untouched, which is what makes `undo` exact.
   */
  const complete = useCallback(
    async (id: string) => {
      const before = todosRef.current.find((t) => t.id === id)
      if (!before) return
      const completedAt = new Date().toISOString()
      await commit(
        (prev) => prev.map((t) => (t.id === id ? { ...t, completedAt } : t)),
        revertRow(before),
        () => completeTodo(email, id, completedAt),
        'Could not complete the to-do.'
      )
    },
    [commit, email]
  )

  const undo = useCallback(
    async (id: string) => {
      const before = todosRef.current.find((t) => t.id === id)
      if (!before) return
      // The exact mirror of complete. Because bucket and position survived the
      // archive, `columns` recomputes the card into precisely its old slot.
      await commit(
        (prev) => prev.map((t) => (t.id === id ? { ...t, completedAt: null } : t)),
        revertRow(before),
        () => uncompleteTodo(email, id),
        'Could not restore the to-do.'
      )
    },
    [commit, email]
  )

  const restore = useCallback(
    async (todo: Todo): Promise<boolean> => {
      const known = todosRef.current.some((t) => t.id === todo.id)
      return commit(
        (prev) =>
          known
            ? prev.map((t) => (t.id === todo.id ? { ...t, completedAt: null } : t))
            : [...prev, { ...todo, completedAt: null }],
        (prev) =>
          known
            ? prev.map((t) => (t.id === todo.id ? todo : t))
            : prev.filter((t) => t.id !== todo.id),
        () => uncompleteTodo(email, todo.id),
        'Could not restore the to-do.'
      )
    },
    [commit, email]
  )

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const before = todosRef.current.find((t) => t.id === id)
      if (!before) return false
      return commit(
        (prev) => prev.filter((t) => t.id !== id),
        (prev) => (prev.some((t) => t.id === id) ? prev : [...prev, before]),
        () => deleteTodo(email, id),
        'Could not delete the to-do.'
      )
    },
    [commit, email]
  )

  return {
    columns,
    doneToday,
    openCount,
    loading,
    error,
    reload: load,
    add,
    save,
    move,
    complete,
    undo,
    restore,
    remove
  }
}
