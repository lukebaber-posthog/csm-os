import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBoard } from '../hooks/useBoard'
import { useSupabaseSync } from '../hooks/useSupabaseSync'
import { useTodos } from '../hooks/useTodos'
import type { Theme } from '../hooks/useTheme'
import { DEFAULT_LAYOUT, layoutDef } from '../lib/layouts'
import { loadActiveLayout, setActiveLayout } from '../lib/board'
import {
  loadSorts,
  nextSort,
  saveSorts,
  sortCards,
  sortMapKey,
  type ColumnSort
} from '../lib/columnSort'
import { isMainView, type MainView } from '../lib/views'
import { TopBar } from './TopBar'
import { Board } from './Board'
import { TodoBoard } from './TodoBoard'
import type { TodoAccount } from './TodoCard'
import { CompletionFxLayer } from './CompletionFxLayer'
import { SettingsDialog } from './SettingsDialog'
import { CompletedDialog } from './CompletedDialog'
import { CadenceTouchDialog, type PendingTouch } from './CadenceTouchDialog'
import { AccountDrawer } from './AccountDrawer'
import { AccountSearch, type SearchAccount } from './AccountSearch'
import { Notice } from './ui/Notice'
import { Spinner } from './ui/Spinner'

interface Props {
  email: string
  theme: Theme
  onToggleTheme: () => void
  onSignOut: () => void
}

const LAYOUT_CACHE_KEY = 'csm-os:layout'
const VIEW_CACHE_KEY = 'csm-os:view'

