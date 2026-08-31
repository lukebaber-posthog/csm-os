import { useMemo, useState, type FormEvent } from 'react'
import { motion } from 'motion/react'
import { Link2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { Todo, TodoValues } from '../lib/board'
import { buildAccountIndex, matchAccount } from '../lib/accountMatch'
import { EASE_SWIFT } from '../lib/motion'
import {
  BUCKET_LABELS,
  DEFAULT_BUCKET,
  DEFAULT_KIND,
  TODO_BUCKETS,
  isTodoBucket
} from '../lib/todos'
import type { TodoAccount } from './TodoCard'
import { AccountChip } from './AccountChip'
import { KindSlider } from './KindSlider'

/** Sentinel for "no account", since a Select cannot carry null as a value. */
const NO_ACCOUNT = '__none__'

/**
 * Every field in the form, muted.
 *
 * shadcn's inputs default to `border-input`, which this app points at
 * `--color-line-strong` — right for a standalone form, too loud for four stacked
 * fields inside a card that already has its own border. `--color-line` plus a
 * shadow soft enough to read as depth rather than as an edge separates them
 * without drawing a box around each one.
 */
const FIELD = 'border-[var(--color-line)] shadow-field dark:shadow-field-dark'

/** The two "add an optional field" buttons under the title. */
const reveal =
  'inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium ' +
  'text-[var(--color-ink-faint)] transition-colors hover:text-[var(--color-ink-muted)] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)]'

interface Props {
  /** Present when editing an existing to-do; absent when creating one. */
  initial?: Todo
  accounts: TodoAccount[]
  submitLabel: string
  /** Which column the to-do belongs to. Ignored when editing. */
  defaultBucket?: TodoValues['bucket']
  /**
   * Hides the column picker. The composer opens inside a column, so the column is
   * already chosen by where you clicked — offering it again invites the two to
   * disagree.
   */
  hideBucket?: boolean
  /** Resolves false when the write failed, which keeps the draft on screen. */
  onSubmit: (values: TodoValues) => Promise<boolean>
  /**
   * Closes the form. No longer rendered as a button — clicking away does it, and
   * this is the keyboard equivalent, wired to Escape.
   */
  onCancel?: () => void
  /** Tighter spacing, for use inline in place of a card. */
  compact?: boolean
}

/**
 * The to-do composer, used both to create a to-do and to correct one already
 * there. Editing is the same fields, so it is the same component rather than a
 * second form that has to be kept in step — the same choice TouchForm makes.
 *
 * Ordered by how much thought each field costs. The title is the only required
 * one and gets focus; the note is a link until you want it, because most to-dos
 * are a single line and an always-open textarea made the composer look like a
 * form to fill in rather than a box to type in. The kind pill is last because it
 * has a sensible default and you can leave it alone.
 *
 * No Cancel button: clicking away closes it (see `useOutsideDismiss` at the two
 * call sites), and Escape does the same from any field.
 */
export function TodoForm({
  initial,
  accounts,
  submitLabel,
  defaultBucket,
  hideBucket,
  onSubmit,
  onCancel,
  compact
}: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  /** A to-do that already has a note opens with it showing; there is nothing to reveal. */
  const [noteOpen, setNoteOpen] = useState(Boolean(initial?.note))
  const [url, setUrl] = useState(initial?.url ?? '')
  /** Same rule as the note: an existing link opens showing, not hidden behind a button. */
  const [linkOpen, setLinkOpen] = useState(Boolean(initial?.url))
  const [bucket, setBucket] = useState(initial?.bucket ?? defaultBucket ?? DEFAULT_BUCKET)
  const [kind, setKind] = useState(initial?.kind ?? DEFAULT_KIND)
  /*
   * The account, in two parts: what the picker was last set to by hand, and
   * whether that outranks what the text says.
   *
   * `picked` is kept across a kind change rather than cleared with it, so flipping
   * to PR and back does not throw away the account you had already chosen.
   * `useTodos` drops the link on the way out for any kind that cannot carry one —
   * see `normalizeTodoValues`.
   */
  const [picked, setPicked] = useState(initial?.orgId ?? null)
  /*
   * Whether `picked` outranks what the text says. Until the picker is touched the
   * link follows the words — see the matcher below. A to-do that already carries a
   * link opens pinned: reopening one to fix a typo should not re-file it. One that
   * does not is fair game, which is how a to-do written before any of this existed
   * gets its account the first time it is edited.
   */
  const [pinned, setPinned] = useState(Boolean(initial?.orgId))
  const [saving, setSaving] = useState(false)

  /*
   * "Look into Exception Spike for Athena Intelligence" already names its account,
   * so the picker fills itself in rather than asking you to say it a second time.
   * It tracks the text both ways — delete the name and the link clears — which is
   * what makes it safe to do without asking: nothing here is a decision you cannot
   * see in the trigger and undo by typing.
   *
   * The index is rebuilt only when the book changes and a match is a few hundred
   * string comparisons over one to-do's worth of text, so this is cheap enough to
   * run on every keystroke.
   */
  const index = useMemo(() => buildAccountIndex(accounts), [accounts])
  const auto = useMemo(
    () => (pinned ? null : matchAccount(index, `${title}\n${note}`)),
    [pinned, index, title, note]
  )
  const orgId = pinned ? picked : (auto?.orgId ?? null)

  /** Any use of the picker pins it, including choosing "No account yet". */
  function chooseAccount(value: string) {
    setPinned(true)
    setPicked(value === NO_ACCOUNT ? null : value)
  }

  // Set when the to-do points at an account that is no longer in the book.
  const orphanOrgId = orgId && !accounts.some((a) => a.orgId === orgId) ? orgId : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    const ok = await onSubmit({ title, note, url, bucket, kind, orgId })
    setSaving(false)
    // Clearing the body but keeping the account makes adding a second to-do for
    // the same account cheap — `picked` survives the reset, so an account you
    // chose by hand is still there for the next one. An account the text supplied
    // leaves with the text it came from, which is the point of it: the next to-do
    // names its own. When editing, the parent closes the form.
    if (ok && !initial) {
      setTitle('')
      setNote('')
      setNoteOpen(false)
      setUrl('')
      setLinkOpen(false)
    }
  }

  // The other half of click-away-to-close, for anyone whose hands are on the keys.
  // Only on the two text fields: Escape inside an open select belongs to the
  // popup, and closing the composer out from under it would take the draft too.
  const dismissOnEscape = (e: { key: string }) => {
    if (e.key === 'Escape' && onCancel) onCancel()
  }

  /** Renders only when there is something in it, so it costs no margin when empty. */
  const pickers = !hideBucket || kind === 'account'

  return (
    <form onSubmit={submit}>
      <Input
        value={title}
        maxLength={140}
        autoFocus={compact}
        placeholder="What needs doing?"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={dismissOnEscape}
        className={FIELD}
      />

      {noteOpen && (
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={dismissOnEscape}
          rows={2}
          // Focused on open, since the only way here is having asked for it.
          // Not on the editing path, where the field is already populated and
          // stealing focus from the title would be wrong.
          autoFocus={!initial?.note}
          placeholder="Note"
          className={cn('mt-2 resize-none', FIELD)}
        />
      )}

      {linkOpen && (
        <Input
          // Not type="url", which would reject "posthog.com/docs" in the
          // browser's own words before `linkHref` gets to supply the scheme.
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={dismissOnEscape}
          autoFocus={!initial?.url}
          placeholder="https://…"
          aria-label="Link"
          className={cn('mt-2', FIELD)}
        />
      )}

      {/*
        One row for whichever reveals are still closed, so adding a second
        optional field did not mean a second lonely button on its own line. Each
        disappears once opened — the field it reveals is the thing to look at.
      */}
      {(!noteOpen || !linkOpen) && (
        <div className="mt-1.5 flex items-center gap-1">
          {!noteOpen && (
            <button type="button" onClick={() => setNoteOpen(true)} className={reveal}>
              <Plus className="h-3 w-3" />
              Note
            </button>
          )}
          {!linkOpen && (
            <button type="button" onClick={() => setLinkOpen(true)} className={reveal}>
              <Link2 className="h-3 w-3" />
              Link
            </button>
          )}
        </div>
      )}

      <KindSlider value={kind} onChange={setKind} className="mt-2" />

      {pickers && (
        <div className="mt-2 flex gap-2">
          {!hideBucket && (
            <Select
              value={bucket}
              onValueChange={(v) => {
                // Radix emits '' when a single-value group deselects; ignore it
                // rather than letting the column fall out of the union.
                if (isTodoBucket(v)) setBucket(v)
              }}
            >
              <SelectTrigger className={cn('min-w-0 flex-1', FIELD)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TODO_BUCKETS.map((b) => (
                  <SelectItem key={b} value={b}>
                    {BUCKET_LABELS[b]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/*
            Only an account to-do has an account to name. The other two kinds are
            not "an account to-do with the account left blank" — that is what the
            pill now says out loud — so the picker goes away rather than sitting
            there on "No account".
          */}
          {kind === 'account' && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: EASE_SWIFT }}
              className="min-w-0 flex-1"
            >
              <Select value={orgId ?? NO_ACCOUNT} onValueChange={chooseAccount}>
                <SelectTrigger className={cn('w-full min-w-0', FIELD)}>
                  {/* A placeholder matters here: Radix shows the selected label only
                      via the matching item, so a value with no item renders a
                      trigger containing nothing but the chevron. */}
                  <SelectValue placeholder="Which account?" />
                </SelectTrigger>
                <SelectContent>
                  {/* An empty box the width of a chip, so the labels line up down
                      the list whether or not a row has a logo. */}
                  <SelectItem value={NO_ACCOUNT}>
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="h-4 w-4 shrink-0" />
                      No account yet
                    </span>
                  </SelectItem>
                  {/*
                    An account reassigned away in Vitally drops out of the book, but
                    the to-do still carries its org_id. Without an item for it the
                    trigger goes blank and simply saving the form would silently drop
                    the link, so keep it selectable and say what it is.
                  */}
                  {orphanOrgId && (
                    <SelectItem value={orphanOrgId}>
                      <span className="flex items-center gap-2">
                        <span aria-hidden className="h-4 w-4 shrink-0" />
                        Unknown account (no longer yours)
                      </span>
                    </SelectItem>
                  )}
                  {accounts.map((a) => (
                    <SelectItem key={a.orgId} value={a.orgId}>
                      {/* Radix portals an item's children into the trigger, so
                          putting the chip here also puts the chosen account's logo
                          on the closed selector — no separate trigger rendering. */}
                      <span className="flex min-w-0 items-center gap-2">
                        <AccountChip orgId={a.orgId} orgName={a.orgName} domain={a.domain} size="sm" />
                        <span className="truncate">{a.orgName}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/*
                A picker that fills itself in is silent to a screen reader, which
                would otherwise not find out until submit. Keyed off the match
                rather than the keystroke: React leaves the text node alone while
                the matched account is unchanged, so it announces once.
              */}
              <span aria-live="polite" className="sr-only">
                {auto ? `Linked to ${auto.orgName}` : ''}
              </span>
            </motion.div>
          )}
        </div>
      )}

      <Button
        type="submit"
        size="sm"
        className="mt-2 w-full"
        disabled={saving || !title.trim()}
      >
        {saving ? 'Saving…' : submitLabel}
      </Button>
    </form>
  )
}
