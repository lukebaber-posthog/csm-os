import { useState, type FormEvent } from 'react'
import { registerUser } from '../lib/board'
import { isTeamEmail, normalizeEmail, TEAM_DOMAIN } from '../lib/team'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Notice } from './ui/Notice'
import { Spinner } from './ui/Spinner'
import { AuthShell } from './AuthShell'

export function LoginScreen({ onSignedIn }: { onSignedIn: (email: string) => void }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const normalized = normalizeEmail(email)
    if (!normalized) return

    setBusy(true)
    setError(null)
    try {
      // The domain is the whole gate. Anyone at PostHog gets a board; which
      // accounts land on it comes from their own assignments, not from here.
      if (!isTeamEmail(normalized)) {
        setError(`Sign in with your @${TEAM_DOMAIN} address.`)
        return
      }
      await registerUser(normalized)
      onSignedIn(normalized)
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
