import { LogOut, Moon, PartyPopper, Settings, Sun } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { burstConfetti } from '../lib/completionFx'
import type { Theme } from '../hooks/useTheme'

interface Props {
  email: string
  theme: Theme
  onToggleTheme: () => void
  onOpenSettings: () => void
  onSignOut: () => void
}

/**
 * The initial for the avatar.
 *
 * There is no picture to fall back from — PostHog's identity carries an email and
 * a first name, no photo — so the monogram is the whole avatar rather than a
 * placeholder waiting on one. First letter of the email, which is also the first
 * letter of the name for the addresses this app sees.
 */
function initialOf(email: string): string {
  const first = email.trim()[0]
  return first ? first.toUpperCase() : '?'
}

/**
 * Everything that was a row of five labelled buttons, behind one avatar.
 *
 * The buttons were all app-level rather than board-level — none of them acted on
 * what was on screen — so they read as chrome competing with the board. Collapsed
 * into a menu they are one target, and the header gets its width back.
 *
 * The signed-in email did not go away with them: it is the menu's label, which is
 * where an account menu conventionally says whose account it is.
 */
export function UserMenu({ email, theme, onToggleTheme, onOpenSettings, onSignOut }: Props) {
  const dark = theme === 'dark'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${email}`}
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
            'border border-[var(--color-line-strong)] bg-[var(--color-surface)]',
            'text-[11px] font-semibold text-[var(--color-ink-muted)]',
            'transition-colors hover:border-[var(--color-ink-faint)] hover:text-[var(--color-ink)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)]',
            // The header is a drag region; controls inside it have to opt out or
            // the press moves the window instead of opening the menu.
            'data-[state=open]:border-[var(--color-ink-faint)] data-[state=open]:text-[var(--color-ink)]'
          )}
        >
          {initialOf(email)}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent>
        <DropdownMenuLabel className="truncate" title={email}>
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/*
          Confetti used to render only on the to-do view, where the effects it is
          checking live. In here it is always present: the menu is app-level, and
          a row that appears and disappears with the tab would read as a glitch.
        */}
        <DropdownMenuItem onSelect={() => burstConfetti()}>
          <PartyPopper />
          Confetti
        </DropdownMenuItem>

        {/* Names the mode you would be switching TO, matching the button it replaced. */}
        <DropdownMenuItem onSelect={onToggleTheme}>
          {dark ? <Sun /> : <Moon />}
          {dark ? 'Light mode' : 'Dark mode'}
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={onOpenSettings}>
          <Settings />
          Settings
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem variant="destructive" onSelect={onSignOut}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
