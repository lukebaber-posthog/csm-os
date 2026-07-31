import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Account, TouchChannel } from '../../../shared/types'
import { MAX_COLUMNS, MIN_COLUMNS, type Stage } from '../lib/layouts'
import type { CardColor } from '../lib/colors'
import {
  loadStages,
  loadPlacements,
  loadCardColors,
  loadLastTouches,
  ensureCards,
  reconcilePlacements,
  movePlacement,
  renameStage,
  addStage,
  deleteStage,
  reorderStages,
  addTouch,
  setCardColor,
  POSITION_STEP,
  type Placement
} from '../lib/board'

export interface Card {
  account: Account
  stageKey: string
  position: number
  lastTouchedAt: string | null
  color: CardColor | null
}

export interface Column {
  stage: Stage
  cards: Card[]
}

interface BoardState {
  columns: Column[]
  loading: boolean
  syncing: boolean
  error: string | null
  fetchedAt: string | null
  fromCache: boolean
  accountCount: number
  refresh: () => Promise<void>
  move: (orgId: string, toStageKey: string, toIndex: number) => Promise<void>
  rename: (stageKey: string, label: string) => Promise<void>
  addColumn: (label: string) => Promise<void>
  deleteColumn: (stageKey: string) => Promise<void>
  reorderColumns: (orderedKeys: string[]) => Promise<void>
  canAddColumn: boolean
  canDeleteColumn: boolean
  setColor: (orgId: string, color: CardColor | null) => Promise<void>
  logTouch: (
    orgId: string,
    channel: TouchChannel,
    note: string,
    occurredAt: string
  ) => Promise<void>
}

/**
 * Decides the float position a card should take when dropped at `toIndex`
 * within `siblings` (which must already exclude the card being moved).
 * Midpointing between neighbours means a drop rewrites one row, not the column.
 */
function positionFor(siblings: Card[], toIndex: number): number {
  const prev = siblings[toIndex - 1]
  const next = siblings[toIndex]
  if (!prev && !next) return POSITION_STEP
  if (!prev) return next.position - POSITION_STEP
  if (!next) return prev.position + POSITION_STEP
  return (prev.position + next.position) / 2
}

