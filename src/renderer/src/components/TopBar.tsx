import { Button } from '@/components/ui/button'
import { syncAge } from '../lib/format'
import { burstConfetti } from '../lib/completionFx'
import type { MainView } from '../lib/views'
import type { Theme } from '../hooks/useTheme'
import { LayoutPicker } from './LayoutPicker'
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
              <span className="mx-1.5 text-[var(--color-ink-faint)]">·</span>
              {syncing ? 'Syncing…' : syncAge(fetchedAt)}
            </>
          ) : (
            <>
              {openTodoCount} open
              <span className="mx-1.5 text-[var(--color-ink-faint)]">·</span>
              {doneTodayCount} done today
            </>
          )}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {view === 'accounts' && (
          <>
            <LayoutPicker value={layoutKey} onChange={onLayoutChange} />
            <span className="mx-1 h-4 w-px bg-[var(--color-line)]" />
          </>
        )}
        {view === 'todos' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => burstConfetti()}
            title="Fire the confetti without completing anything, to check its placement"
          >
            Confetti
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={syncing}
          title="Re-sync from PostHog"
        >
          {syncing ? 'Syncing…' : 'Sync'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleTheme}
          title={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
          aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {theme === 'light' ? 'Dark' : 'Light'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onOpenSettings} title="Settings (⌘,)">
          Settings
        </Button>
        <span className="mx-1 h-4 w-px bg-[var(--color-line)]" />
        <span
          className="max-w-[180px] truncate text-[12px] text-[var(--color-ink-muted)]"
          title={email}
        >
          {email}
        </span>
        <Button variant="ghost" size="sm" onClick={onSignOut} title="Sign out">
          Sign out
        </Button>
      </div>
    </header>
  )
}
