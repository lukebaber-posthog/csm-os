import { RefreshCw } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { syncAge } from '../lib/format'
import type { MainView } from '../lib/views'
import type { Theme } from '../hooks/useTheme'
import { LayoutPicker } from './LayoutPicker'
import { UserMenu } from './UserMenu'
import { ViewSlider } from './ViewSlider'

interface Props {
  email: string
  accountCount: number
  fetchedAt: string | null
  syncing: boolean
  theme: Theme
  layoutKey: string
  view: MainView
  openTodoCount: number
  doneTodayCount: number
  onViewChange: (view: MainView) => void
  onLayoutChange: (layoutKey: string) => void
  onToggleTheme: () => void
  onOpenSettings: () => void
  onRefresh: () => void
  onSignOut: () => void
}

/**
 * The sync age, as its own component so it is computed when the tooltip opens.
 *
 * Inlining `{syncAge(fetchedAt)}` in the JSX below would freeze the string at
 * whenever `TopBar` last rendered — and since the tooltip is now the only place
 * the age appears, a board left open for an hour would have gone on claiming it
 * synced "2 min ago". Radix mounts content on open, so a component re-reads the
 * clock each time it is shown.
 */
function SyncAge({ fetchedAt, syncing }: { fetchedAt: string | null; syncing: boolean }) {
  return <>{syncing ? 'Syncing…' : syncAge(fetchedAt)}</>
}

export function TopBar({
  email,
  accountCount,
  fetchedAt,
  syncing,
  theme,
  layoutKey,
  view,
  openTodoCount,
  doneTodayCount,
  onViewChange,
  onLayoutChange,
  onToggleTheme,
  onOpenSettings,
  onRefresh,
  onSignOut
}: Props) {
  return (
    <header className="titlebar-drag flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--color-line)] pl-[86px] pr-4">
      {/* items-center rather than items-baseline: the pill is a control, not text,
          and baseline-aligning it sits it a couple of pixels low. */}
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-[14px] font-semibold tracking-tight">CSM OS</span>
        <ViewSlider value={view} onChange={onViewChange} />
        <span className="mx-1 h-4 w-px shrink-0 bg-[var(--color-line)]" />
        {/* One line about what is actually on screen, so it follows the view. */}
        <span className="truncate text-[12px] text-[var(--color-ink-muted)]">
          {view === 'accounts' ? (
            <>
              {accountCount} {accountCount === 1 ? 'account' : 'accounts'}
            </>
          ) : (
            <>
              {openTodoCount} open
              <span className="mx-1.5 text-[var(--color-ink-faint)]">·</span>
              {doneTodayCount} done today
            </>
          )}
        </span>

        {/*
          Sync is this icon now, not a labelled button in the row on the right —
          the age it reports and the action that changes it are the same subject,
          so they are one control instead of a sentence at one end of the bar and
          a button at the other.

          It renders in BOTH views, which is not cosmetic: `onRefresh` reloads the
          to-do board as well as the accounts one, and it is the only way back
          from a to-do board that failed its initial load. Scoping this to the
          accounts view would leave that board with no recovery — the exact bug
          the old labelled button was made to render in both views to avoid.
        */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onRefresh}
              disabled={syncing}
              aria-label="Re-sync from PostHog"
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded',
                'text-[var(--color-ink-faint)] transition-colors',
                'hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)]',
                'disabled:pointer-events-none disabled:opacity-60'
              )}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
            </button>
          </TooltipTrigger>
          {/* The age lives here now, so it has to be right when read — see SyncAge. */}
          <TooltipContent>
            <SyncAge fetchedAt={fetchedAt} syncing={syncing} />
          </TooltipContent>
        </Tooltip>
      </div>

      {/*
        Only two things live here now. The layout picker acts on what is on
        screen, so it stays in the bar; everything else was app-level chrome and
        moved behind the avatar.
      */}
      <div className="flex shrink-0 items-center gap-2">
        {view === 'accounts' && <LayoutPicker value={layoutKey} onChange={onLayoutChange} />}
        <UserMenu
          email={email}
          theme={theme}
          onToggleTheme={onToggleTheme}
          onOpenSettings={onOpenSettings}
          onSignOut={onSignOut}
        />
      </div>
    </header>
  )
}
