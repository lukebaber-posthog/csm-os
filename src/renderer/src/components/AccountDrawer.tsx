import { useEffect } from 'react'
import type { Card } from '../hooks/useBoard'
import { useTouchLog } from '../hooks/useTouchLog'
import { CHANNEL_LABELS, type ContactChannel } from '../lib/channels'
import { arrExact, contactAge } from '../lib/format'
import { Button } from '@/components/ui/button'
import { ChannelSlider } from './ChannelSlider'
import { Notice } from './ui/Notice'
import { TouchForm } from './TouchForm'
import { TouchList } from './TouchList'

interface Props {
  email: string
  card: Card
  onClose: () => void
  onSetChannel: (orgId: string, channel: ContactChannel | null) => void
  /** Reports the account's new most-recent touch date to the board. */
  onLatestTouchChange: (orgId: string, occurredAt: string | null) => void
}

export function AccountDrawer({
  email,
  card,
  onClose,
  onSetChannel,
  onLatestTouchChange
}: Props) {
  const orgId = card.account.orgId
  const log = useTouchLog(email, orgId, onLatestTouchChange)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Radix layers (the channel select's popup) dismiss on Escape too and
      // mark the event handled. Without this the first Escape would close the
      // popup and the whole panel at once.
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (document.querySelector('[data-radix-popper-content-wrapper]')) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close panel">
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

          {/* The same control as on the card, at a size that can carry a label —
              which is also where clearing the choice is spelled out. */}
          <div className="mt-4">
            <p className="text-[12px] text-[var(--color-ink-faint)]">Reachable on</p>
            <div className="mt-1.5 flex items-center gap-3">
              <ChannelSlider
                size="md"
                value={card.channel}
                onChange={(channel) => onSetChannel(orgId, channel)}
              />
              <span className="flex-1 text-[12px] text-[var(--color-ink-muted)]">
                {card.channel ? CHANNEL_LABELS[card.channel] : 'Not set'}
              </span>
              {card.channel && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[var(--color-ink-muted)]"
                  onClick={() => onSetChannel(orgId, null)}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </header>

        <div className="border-b border-[var(--color-line)] px-5 py-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
            Log outreach
          </h3>
          <TouchForm submitLabel="Log touch" onSubmit={log.add} />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
            History
          </h3>

          {log.error && (
            <div className="mb-3">
              <Notice tone="error">{log.error}</Notice>
            </div>
          )}

          <TouchList
            touches={log.touches}
            loading={log.loading}
            onSave={log.save}
            onDelete={log.remove}
          />
        </div>
      </aside>
    </div>
  )
}
