import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBoard } from '../hooks/useBoard'
import type { Theme } from '../hooks/useTheme'
import { DEFAULT_LAYOUT, layoutDef } from '../lib/layouts'
import { loadActiveLayout, setActiveLayout } from '../lib/board'
import { TopBar } from './TopBar'
import { Board } from './Board'
import { AccountDrawer } from './AccountDrawer'
import { Notice } from './ui/Notice'
import { Spinner } from './ui/Spinner'

interface Props {
  email: string
  theme: Theme
  onToggleTheme: () => void
  onSignOut: () => void
}

const LAYOUT_CACHE_KEY = 'csm-os:layout'

/** The signed-in application: header, board, and the account detail panel. */
export function BoardScreen({ email, theme, onToggleTheme, onSignOut }: Props) {
  // Seeded from localStorage so the board renders immediately, then reconciled
  // against Supabase (which is the cross-machine source of truth).
  const [layoutKey, setLayoutKey] = useState<string>(
    () => localStorage.getItem(LAYOUT_CACHE_KEY) ?? DEFAULT_LAYOUT
  )

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

  const board = useBoard(email, layoutKey)
  const [openOrgId, setOpenOrgId] = useState<string | null>(null)

  const openCard = useMemo(() => {
    if (!openOrgId) return null
    for (const col of board.columns) {
      const found = col.cards.find((c) => c.account.orgId === openOrgId)
      if (found) return found
    }
    return null
  }, [openOrgId, board.columns])

  return (
    <div className="flex h-full flex-col bg-[var(--color-page)]">
      <TopBar
        email={email}
        accountCount={board.accountCount}
        fetchedAt={board.fetchedAt}
        syncing={board.syncing}
        theme={theme}
        layoutKey={layoutKey}
        onLayoutChange={changeLayout}
        onToggleTheme={onToggleTheme}
        onRefresh={() => void board.refresh()}
        onSignOut={onSignOut}
      />

      {(board.error || board.fromCache) && (
        <div className="space-y-2 px-6 pt-4">
          {board.error && <Notice tone="error">{board.error}</Notice>}
          {board.fromCache && !board.error && (
            <Notice>
              PostHog was unreachable, so this is the last synced copy of your book. Drag and
              logging still work and save normally.
            </Notice>
          )}
        </div>
      )}

      <main className="flex min-h-0 flex-1 flex-col pt-4">
        {board.loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner label={`Loading the ${layoutDef(layoutKey).label.toLowerCase()} board…`} />
          </div>
        ) : board.accountCount === 0 && !board.error ? (
          <div className="flex flex-1 items-center justify-center px-6">
            <p className="max-w-sm text-center text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
              No accounts are assigned to {email} in Vitally. If that looks wrong, check that your
              PostHog key can read the{' '}
              <code className="font-mono text-[12px]">vitally_csm_managed_accounts</code> view.
            </p>
          </div>
        ) : (
          <Board
            columns={board.columns}
            onOpenAccount={setOpenOrgId}
            onSetColor={board.setColor}
            onRename={board.rename}
            onMove={board.move}
            onAddColumn={board.addColumn}
            onDeleteColumn={board.deleteColumn}
            onReorderColumns={board.reorderColumns}
            canAddColumn={board.canAddColumn}
            canDeleteColumn={board.canDeleteColumn}
          />
        )}
      </main>

      {openCard && (
        <AccountDrawer
          email={email}
          card={openCard}
          onClose={() => setOpenOrgId(null)}
          onTouchLogged={board.logTouch}
        />
      )}
    </div>
  )
}
