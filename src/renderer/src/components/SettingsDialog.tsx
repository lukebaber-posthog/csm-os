import { useState, useSyncExternalStore } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { loadOrgNames, loadTodosCompletedSince, loadTouchesSince } from '../lib/board'
import { activityFileName, buildActivityMarkdown } from '../lib/exportActivity'
import { requireBridge } from '../lib/bridge'
import { startOfDaysAgoIso } from '../lib/format'
import { getSettings, setSetting, subscribeSettings } from '../lib/settings'

/** Six days back plus today is a seven-day window, inclusive. */
const WINDOW_DAYS = 6

interface Props {
  open: boolean
  email: string
  onOpenChange: (open: boolean) => void
}

/** App preferences. Each row is a label, a one-line explanation, and a control. */
export function SettingsDialog({ open, email, onOpenChange }: Props) {
  const settings = useSyncExternalStore(subscribeSettings, getSettings)
  const [exporting, setExporting] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  async function exportActivity() {
    setExporting(true)
    setStatus(null)
    try {
      const sinceIso = startOfDaysAgoIso(WINDOW_DAYS)
      // One round trip each, in parallel — they are independent reads.
      const [touches, completed, orgNames] = await Promise.all([
        loadTouchesSince(email, sinceIso),
        loadTodosCompletedSince(email, sinceIso),
        loadOrgNames(email)
      ])
      const generatedAtIso = new Date().toISOString()
      const markdown = buildActivityMarkdown({
        email,
        sinceIso,
        generatedAtIso,
        touches,
        completed,
        orgNames
      })

      const result = await requireBridge('files').saveText(
        activityFileName(generatedAtIso),
        markdown
      )
      if (!result.ok) {
        setStatus(result.error)
        return
      }
      // null means the save dialog was dismissed, which needs no comment.
      setStatus(
        result.data
          ? `Saved ${touches.length} touchpoints and ${completed.length} completed to-dos to ${result.data}`
          : null
      )
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not build the export.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Settings</DialogTitle>
          <DialogDescription className="text-[12px]">
            Preferences are stored on this machine.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start justify-between gap-6 border-t border-[var(--color-line)] pt-4">
          <div className="min-w-0">
            <Label htmlFor="mega-confetti" className="text-[13px] font-medium">
              Mega Confetti
            </Label>
            <p className="mt-1 text-[12px] leading-snug text-[var(--color-ink-muted)]">
              Completing a to-do sets off five seconds of confetti across the whole
              window, instead of a single burst.
            </p>
          </div>
          <Switch
            id="mega-confetti"
            checked={settings.megaConfetti}
            onCheckedChange={(next) => setSetting('megaConfetti', next)}
          />
        </div>

        <div className="flex items-start justify-between gap-6 border-t border-[var(--color-line)] pt-4">
          <div className="min-w-0">
            <Label className="text-[13px] font-medium">Export last 7 days</Label>
            <p className="mt-1 text-[12px] leading-snug text-[var(--color-ink-muted)]">
              A markdown file of every touchpoint you logged and every to-do you
              completed this week, grouped by account, for pasting into an AI agent
              as context.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={exporting}
            onClick={() => void exportActivity()}
          >
            {exporting ? 'Preparing…' : 'Export…'}
          </Button>
        </div>

        {status && (
          <p className="break-all text-[11px] leading-snug text-[var(--color-ink-muted)]">
            {status}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
