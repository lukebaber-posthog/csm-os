import { useCallback, useEffect, useState } from 'react'
import { LoginScreen } from './components/LoginScreen'
import { PostHogConnect } from './components/PostHogConnect'
import { BoardScreen } from './components/BoardScreen'
import { Spinner } from './components/ui/Spinner'
import { useTheme } from './hooks/useTheme'

const EMAIL_KEY = 'csm-os:email'

type Stage = 'checking' | 'login' | 'connect' | 'board'

export function App() {
  const { theme, toggle } = useTheme()
  const [stage, setStage] = useState<Stage>('checking')
  const [email, setEmail] = useState<string | null>(null)

  /** Decides the opening screen from the saved email and stored PostHog key. */
  const resolveStage = useCallback(async (candidate: string | null) => {
    if (!candidate) {
      setStage('login')
      return
    }
    const status = await window.api.posthog.status()
    setStage(status.ok && status.data.connected ? 'board' : 'connect')
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem(EMAIL_KEY)
    setEmail(saved)
    void resolveStage(saved)
  }, [resolveStage])

  function signIn(value: string) {
    localStorage.setItem(EMAIL_KEY, value)
    setEmail(value)
    void resolveStage(value)
  }

  async function signOut() {
    // Clears the identity but keeps the PostHog key in the keychain, so
    // signing back in doesn't mean pasting the key again.
    localStorage.removeItem(EMAIL_KEY)
    setEmail(null)
    setStage('login')
  }

  if (stage === 'checking') {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--color-page)]">
        <Spinner label="Starting up…" />
      </div>
    )
  }

  if (stage === 'login' || !email) {
    return <LoginScreen onSignedIn={signIn} />
  }

  if (stage === 'connect') {
    return (
      <PostHogConnect
        email={email}
        onConnected={() => setStage('board')}
        onBack={() => void signOut()}
      />
    )
  }

  return (
    <BoardScreen email={email} theme={theme} onToggleTheme={toggle} onSignOut={() => void signOut()} />
  )
}
