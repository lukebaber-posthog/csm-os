import { useEffect, useState, type FormEvent } from 'react'
import type { Card } from '../hooks/useBoard'
import { TOUCH_CHANNELS, type TouchChannel } from '../../../shared/types'
import { loadTouches, deleteTouch, type Touch } from '../lib/board'
import { arrExact, contactAge } from '../lib/format'
import { Button } from './ui/Button'
import { Notice } from './ui/Notice'
import { Spinner } from './ui/Spinner'

interface Props {
  email: string
  card: Card
  onClose: () => void
  onTouchLogged: (
    orgId: string,
    channel: TouchChannel,
    note: string,
    occurredAt: string
  ) => Promise<void>
}

/** Local date in yyyy-mm-dd, for the date input's default value. */
function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function AccountDrawer({ email, card, onClose, onTouchLogged }: Props) {
  const [touches, setTouches] = useState<Touch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [channel, setChannel] = useState<TouchChannel>('email')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(today())
  const [saving, setSaving] = useState(false)

  const orgId = card.account.orgId

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    loadTouches(email, orgId)
      .then((rows) => active && setTouches(rows))
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [email, orgId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    // Anchor to midday so a date-only entry can't drift across a timezone edge.
    const occurredAt = new Date(`${date}T12:00:00`).toISOString()
    try {
      await onTouchLogged(orgId, channel, note, occurredAt)
      setTouches(await loadTouches(email, orgId))
      setNote('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log the touch.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    try {
      await deleteTouch(id)
      setTouches((prev) => prev.filter((t) => t.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the touch.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        aria-label="Close"
        onClick={onClose}
        className="flex-1 bg-black/20 dark:bg-black/50"
      />
      <aside className="flex h-full w-[400px] flex-col border-l border-[var(--color-line)] bg-[var(--color-page)] shadow-2xl">
        <header className="border-b border-[var(--color-line)] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-[17px] font-semibold tracking-tight">
                {card.account.orgName}
              </h2>
              <p className="mt-0.5 text-[12px] text-[var(--color-ink-muted)]">
                {contactAge(card.lastTouchedAt)}
                {card.account.isTamOverlay && ' · TAM overlay'}
              </p>
            </div>
            <Button variant="ghost" onClick={onClose} aria-label="Close panel">
              ✕
            </Button>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12px]">
            <div>
              <dt className="text-[var(--color-ink-faint)]">ARR</dt>
              <dd className="mt-0.5 font-mono tabular-nums">{arrExact(card.account.arr)}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-ink-faint)]">Segment</dt>
              <dd className="mt-0.5">{card.account.segment ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-ink-faint)]">Assigned</dt>
              <dd className="mt-0.5">{card.account.csmDateAssigned ?? '—'}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[var(--color-ink-faint)]">Org ID</dt>
              <dd
                className="mt-0.5 truncate font-mono text-[10px] text-[var(--color-ink-muted)]"
                title={orgId}
              >
                {orgId}
              </dd>
            </div>
          </dl>
        </header>

        <form onSubmit={submit} className="border-b border-[var(--color-line)] px-5 py-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
            Log outreach
          </h3>

          <div className="flex gap-2">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as TouchChannel)}
              className="h-9 rounded-md border border-[var(--color-line-strong)] bg-[var(--color-raised)] px-2 text-[13px] capitalize focus:border-[var(--color-ink)] focus:outline-none"
            >
              {TOUCH_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 flex-1 rounded-md border border-[var(--color-line-strong)] bg-[var(--color-raised)] px-2 text-[13px] focus:border-[var(--color-ink)] focus:outline-none"
            />
          </div>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="What did you cover? (optional)"
            className="mt-2 w-full resize-none rounded-md border border-[var(--color-line-strong)] bg-[var(--color-raised)] px-3 py-2 text-[13px] placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-ink)] focus:outline-none"
          />

          <Button type="submit" className="mt-2 w-full" disabled={saving}>
            {saving ? 'Saving…' : 'Log touch'}
          </Button>
        </form>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
            History
          </h3>

          {error && (
            <div className="mb-3">
              <Notice tone="error">{error}</Notice>
            </div>
          )}

          {loading ? (
            <Spinner label="Loading history…" />
          ) : touches.length === 0 ? (
            <p className="text-[12px] text-[var(--color-ink-faint)]">
              Nothing logged yet. This account counts as needing outreach.
            </p>
          ) : (
            <ol className="space-y-3">
              {touches.map((t) => (
                <li
                  key={t.id}
                  className="group border-l-2 border-[var(--color-line-strong)] pl-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12px] font-semibold capitalize">{t.channel}</span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--color-ink-faint)]">
                      {new Date(t.occurredAt).toLocaleDateString()}
                    </span>
                  </div>
                  {t.note && (
                    <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
                      {t.note}
                    </p>
                  )}
                  <button
                    onClick={() => remove(t.id)}
                    className="mt-1 text-[11px] text-[var(--color-ink-faint)] opacity-0 transition-opacity hover:text-[var(--color-ink)] group-hover:opacity-100"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </div>
  )
}
