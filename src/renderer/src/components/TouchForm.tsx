import { useState, type FormEvent } from 'react'
import { motion } from 'motion/react'
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
import { TOUCH_CHANNELS, type TouchChannel } from '../../../shared/types'
import type { Touch, TouchValues } from '../lib/board'
import { fromDateInput, toDateInput, todayInput } from '../lib/format'
import { EASE_SWIFT } from '../lib/motion'
import { TOUCH_CHANNEL_LABELS, carriesUrl, isTouchChannel } from '../lib/touchChannels'
import { TouchChannelIcon } from './TouchChannelIcon'

interface Props {
  /** Present when editing an existing touch; absent when logging a new one. */
  initial?: Touch
  submitLabel: string
  /** Resolves false when the write failed, which keeps the draft on screen. */
  onSubmit: (values: TouchValues) => Promise<boolean>
  /** Present only when the form can be dismissed, i.e. while editing. */
  onCancel?: () => void
  /** Tighter spacing, for use inline inside the history list. */
  compact?: boolean
}

/**
 * The channel / date / note trio, used both to log a touch and to correct one
 * already logged. Editing an existing row is the same fields, so it is the same
 * component rather than a second form that has to be kept in step.
 *
 * Link is the one channel with a fourth field. It names something you sent
 * rather than a conversation you had, so the URL *is* the entry and the note is
 * the optional part — which is why the field appears above the note and why
 * submit is blocked without it, the only required field this form has ever had.
 */
export function TouchForm({ initial, submitLabel, onSubmit, onCancel, compact }: Props) {
  const [channel, setChannel] = useState<TouchChannel>(initial?.channel ?? 'email')
  const [date, setDate] = useState(initial ? toDateInput(initial.occurredAt) : todayInput())
  const [note, setNote] = useState(initial?.note ?? '')
  /*
   * Kept across a channel change rather than cleared with it, so flipping to
   * Call and back does not throw away a URL already pasted. `useTouchLog` drops
   * it on the way out for any channel that cannot carry one — see
   * `normalizeTouchValues`.
   */
  const [url, setUrl] = useState(initial?.url ?? '')
  const [saving, setSaving] = useState(false)

  const wantsUrl = carriesUrl(channel)
  const incomplete = wantsUrl && !url.trim()

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (incomplete) return
    setSaving(true)
    const ok = await onSubmit({ channel, note, url, occurredAt: fromDateInput(date) })
    setSaving(false)
    // Clearing the note and the URL but keeping channel and date makes logging a
    // second touch on the same day cheap. When editing, the parent closes the form.
    if (ok && !initial) {
      setNote('')
      setUrl('')
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="flex gap-2">
        <Select
          value={channel}
          onValueChange={(v) => {
            // Radix emits '' when a single-value group deselects; ignore it
            // rather than letting the channel fall out of the union.
            if (isTouchChannel(v)) setChannel(v)
          }}
        >
          <SelectTrigger autoFocus={compact} className="w-[126px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TOUCH_CHANNELS.map((c) => (
              <SelectItem key={c} value={c}>
                {/* Radix portals an item's children into the trigger, so the mark
                    here is also the mark on the closed selector — no separate
                    trigger rendering. */}
                <span className="flex items-center gap-2">
                  <TouchChannelIcon channel={c} />
                  {TOUCH_CHANNEL_LABELS[c]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={date}
          max={todayInput()}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1"
        />
      </div>

      {wantsUrl && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: EASE_SWIFT }}
        >
          <Input
            // Not type="url", which would reject "posthog.com/docs" in the
            // browser's own words before `linkHref` gets to supply the scheme.
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            aria-label="Link"
            className="mt-2"
          />
        </motion.div>
      )}

      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={compact ? 2 : 3}
        placeholder={wantsUrl ? 'What is this link? (optional)' : 'What did you cover? (optional)'}
        className="mt-2 resize-none"
      />

      <div className="mt-2 flex gap-2">
        <Button type="submit" className="flex-1" disabled={saving || incomplete}>
          {saving ? 'Saving…' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
