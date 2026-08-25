import { useState, type FormEvent } from 'react'
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
 * already logged. Editing an existing row is the same three fields, so it is the
 * same component rather than a second form that has to be kept in step.
 */
export function TouchForm({ initial, submitLabel, onSubmit, onCancel, compact }: Props) {
  const [channel, setChannel] = useState<TouchChannel>(initial?.channel ?? 'email')
  const [date, setDate] = useState(initial ? toDateInput(initial.occurredAt) : todayInput())
  const [note, setNote] = useState(initial?.note ?? '')
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    const ok = await onSubmit({ channel, note, occurredAt: fromDateInput(date) })
    setSaving(false)
    // Clearing the note but keeping channel and date makes logging a second
    // touch on the same day cheap. When editing, the parent closes the form.
    if (ok && !initial) setNote('')
  }

  return (
    <form onSubmit={submit}>
      <div className="flex gap-2">
        <Select value={channel} onValueChange={(v) => setChannel(v as TouchChannel)}>
          <SelectTrigger autoFocus={compact} className="w-[108px] capitalize">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TOUCH_CHANNELS.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">
                {c}
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

      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={compact ? 2 : 3}
        placeholder="What did you cover? (optional)"
        className="mt-2 resize-none"
      />

      <div className="mt-2 flex gap-2">
        <Button type="submit" className="flex-1" disabled={saving}>
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