/** The signed-in application: header, the active board, and the account panel. */
export function BoardScreen({ email, theme, onToggleTheme, onSignOut }: Props) {
  // Seeded from localStorage so the board renders immediately, then reconciled
  // against Supabase (which is the cross-machine source of truth).
  const [layoutKey, setLayoutKey] = useState<string>(
    () => localStorage.getItem(LAYOUT_CACHE_KEY) ?? DEFAULT_LAYOUT
  )

  /*
   * The view is localStorage-only, with no Supabase column. A layout is *content*
   * — which arrangement of the book you are working in — so it should follow you
   * between machines. Which of two views is on screen is chrome: syncing it would
   * cost a write per toggle plus a load-time reconcile effect that can flip the
   * whole screen out from under you, which is tolerable for a column set and
   * jarring for a view swap.
   */
  const [view, setView] = useState<MainView>(() => {
    const saved = localStorage.getItem(VIEW_CACHE_KEY)
    return isMainView(saved) ? saved : 'accounts'
  })

  useEffect(() => {
    let active = true
    loadActiveLayout(email)
      .then((stored) => {
        if (!active || !stored) return
        setLayoutKey(stored)
        localStorage.setItem(LAYOUT_CACHE_KEY, stored)
      })
      .catch(() => {
        /* A stale local preference is harmless; the board still works. */
      })
    return () => {
      active = false
    }
  }, [email])

  const changeLayout = useCallback(
    (next: string) => {
      setLayoutKey(next)
      localStorage.setItem(LAYOUT_CACHE_KEY, next)
      void setActiveLayout(email, next)
    },
    [email]
  )

  const changeView = useCallback((next: MainView) => {
    setView(next)
    localStorage.setItem(VIEW_CACHE_KEY, next)
  }, [])

  /*
   * Per-column card order, local like the view for the reasons given in
   * `lib/columnSort` — the hand order it sits on top of is the part that syncs.
   */
  const [sorts, setSorts] = useState(loadSorts)

  const sortOf = useCallback(
    (stageKey: string): ColumnSort => sorts[sortMapKey(layoutKey, stageKey)] ?? 'manual',
    [sorts, layoutKey]
  )

  const cycleSort = useCallback(
    (stageKey: string) => {
      setSorts((prev) => {
        const key = sortMapKey(layoutKey, stageKey)
        const next = { ...prev, [key]: nextSort(prev[key] ?? 'manual') }
        // Hand order is the default, so it needs no entry of its own.
        if (next[key] === 'manual') delete next[key]
        saveSorts(next)
        return next
      })
    },
    [layoutKey]
  )

  const board = useBoard(email, layoutKey)
  /*
   * Loaded unconditionally, beside useBoard. One select of a few dozen rows is not
   * worth a wrapper component to make the hook conditional, and loading both means
   * switching views is instant with no spinner — which is the entire point of a
   * pill rather than a route.
   */
  const todos = useTodos(email)

  /*
   * Writes from outside this window — the MCP server, or the same account open
   * on another machine — land on the board without a manual sync. Deliberately
   * not `board.refresh()`, which re-queries PostHog: only the Supabase-derived
   * half has changed, and the account book has not.
   */
  useSupabaseSync(email, () => {
    board.reloadFromSupabase()
    void todos.revalidate()
  })
  const [openOrgId, setOpenOrgId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [completedOpen, setCompletedOpen] = useState(false)
  /** Set while the cadence board is asking what a dragged card's contact was. */
  const [pendingTouch, setPendingTouch] = useState<PendingTouch | null>(null)

  /*
   * The native Settings item (Cmd+,) and the header button open the same dialog.
   *
   * Optional-chained on purpose: this runs during mount, so against a preload that
   * predates the `menu` bridge an unguarded call throws inside an effect and takes
   * the whole board down with it. Losing the keyboard shortcut is the right failure
   * here — the header button still works.
   */
  useEffect(() => window.api?.menu?.onOpenSettings?.(() => setSettingsOpen(true)), [])

  const openCard = useMemo(() => {
    if (!openOrgId) return null
    for (const col of board.columns) {
      const found = col.cards.find((c) => c.account.orgId === openOrgId)
      if (found) return found
    }
    return null
  }, [openOrgId, board.columns])

  /*
   * The account facts a to-do needs, assembled from what useBoard has already
   * loaded — so linking a to-do to an account costs no extra query, and the to-do
   * inherits that account's card colour.
   */
  const todoAccounts = useMemo<TodoAccount[]>(
    () =>
      board.columns
        .flatMap((col) => col.cards)
        .map((card) => ({
          orgId: card.account.orgId,
          orgName: card.account.orgName,
          domain: card.account.domain,
          color: card.color
        }))
        .sort((a, b) => a.orgName.localeCompare(b.orgName)),
    [board.columns]
  )

  const accountById = useMemo(
    () => new Map(todoAccounts.map((a) => [a.orgId, a])),
    [todoAccounts]
  )

  /*
   * Flattened from the columns rather than from `accounts`, so the palette holds
   * whatever the board is currently showing — which is every account under both
   * layouts, since each one has exactly one column in either.
   */
  const searchAccounts = useMemo<SearchAccount[]>(
    () =>
      board.columns
        .flatMap((col) => col.cards)
        .map((card) => ({
          orgId: card.account.orgId,
          orgName: card.account.orgName,
          domain: card.account.domain,
          lastTouchedAt: card.lastTouchedAt
        })),
    [board.columns]
  )

  /*
   * Sorting happens here rather than inside Board, so the array Board does its
   * drop-index arithmetic against is the same one the user is looking at.
   */
  const sortedColumns = useMemo(
    () =>
      board.columns.map((col) => ({ ...col, cards: sortCards(col.cards, sortOf(col.stage.key)) })),
    [board.columns, sortOf]
  )

  const onAccounts = view === 'accounts'

  return (
    <div className="flex h-full flex-col bg-[var(--color-page)]">
      <TopBar
        email={email}
        accountCount={board.accountCount}
        fetchedAt={board.fetchedAt}
        syncing={board.syncing}
        theme={theme}
        layoutKey={layoutKey}
        view={view}
        openTodoCount={todos.openCount}
        doneTodayCount={todos.doneToday.length}
        onViewChange={changeView}
        onLayoutChange={changeLayout}
        onToggleTheme={onToggleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
        // Sync renders in both views, so it must refresh both. Without the
        // second call it looked like the obvious way to recover a to-do board
        // that failed to load, and did nothing for it.
        onRefresh={() => {
          void board.refresh()
          void todos.reload()
        }}
        onSignOut={onSignOut}
      />

      {/*
        Each view surfaces its own failures. Note board.error still gets set by
        useBoard while you are in the to-do view — a background sync failure — and
        appears when you switch back, which is correct: useBoard is never unmounted
        by the switch.
      */}
      {((onAccounts && (board.error || board.fromCache)) || (!onAccounts && todos.error)) && (
        <div className="space-y-2 px-6 pt-4">
          {onAccounts ? (
            <>
              {board.error && <Notice tone="error">{board.error}</Notice>}
              {board.fromCache && !board.error && (
                <Notice>
                  PostHog was unreachable, so this is the last synced copy of your book. Drag
                  and logging still work and save normally.
                </Notice>
              )}
            </>
          ) : (
            <Notice tone="error">{todos.error}</Notice>
          )}
        </div>
      )}

      <main
        id="view-panel"
        role="tabpanel"
        aria-labelledby={`view-tab-${view}`}
        className="flex min-h-0 flex-1 flex-col pt-4"
      >
        {/*
          Every gate below is scoped to its own view. The empty-book one especially:
          unscoped, `accountCount === 0` short-circuits this whole element, so a CSM
          with nothing assigned could never reach their to-dos at all.
        */}
        {onAccounts ? (
          board.loading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner label={`Loading the ${layoutDef(layoutKey).label.toLowerCase()} board…`} />
            </div>
          ) : board.accountCount === 0 && !board.error ? (
            <div className="flex flex-1 items-center justify-center px-6">
              <p className="max-w-sm text-center text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
                No accounts have {email} as their CSM in Customer Analytics. If that looks
                wrong, check the CSM relationship on the accounts in{' '}
                <code className="font-mono text-[12px]">system.account_relationships</code>.
              </p>
            </div>
          ) : (
            <Board
              columns={sortedColumns}
              onOpenAccount={setOpenOrgId}
              onSetColor={board.setColor}
              onSetChannel={board.setChannel}
              onRename={board.rename}
              onMove={board.move}
              onAddColumn={board.addColumn}
              onDeleteColumn={board.deleteColumn}
              onReorderColumns={board.reorderColumns}
              canAddColumn={board.canAddColumn}
              canDeleteColumn={board.canDeleteColumn}
              computed={board.computed}
              onRequestTouch={(orgId, stageKey) => {
                const account = board.columns
                  .flatMap((c) => c.cards)
                  .find((c) => c.account.orgId === orgId)?.account
                const stage = board.columns.find((c) => c.stage.key === stageKey)?.stage
                if (!account || !stage) return
                setPendingTouch({
                  orgId,
                  orgName: account.orgName,
                  stageKey,
                  stageLabel: stage.label
                })
              }}
              sortOf={sortOf}
              onCycleSort={cycleSort}
            />
          )
        ) : todos.loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner label="Loading your to-dos…" />
          </div>
        ) : (
          <TodoBoard
            columns={todos.columns}
            accounts={todoAccounts}
            doneTodayCount={todos.doneToday.length}
            onAdd={todos.add}
            onSave={todos.save}
            onMove={todos.move}
            onComplete={todos.complete}
            onUndo={todos.undo}
            onDelete={todos.remove}
            onOpenCompleted={() => setCompletedOpen(true)}
          />
        )}
      </main>

      {openCard && (
        <AccountDrawer
          email={email}
          card={openCard}
          onClose={() => setOpenOrgId(null)}
          onSetChannel={board.setChannel}
          onLatestTouchChange={board.setLastTouch}
        />
      )}

      {/*
        Mounted here rather than inside TodoBoard, so an effect keeps playing if you
        flick back to the accounts view mid-flight.
      */}
      {/*
        Cmd/Ctrl+K anywhere on the accounts board. It opens the same panel a card
        click does, so there is nothing here the board cannot already do — only a
        way to get at it without knowing where the card is.
      */}
      <AccountSearch enabled={onAccounts} accounts={searchAccounts} onPick={setOpenOrgId} />

      <SettingsDialog open={settingsOpen} email={email} onOpenChange={setSettingsOpen} />

      {/*
        Only ever open on the cadence board, where a drop has to become a touch
        before the card can move. Mounted here rather than inside Board so the
        board stays a pure drag surface.
      */}
      <CadenceTouchDialog
        pending={pendingTouch}
        email={email}
        onLogged={board.setLastTouch}
        onClose={() => setPendingTouch(null)}
      />

      <CompletedDialog
        open={completedOpen}
        email={email}
        accountOf={(orgId) => (orgId ? accountById.get(orgId) : undefined)}
        onRestore={todos.restore}
        onOpenChange={setCompletedOpen}
      />

      <CompletionFxLayer />
    </div>
  )
}
