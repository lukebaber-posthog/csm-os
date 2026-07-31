import { useState, type FormEvent } from 'react'
import { isAllowlisted } from '../lib/board'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Notice } from './ui/Notice'
import { Spinner } from './ui/Spinner'
import { AuthShell } from './AuthShell'

export function LoginScreen({ onSignedIn }: { onSignedIn: (email: string) => void }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const normalized = email.trim().toLowerCase()
    if (!normalized) return

    setBusy(true)
    setError(null)
    try {
      if (await isAllowlisted(normalized)) {
        onSignedIn(normalized)
      } else {
        setError(`${normalized} is not on the allowlist for this board.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the database.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell step="Step 1 of 2" title="Sign in" caption="Your email scopes the board to your book of business.">
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-[12px] font-medium uppercase tracking-wider text-[var(--color-ink-muted)]">
            Email
          </span>
          <Input
            type="email"
            autoFocus
            required
            value={email}
            placeholder="you@posthog.com"
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </label>

        {error && <Notice tone="error">{error}</Notice>}

        <Button type="submit" className="w-full" disabled={busy || !email.trim()}>
          {busy ? 'Checking…' : 'Continue'}
        </Button>
        {busy && (
          <div className="flex justify-center pt-1">
            <Spinner />
          </div>
        )}
      </form>
    </AuthShell>
  )
}
