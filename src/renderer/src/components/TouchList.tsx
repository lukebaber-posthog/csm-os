import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Touch, TouchValues } from '../lib/board'
import { TOUCH_CHANNEL_LABELS, linkHref } from '../lib/touchChannels'
import { TouchChannelIcon } from './TouchChannelIcon'
import { Spinner } from './ui/Spinner'
import { TouchForm } from './TouchForm'

interface Props {
  touches: Touch[]
  loading: boolean
  onSave: (id: string, values: TouchValues) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
}

/** Quiet until the entry is hovered or the button takes focus. */
const action =
  '-ml-2 text-[var(--color-ink-faint)] opacity-0 transition-opacity ' +
  'group-hover:opacity-100 focus-visible:opacity-100'

/**
 * The URL of a link touch, on its own line under the channel.
 *
 * `target="_blank"` is not cosmetic: the main process turns an attempt to open a
 * window into `shell.openExternal` (see `setWindowOpenHandler` in `main/index`),
 * so this is what sends the link to the user's browser. A same-tab href would
 * instead navigate the renderer itself away from the app, with no way back.
 *
 * Shows the text as typed and links the normalised href, so what you read is
 * what you wrote and what you click is what will open. Text that `linkHref`
 * won't vouch for still renders — just not as something clickable, which says
 * more than quietly dropping it would.
 */
function TouchLink({ url }: { url: string }) {
  const href = linkHref(url)
  const text = url.trim()

  if (!href) {
    return (
      <p className="mt-1 truncate text-[12px] text-[var(--color-ink-faint)]" title={text}>
        {text}
      </p>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={href}
      className={
        'mt-1 block truncate text-[12px] text-[var(--color-ink-muted)] underline ' +
        'decoration-[var(--color-line-strong)] underline-offset-2 transition-colors ' +
        'hover:text-[var(--color-ink)] hover:decoration-current ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)]'
      }
    >
      {text}
    </a>
  )
}

/** Logged outreach, newest first, with each entry editable in place. */
export function TouchList({ touches, loading, onSave, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)

  if (loading) return <Spinner label="Loading history…" />

  if (touches.length === 0) {
    return (
      <p className="text-[12px] text-[var(--color-ink-faint)]">
        Nothing logged yet. This account counts as needing outreach.
      </p>
    )
  }

  return (
    <ol className="space-y-3">
      {touches.map((t) => (
        <li
          key={t.id}
          /* A card rather than a rule down the left: the same recipe the to-do
             composer uses (muted line, card shadow, `--color-raised`), so an
             entry here sits on the panel the way a card sits on a column. */
          className={
            'group rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] ' +
            'p-3 shadow-[var(--card-shadow)]'
          }
        >
          {editingId === t.id ? (
            <TouchForm
              initial={t}
              compact
              submitLabel="Save changes"
              onCancel={() => setEditingId(null)}
              onSubmit={async (values) => {
                const ok = await onSave(t.id, values)
                if (ok) setEditingId(null)
                return ok
              }}
            />
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold">
                  <TouchChannelIcon channel={t.channel} />
                  <span className="truncate">{TOUCH_CHANNEL_LABELS[t.channel]}</span>
                </span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--color-ink-faint)]">
                  {new Date(t.occurredAt).toLocaleDateString()}
                </span>
              </div>
              {t.url && <TouchLink url={t.url} />}
              {t.note && (
                <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
                  {t.note}
                </p>
              )}
              <div className="mt-1 flex gap-1">
                <Button
                  variant="ghost"
                  size="xs"
                  className={action}
                  onClick={() => setEditingId(t.id)}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className={action}
                  onClick={() => void onDelete(t.id)}
                >
                  Delete
                </Button>
              </div>
            </>
          )}
        </li>
      ))}
    </ol>
  )
}
