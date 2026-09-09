import { useCallback, useEffect, useState } from 'react'
import { MotionConfig } from 'motion/react'
import { LoginScreen } from './components/LoginScreen'
import { PostHogConnect } from './components/PostHogConnect'
import { BoardScreen } from './components/BoardScreen'
import { Notice } from './components/ui/Notice'
import { Spinner } from './components/ui/Spinner'
import { requireBridge } from './lib/bridge'
import { useTheme } from './hooks/useTheme'

const EMAIL_KEY = 'csm-os:email'

type Stage = 'checking' | 'login' | 'connect' | 'board'

export function App() {
  const { theme, toggle } = useTheme()
  const [stage, setStage] = useState<Stage>('checking')
  const [email, setEmail] = useState<string | null>(null)
  /** Set when the preload bridge is missing, which no retry can fix. */
  const [bridgeError, setBridgeError] = useState<string | null>(null)

  /**
   * Decides the opening screen from the saved email and stored PostHog key.
   *
   * Goes through `requireBridge` rather than touching `window.api` directly, and
   * catches. This is the app's first bridge call, so it is where a missing
   * preload surfaces — and it used to surface as nothing at all: the TypeError
   * rejected inside the `void` at the call site, `setStage` never ran, and the
   * app sat on "Starting up…" for ever with no error anywhere.
   *
   * Two ways to reach that. Opening the dev server in a plain browser, where
   * there is no preload and never will be. And a stale preload under a
   * long-running `pnpm dev` — the renderer hot-reloads, the preload does not, so
   * a renderer can outrun the bridge it is calling (see `lib/bridge`). Both now
   * say so instead of hanging.
   */
  const resolveStage = useCallback(async (candidate: string | null) => {
    if (!candidate) {
      setStage('login')
      return
    }
    try {
      const status = await requireBridge('posthog').status()
      setStage(status.ok && status.data.connected ? 'board' : 'connect')
    } catch (err) {
      setBridgeError(err instanceof Error ? err.message : String(err))
    }
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

  // Before the spinner: a missing bridge is terminal, so showing "Starting up…"
  // under it would be a lie that never resolves.
  if (bridgeError) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--color-page)] px-6">
        <div className="max-w-md">
          <Notice tone="error">{bridgeError}</Notice>
        </div>
      </div>
    )
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
    /*
     * reducedMotion="user" strips transform and layout animations from every
     * motion component while keeping opacity, which is exactly the fallback the
     * completion effects want. Note the deliberate asymmetry with dark mode: that
     * is a class on <html> because the brief wanted light as the default with dark
     * as an opt-in, whereas reduced motion IS read from the media query, because it
     * is an accessibility signal from the OS rather than a style preference.
     *
     * This is not the only guard — it reaches neither the confetti canvas nor the
     * CSS-keyframe effects, so lib/completionFx.ts short-circuits as well.
     */
    <MotionConfig reducedMotion="user">
      <BoardScreen
        email={email}
        theme={theme}
        onToggleTheme={toggle}
        onSignOut={() => void signOut()}
      />
    </MotionConfig>
  )
}
