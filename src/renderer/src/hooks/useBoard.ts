import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Account } from '../../../shared/types'
import {
  MAX_COLUMNS,
  MIN_COLUMNS,
  cadenceBucketOf,
  layoutDef,
  type Stage
} from '../lib/layouts'
import { daysSince } from '../lib/format'
import type { CardColor } from '../lib/colors'
import type { ContactChannel } from '../lib/channels'
import {
  loadColumns,
  loadStages,
  loadPlacements,
  loadCardProps,
  loadLastTouches,
  ensureCards,
  reconcilePlacements,
  movePlacement,
  renameStage,
  addStage,
  deleteStage,
  reorderStages,
  setCardColor,
  setCardChannel,
  accountPositionFor,
  type Placement
} from '../lib/board'

export interface Card {
  account: Account
  stageKey: string
  position: number
  lastTouchedAt: string | null
  color: CardColor | null
  channel: ContactChannel | null
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
  /** Re-reads placements, columns, touches and card props. Not PostHog. */
  reloadFromSupabase: () => void
  move: (orgId: string, toStageKey: string, toIndex: number) => Promise<void>
  rename: (stageKey: string, label: string) => Promise<void>
  addColumn: (label: string) => Promise<void>
  deleteColumn: (stageKey: string) => Promise<void>
  reorderColumns: (orderedKeys: string[]) => Promise<void>
  canAddColumn: boolean
  canDeleteColumn: boolean
  /**
   * Columns come from the data, not from `board_placements`. Nothing structural
   * can be edited, and a drop has to change the underlying fact instead of a
   * position — see `Board`'s cadence branch.
   */
  computed: boolean
  setColor: (orgId: string, color: CardColor | null) => Promise<void>
  setChannel: (orgId: string, channel: ContactChannel | null) => Promise<void>
  /**
   * Adopts a new most-recent-touch date for one account. The account panel owns
   * the touch log itself and reports the recomputed latest date here, so adding,
   * editing, or deleting a touch all move the card's counter the same way.
   */
  setLastTouch: (orgId: string, occurredAt: string | null) => void
}

export function useBoard(email: string, layoutKey: string): BoardState {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [colors, setColors] = useState<Record<string, CardColor>>({})
  const [channels, setChannels] = useState<Record<string, ContactChannel>>({})
  const [lastTouches, setLastTouches] = useState<Record<string, string>>({})
  const [stages, setStages] = useState<Stage[]>([])
  const [placements, setPlacements] = useState<Placement[]>([])

  /** Whether this layout's columns come from the data rather than from drops. */
  const computed = layoutDef(layoutKey).computed === true

  /*
   * Bumped to re-read everything this board derives from Supabase. A counter in
   * the effect's deps rather than a second copy of the loader: the effect
   * already knows how to run again — it does so on every layout change — so
   * this reuses that path instead of adding one that could drift from it.
   */
  const [revision, setRevision] = useState(0)
  const reloadFromSupabase = useCallback(() => setRevision((r) => r + 1), [])

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

        // A board_cards row must exist before a colour or channel can be
        // stored on it.
        await ensureCards(email, fetched)
        const [cardProps, touchMap] = await Promise.all([
          loadCardProps(email),
          loadLastTouches(email)
        ])

        if (!alive.current) return
        setAccounts(fetched)
        setColors(cardProps.colors)
        setChannels(cardProps.channels)
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
        /*
         * A computed layout has no rows to fetch. Skipping the round trip is the
         * small win; the real one is not calling `reconcilePlacements`, which
         * would otherwise write a placement per account per sync for a layout
         * that never reads them back.
         */
        if (computed) {
          const rule = await loadColumns(email, layoutKey)
          if (cancelled || !alive.current) return
          setStages(rule)
          setPlacements([])
          return
        }

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
  }, [email, layoutKey, accounts, computed, revision])

  const columns = useMemo<Column[]>(() => {
    if (computed) {
      /*
       * Bucketed by last contact, and sorted most stale first inside each
       * column so the card nearest to needing attention sits at the top. There
       * is no `position` to honour here — the data decides both which column a
       * card is in and where it sits in it.
       */
      return stages.map((stage) => ({
        stage,
        cards: accounts
          .map((a) => ({
            account: a,
            stageKey: cadenceBucketOf(daysSince(lastTouches[a.orgId] ?? null)),
            position: 0,
            lastTouchedAt: lastTouches[a.orgId] ?? null,
            color: colors[a.orgId] ?? null,
            channel: channels[a.orgId] ?? null
          }))
          .filter((c) => c.stageKey === stage.key)
          .sort((x, y) => (x.lastTouchedAt ?? '').localeCompare(y.lastTouchedAt ?? ''))
      }))
    }

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
            color: colors[a.orgId] ?? null,
            channel: channels[a.orgId] ?? null
          }
        })
        .sort((x, y) => x.position - y.position)
    }))
  }, [accounts, placements, stages, lastTouches, colors, channels, computed])

  const move = useCallback(
    async (orgId: string, toStageKey: string, toIndex: number) => {
      /*
       * A computed layout has no placement to write — the column a card sits in
       * is a fact about its touch log. `Board` routes drops there to the touch
       * dialog instead, and this guard is the backstop so a stray call cannot
       * write a placement row the board will never read.
       */
      if (computed) return

      const target = columns.find((c) => c.stage.key === toStageKey)
      if (!target) return

      // Shared with the MCP server, so a card placed by an agent lands by the
      // same arithmetic as one placed by a drag.
      const position = accountPositionFor(placements, orgId, toStageKey, toIndex)

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

  const setChannel = useCallback(
    async (orgId: string, channel: ContactChannel | null) => {
      const previous = channels
      setChannels((prev) => {
        const next = { ...prev }
        if (channel) next[orgId] = channel
        else delete next[orgId]
        return next
      })
      try {
        await setCardChannel(email, orgId, channel)
      } catch (err) {
        if (!alive.current) return
        setChannels(previous)
        setError(err instanceof Error ? err.message : 'Could not change the contact channel.')
      }
    },
    [channels, email]
  )

  const setLastTouch = useCallback((orgId: string, occurredAt: string | null) => {
    setLastTouches((prev) => {
      if ((prev[orgId] ?? null) === occurredAt) return prev
      const next = { ...prev }
      if (occurredAt) next[orgId] = occurredAt
      else delete next[orgId]
      return next
    })
  }, [])

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
    reloadFromSupabase,
    move,
    rename,
    addColumn,
    deleteColumn,
    reorderColumns,
    // Both false on a computed layout: its columns are a rule, not a list.
    canAddColumn: !computed && stages.length < MAX_COLUMNS,
    canDeleteColumn: !computed && stages.length > MIN_COLUMNS,
    computed,
    setColor,
    setChannel,
    setLastTouch
  }
}
