import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Touch, TouchValues } from '../lib/board'
import { TOUCH_CHANNEL_LABELS } from '../lib/touchChannels'
import { ExternalLink } from './ExternalLink'
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
              {t.url && <ExternalLink url={t.url} className="mt-1 text-[12px]" />}
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