export function useBoard(email: string, layoutKey: string): BoardState {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [colors, setColors] = useState<Record<string, CardColor>>({})
  const [lastTouches, setLastTouches] = useState<Record<string, string>>({})
  const [stages, setStages] = useState<Stage[]>([])
  const [placements, setPlacements] = useState<Placement[]>([])

  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [loadingLayout, setLoadingLayout] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [fromCache, setFromCache] = useState(false)

  // Guards against a slow load landing after the user has signed out.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  /** Account data and anything shared across layouts. */
  const loadAccounts = useCallback(
    async (isInitial: boolean) => {
      if (isInitial) setLoadingAccounts(true)
      else setSyncing(true)
      setError(null)

      try {
        const result = await window.api.accounts.fetch(email)
        if (!result.ok) throw new Error(result.error)
        const { accounts: fetched, fetchedAt: at, fromCache: cached } = result.data

        // A board_cards row must exist before a colour can be stored on it.
        await ensureCards(email, fetched)
        const [colorMap, touchMap] = await Promise.all([
          loadCardColors(email),
          loadLastTouches(email)
        ])

        if (!alive.current) return
        setAccounts(fetched)
        setColors(colorMap)
        setLastTouches(touchMap)
        setFetchedAt(at)
        setFromCache(cached)
      } catch (err) {
        if (!alive.current) return
        setError(err instanceof Error ? err.message : 'Could not load your accounts.')
      } finally {
        if (alive.current) {
          setLoadingAccounts(false)
          setSyncing(false)
        }
      }
    },
    [email]
  )

  useEffect(() => {
    void loadAccounts(true)
  }, [loadAccounts])

  /** Columns and placements for the active layout only. */
  useEffect(() => {
    let cancelled = false

    async function run() {
      setLoadingLayout(true)
      try {
        const [stageRows, existing] = await Promise.all([
          loadStages(email, layoutKey),
          loadPlacements(email, layoutKey)
        ])
        // Reconcile so accounts new to this layout get a card immediately.
        const reconciled = accounts.length
          ? await reconcilePlacements(email, layoutKey, accounts, existing)
          : existing

        if (cancelled || !alive.current) return
        setStages(stageRows)
        setPlacements(reconciled)
      } catch (err) {
        if (cancelled || !alive.current) return
        setError(err instanceof Error ? err.message : 'Could not load the board.')
      } finally {
        if (!cancelled && alive.current) setLoadingLayout(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [email, layoutKey, accounts])

  const columns = useMemo<Column[]>(() => {
    const placed = new Map(placements.map((p) => [p.orgId, p]))

    return stages.map((stage) => ({
      stage,
      cards: accounts
        .filter((a) => placed.get(a.orgId)?.stageKey === stage.key)
        .map((a) => {
          const p = placed.get(a.orgId)!
          return {
            account: a,
            stageKey: p.stageKey,
            position: p.position,
            lastTouchedAt: lastTouches[a.orgId] ?? null,
            color: colors[a.orgId] ?? null
          }
        })
        .sort((x, y) => x.position - y.position)
    }))
  }, [accounts, placements, stages, lastTouches, colors])

  const move = useCallback(
    async (orgId: string, toStageKey: string, toIndex: number) => {
      const target = columns.find((c) => c.stage.key === toStageKey)
      if (!target) return

      const siblings = target.cards.filter((c) => c.account.orgId !== orgId)
      const position = positionFor(siblings, toIndex)

      // Optimistic: the card lands instantly, then we persist.
      const previous = placements
      setPlacements((prev) =>
        prev.map((p) => (p.orgId === orgId ? { ...p, stageKey: toStageKey, position } : p))
      )

      try {
        await movePlacement(email, layoutKey, orgId, toStageKey, position)
      } catch (err) {
        if (!alive.current) return
        setPlacements(previous)
        setError(err instanceof Error ? err.message : 'Could not move the card.')
      }
    },
    [columns, email, layoutKey, placements]
  )

  const rename = useCallback(
    async (stageKey: string, label: string) => {
      const trimmed = label.trim()
      if (!trimmed) return
      const previous = stages
      setStages((prev) => prev.map((s) => (s.key === stageKey ? { ...s, label: trimmed } : s)))
      try {
        await renameStage(email, layoutKey, stageKey, trimmed)
      } catch (err) {
        if (!alive.current) return
        setStages(previous)
        setError(err instanceof Error ? err.message : 'Could not rename the column.')
      }
    },
    [email, layoutKey, stages]
  )

  const addColumn = useCallback(
    async (label: string) => {
      const trimmed = label.trim()
      if (!trimmed || stages.length >= MAX_COLUMNS) return
      try {
        const created = await addStage(email, layoutKey, trimmed, stages)
        if (!alive.current) return
        setStages((prev) => [...prev, created])
      } catch (err) {
        if (!alive.current) return
        setError(err instanceof Error ? err.message : 'Could not add the column.')
      }
    },
    [email, layoutKey, stages]
  )

  const deleteColumn = useCallback(
    async (stageKey: string) => {
      if (stages.length <= MIN_COLUMNS) return
      const remaining = stages.filter((s) => s.key !== stageKey)
      const fallback = remaining[0]?.key
      if (!fallback) return

      const previousStages = stages
      const previousPlacements = placements

      // Optimistic: drop the column and rehome its cards, mirroring what the
      // delete_board_stage RPC does server-side.
      setStages(remaining.map((s, i) => ({ ...s, position: i })))
      setPlacements((prev) =>
        prev.map((p) => (p.stageKey === stageKey ? { ...p, stageKey: fallback } : p))
      )

      try {
        await deleteStage(email, layoutKey, stageKey)
      } catch (err) {
        if (!alive.current) return
        setStages(previousStages)
        setPlacements(previousPlacements)
        setError(err instanceof Error ? err.message : 'Could not delete the column.')
      }
    },
    [email, layoutKey, placements, stages]
  )

  const reorderColumns = useCallback(
    async (orderedKeys: string[]) => {
      const byKey = new Map(stages.map((s) => [s.key, s]))
      if (orderedKeys.length !== stages.length || orderedKeys.some((k) => !byKey.has(k))) return

      const previous = stages
      setStages(orderedKeys.map((k, i) => ({ ...byKey.get(k)!, position: i })))
      try {
        await reorderStages(email, layoutKey, orderedKeys)
      } catch (err) {
        if (!alive.current) return
        setStages(previous)
        setError(err instanceof Error ? err.message : 'Could not reorder the columns.')
      }
    },
    [email, layoutKey, stages]
  )

  const setColor = useCallback(
    async (orgId: string, color: CardColor | null) => {
      const previous = colors
      setColors((prev) => {
        const next = { ...prev }
        if (color) next[orgId] = color
        else delete next[orgId]
        return next
      })
      try {
        await setCardColor(email, orgId, color)
      } catch (err) {
        if (!alive.current) return
        setColors(previous)
        setError(err instanceof Error ? err.message : 'Could not change the card colour.')
      }
    },
    [colors, email]
  )

  const logTouch = useCallback(
    async (orgId: string, channel: TouchChannel, note: string, occurredAt: string) => {
      try {
        await addTouch(email, orgId, channel, note, occurredAt)
        if (!alive.current) return
        // Only advance the counter when this touch is the most recent one.
        setLastTouches((prev) => {
          const current = prev[orgId]
          if (current && new Date(current) > new Date(occurredAt)) return prev
          return { ...prev, [orgId]: occurredAt }
        })
      } catch (err) {
        if (!alive.current) return
        setError(err instanceof Error ? err.message : 'Could not log the touch.')
      }
    },
    [email]
  )

  const refresh = useCallback(() => loadAccounts(false), [loadAccounts])

  return {
    columns,
    loading: loadingAccounts || loadingLayout,
    syncing,
    error,
    fetchedAt,
    fromCache,
    accountCount: accounts.length,
    refresh,
    move,
    rename,
    addColumn,
    deleteColumn,
    reorderColumns,
    canAddColumn: stages.length < MAX_COLUMNS,
    canDeleteColumn: stages.length > MIN_COLUMNS,
    setColor,
    logTouch
  }
}
