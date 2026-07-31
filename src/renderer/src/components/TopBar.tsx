import { syncAge } from '../lib/format'
import { Button } from './ui/Button'
import { LayoutPicker } from './LayoutPicker'
import type { Theme } from '../hooks/useTheme'

interface Props {
  email: string
  accountCount: number
  fetchedAt: string | null
  syncing: boolean
  theme: Theme
  layoutKey: string
  onLayoutChange: (layoutKey: string) => void
  onToggleTheme: () => void
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
  onLayoutChange,
  onToggleTheme,
  onRefresh,
  onSignOut
}: Props) {
  return (
    <header className="titlebar-drag flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--color-line)] pl-[86px] pr-4">
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="text-[14px] font-semibold tracking-tight">CSM OS</span>
        <span className="truncate text-[12px] text-[var(--color-ink-muted)]">
          {accountCount} {accountCount === 1 ? 'account' : 'accounts'}
          <span className="mx-1.5 text-[var(--color-ink-faint)]">·</span>
          {syncing ? 'Syncing…' : syncAge(fetchedAt)}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <LayoutPicker value={layoutKey} onChange={onLayoutChange} />
        <span className="mx-1 h-4 w-px bg-[var(--color-line)]" />
        <Button variant="ghost" onClick={onRefresh} disabled={syncing} title="Re-sync from PostHog">
          {syncing ? 'Syncing…' : 'Sync'}
        </Button>
        <Button
          variant="ghost"
          onClick={onToggleTheme}
          title={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
          aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {theme === 'light' ? 'Dark' : 'Light'}
        </Button>
        <span className="mx-1 h-4 w-px bg-[var(--color-line)]" />
        <span
          className="max-w-[180px] truncate text-[12px] text-[var(--color-ink-muted)]"
          title={email}
        >
          {email}
        </span>
        <Button variant="ghost" onClick={onSignOut} title="Sign out">
          Sign out
        </Button>
      </div>
    </header>
  )
}
