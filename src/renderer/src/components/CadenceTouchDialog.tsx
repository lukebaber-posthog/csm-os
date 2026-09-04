import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { addTouch, type TouchValues } from '../lib/board'
import { toDateInput } from '../lib/format'
import { cadenceDaysFor } from '../lib/layouts'
import { normalizeTouchValues } from '../lib/touchChannels'
import { Notice } from './ui/Notice'
import { TouchForm } from './TouchForm'

export interface PendingTouch {
  orgId: string
  orgName: string
  /** The cadence column the card was dropped into. */
  stageKey: string
  stageLabel: string
}

interface Props {
  pending: PendingTouch | null
  email: string
  /** Reports the new most-recent touch date, which is what moves the card. */
  onLogged: (orgId: string, occurredAt: string) => void
  onClose: () => void
}

/**
 * The date that would put a card in the column it was dropped into, as a
 * `yyyy-mm-dd` value for the form's date field.
 */
function dateForStage(stageKey: string): string | undefined {
  const days = cadenceDaysFor(stageKey)
  if (days === null) return undefined
  return toDateInput(new Date(Date.now() - days * 86_400_000).toISOString())
}

/**
 * Asks what the outreach actually was, when a card is dragged between cadence
 * columns.
 *
 * On this board a column is a fact about the touch log, so the only honest way
 * to move a card is to log a touch. The alternative — writing one silently from
 * the drop — would invent outreach that never happened and put it in the weekly
 * export as though it had.
 *
 * Dismissing writes nothing, and the card was never moved: the board reads from
 * the touch log, so a cancelled drop leaves it exactly where it was with no
 * optimistic state to unwind. That is the whole reason this can be a plain
 * dialog rather than a move-then-confirm.
 *
 * The date is seeded to the column that was dropped into, and stays editable —
 * change it and the card lands wherever that date actually belongs, which is the
 * honest outcome rather than forcing the drop to come true.
 */
export function CadenceTouchDialog({ pending, email, onLogged, onClose }: Props) {
  const [error, setError] = useState<string | null>(null)

  async function submit(values: TouchValues): Promise<boolean> {
    if (!pending) return false
    setError(null)
    try {
      const clean = normalizeTouchValues(values)
      await addTouch(email, pending.orgId, clean)
      onLogged(pending.orgId, clean.occurredAt)
      onClose()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log that touch.')
      return false
    }
  }

  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(next) => {
        if (!next) {
          setError(null)
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Log a touch for {pending?.orgName}</DialogTitle>
          <DialogDescription>
            Moving a card on this board means recording contact — the columns are
            days since last contact, so the touch is what moves it. Close this and
            nothing is written.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="mb-1">
            <Notice tone="error">{error}</Notice>
          </div>
        )}

        {/*
          Keyed on the account so the draft does not survive from one drop to the
          next — a note typed for one account has no business appearing on
          another's form.
        */}
        {pending && (
          <TouchForm
            key={pending.orgId + pending.stageKey}
            submitLabel="Log touch"
            defaultDate={dateForStage(pending.stageKey)}
            onSubmit={submit}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
