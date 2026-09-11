import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { contactAge } from '../lib/format'
import { searchAccounts, type SearchableAccount } from '../lib/accountSearch'
import { AccountChip } from './AccountChip'

export interface SearchAccount extends SearchableAccount {
  /** Shown on the right of a row, so a stale account is recognisable in the list. */
  lastTouchedAt: string | null
}

interface Props {
  /**
   * Whether the shortcut is live. False on the to-do board, where there is no
   * account to open — a palette that opened there would either do nothing or
   * silently change what you were looking at.
   */
  enabled: boolean
  accounts: SearchAccount[]
  /** Opens the account's panel, exactly as clicking its card does. */
  onPick: (orgId: string) => void
}

/**
 * Find an account by name and open it, without hunting for its card.
 *
 * The board is a spatial tool — a card's column *is* information — but that
 * works against you when you know which account you want and not where it is,
 * which is most of the time on a thirty-account board with six columns and
 * horizontal scroll. This is the way in that does not depend on remembering
 * where something sits.
 *
 * It owns its own shortcut rather than being opened by a prop, so the call site
 * is one line and there is no open state to keep in step with the key handler.
 */
export function AccountSearch({ enabled, accounts, onPick }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const listRef = useRef<HTMLDivElement>(null)
  // The handler is attached once, so it reads `open` through a ref rather than
  // through the closure it was created in.
  const openRef = useRef(open)
  openRef.current = open

  const results = useMemo(() => searchAccounts(accounts, query), [accounts, query])

  /**
   * Whether anything shows below the input. Keyed off the query rather than the
   * result count, so "no account matches" is still said out loud instead of the
   * box silently staying a pill.
   */
  const showPanel = query.trim().length > 0

  // Typing narrows the list under the cursor, so the highlight has to come back
  // to the top or it ends up pointing at whatever survived at that index.
  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return
      e.preventDefault()

      if (openRef.current) {
        setOpen(false)
        return
      }
      /*
       * Not over another dialog. Settings, the completed list and the cadence
       * touch form all own the screen while they are up, and a palette layered
       * on top could open an account behind them.
       *
       * `[data-state="open"]` is load-bearing, not decoration. Radix keeps a
       * closing dialog mounted until its exit animation ends, so matching on the
       * slot alone also matches the palette's own corpse — press the shortcut
       * twice in quick succession and the second press was swallowed by the
       * first one still leaving.
       */
      if (document.querySelector('[data-slot="dialog-content"][data-state="open"]')) return
      setQuery('')
      setOpen(true)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])

  /** Keeps the highlighted row on screen when it is moved by the keyboard. */
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const pick = useCallback(
    (orgId: string) => {
      setOpen(false)
      onPick(orgId)
    },
    [onPick]
  )

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const chosen = results[active]
      if (chosen) pick(chosen.orgId)
    }
    // Escape is left to Radix, which closes the dialog and restores focus.
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        /*
         * Above centre rather than at it, which is where Spotlight and every
         * palette since puts itself: the list grows downwards, so a centred box
         * would drift as you type. `p-0` because the input is the top edge.
         *
         * One radius, never two. `rounded-full` collapsed and something smaller
         * expanded meant the corners animated between them on the dialog's
         * 200ms transition, and a stadium shape squashing into a panel reads as
         * a glitch rather than a transition.
         *
         * 27px is half the collapsed height: the input row below pins 52px and
         * the border adds one each side, which counts, because the radius
         * applies to the border box. So the bar is a true pill when it is alone,
         * and the same corner is simply a well-rounded panel once the results
         * are under it. Nothing moves but the height.
         *
         * The height cap is on the list below, not here — this one is only a
         * ceiling for a short window, and never binds at a normal size.
         */
        className="top-[18%] max-h-[45vh] translate-y-0 gap-0 overflow-hidden rounded-[27px] p-0 sm:max-w-xl"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Search accounts</DialogTitle>

        <div
          className={cn(
            // h-13 is 52px; with the border that is 54 outer, which the 27px
            // corner is half of. Pinned here rather than left to the input's
            // padding, so the two cannot drift apart and stop being a pill.
            'flex h-13 shrink-0 items-center gap-2.5 px-5',
            showPanel && 'border-b border-[var(--color-line)]'
          )}
        >
          <Search aria-hidden className="h-4 w-4 shrink-0 text-[var(--color-ink-faint)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search accounts…"
            aria-label="Search accounts"
            // A listbox the input drives, so a screen reader follows the
            // highlight rather than only hearing what was typed.
            role="combobox"
            aria-expanded={showPanel}
            aria-controls={showPanel ? 'account-search-results' : undefined}
            aria-activedescendant={results[active] ? `account-result-${results[active].orgId}` : undefined}
            className={
              'w-full bg-transparent text-[14px] outline-none ' +
              'placeholder:text-[var(--color-ink-faint)]'
            }
          />
        </div>

        {showPanel && (
          <div
            ref={listRef}
            id="account-search-results"
            role="listbox"
            /*
             * Sized to land on roughly six and a half rows, so the half row is the
             * hint that the list scrolls. Deep enough to choose from, shallow
             * enough that the box does not become the screen — you are meant to
             * narrow it by typing rather than scroll thirty accounts.
             */
            className="max-h-[28vh] overflow-y-auto px-1.5 pt-1.5 pb-3"
          >
            {results.length === 0 ? (
              <p className="px-2.5 py-6 text-center text-[12px] text-[var(--color-ink-faint)]">
                No account matches “{query.trim()}”.
              </p>
            ) : (
              results.map((account, i) => (
                <button
                  key={account.orgId}
                  id={`account-result-${account.orgId}`}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  data-active={i === active}
                  // Pointer rather than hover state, so mousing across the list
                  // moves the same highlight Enter acts on instead of a second one.
                  onPointerMove={() => setActive(i)}
                  onClick={() => pick(account.orgId)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
                    i === active ? 'bg-[var(--color-surface)]' : 'bg-transparent'
                  )}
                >
                  <AccountChip
                    orgId={account.orgId}
                    orgName={account.orgName}
                    domain={account.domain}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                    {account.orgName}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-[var(--color-ink-faint)]">
                    {contactAge(account.lastTouchedAt)}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
