import { useState, type FormEvent } from 'react'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Notice } from './ui/Notice'
import { AuthShell } from './AuthShell'

const KEYS_URL = 'https://us.posthog.com/settings/user-api-keys'

export function PostHogConnect({
  email,
  onConnected,
  onBack
}: {
  email: string
  onConnected: () => void
  onBack: () => void
}) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setWarning(null)

    const result = await window.api.posthog.connect(key)
    if (!result.ok) {
      setError(result.error)
      setBusy(false)
      return
    }

    // Not a hard block: the board queries by the signed-in email, so a
    // mismatched key still works. Worth flagging in case it is a mistake.
    if (result.data.email.toLowerCase() !== email.toLowerCase()) {
      setWarning(
        `That key belongs to ${result.data.email}, but you signed in as ${email}. The board will still load ${email}'s accounts.`
      )
      setBusy(false)
      return
    }

    onConnected()
  }

  return (
    <AuthShell
      step="Step 2 of 2"
      title="Connect PostHog"
      caption="Your accounts are read live from PostHog. The key is encrypted in your OS keychain and never leaves this machine."
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-[12px] font-medium uppercase tracking-wider text-[var(--color-ink-muted)]">
            Personal API key
          </span>
          <Input
            type="password"
            autoFocus
            required
            spellCheck={false}
            value={key}
            placeholder="phx_…"
            onChange={(e) => setKey(e.target.value)}
            disabled={busy}
            className="font-mono text-[13px]"
          />
        </label>

        <Notice>
          Create one in{' '}
          <a
            href={KEYS_URL}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[var(--color-ink)] underline decoration-[var(--color-line-strong)] underline-offset-2 hover:decoration-[var(--color-ink)]"
          >
            PostHog → Personal API keys
          </a>
          . It needs the <code className="font-mono text-[12px]">query:read</code> scope, scoped to
          the <span className="font-medium text-[var(--color-ink)]">PostHog App + Website</span>{' '}
          project.
        </Notice>

        {error && <Notice tone="error">{error}</Notice>}
        {warning && <Notice tone="error">{warning}</Notice>}

        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onBack} disabled={busy}>
            Back
          </Button>
          <Button type="submit" className="flex-1" disabled={busy || !key.trim()}>
            {busy ? 'Verifying…' : warning ? 'Use this key anyway' : 'Connect'}
          </Button>
        </div>
        {warning && (
          <button
            type="button"
            onClick={onConnected}
            className="w-full text-center text-[12px] text-[var(--color-ink-muted)] underline decoration-dotted hover:text-[var(--color-ink)]"
          >
            Continue to the board
          </button>
        )}
      </form>
    </AuthShell>
  )
}
