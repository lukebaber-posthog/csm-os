import type { TouchChannel } from '../../../shared/types'

/**
 * Display and validation for `TouchChannel` — how one logged outreach went out.
 *
 * Deliberately not in `lib/channels.ts`, which is `ContactChannel`: where an
 * account's contact lives, one standing choice per account. The two share the
 * word and one value ('slack'), which is exactly why mixing them silently
 * half-works. See the README's note on the collision.
 *
 * Pure — the marks themselves live in `components/TouchChannelIcon`.
 */

export const TOUCH_CHANNEL_LABELS: Record<TouchChannel, string> = {
  email: 'Email',
  call: 'Call',
  meeting: 'Meeting',
  slack: 'Slack',
  link: 'Link',
  other: 'Other'
}

export function isTouchChannel(value: unknown): value is TouchChannel {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(TOUCH_CHANNEL_LABELS, value)
  )
}

/** The only channel whose entry carries a URL. */
export function carriesUrl(channel: TouchChannel): boolean {
  return channel === 'link'
}

function parse(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/**
 * The href to hang on a logged link, or null when there isn't a safe one.
 *
 * Two jobs, and both are load-bearing:
 *
 *  - **Fill in the scheme.** Pasting a URL usually brings one, but typing one
 *    ("posthog.com/docs") does not, and a bare host in an `href` is read as a
 *    *relative* path — the renderer would navigate itself to a file that isn't
 *    there rather than open a browser.
 *  - **Refuse anything that isn't http(s).** This is an Electron renderer with
 *    the app's own origin, so a `javascript:` href typed into the field would
 *    run there. Nothing else on the page takes a URL from the user, so this
 *    function is the whole boundary.
 *
 * The order matters. Anything that parses as a URL is judged on its protocol
 * and gets no second chance, so `javascript:`, `data:`, `file:` and `mailto:`
 * are refused rather than retried — retrying them is how you turn
 * `mailto:a@b.com` into a valid `https://mailto:a@b.com`, credentials and all.
 * Only text that is not a URL at all is tried as a bare host, and only when it
 * has no `//` of its own to splice into the scheme being added.
 *
 * The cost of that order is that `localhost:3000` reads as a URL with a
 * `localhost:` protocol and so is refused. Worth it: this field holds links you
 * sent a customer, and the alternative rule cannot tell a dev port from a
 * scheme you would rather not open.
 *
 * Returns the parsed `href`, not the raw text — normalised and, more to the
 * point, unambiguous about what will actually be opened.
 */
export function linkHref(raw: string | null | undefined): string | null {
  const text = raw?.trim()
  if (!text) return null

  const direct = parse(text)
  if (direct) {
    return direct.protocol === 'http:' || direct.protocol === 'https:' ? direct.href : null
  }

  if (text.includes('//')) return null
  const guessed = parse(`https://${text}`)
  return guessed?.protocol === 'https:' ? guessed.href : null
}

/**
 * Drops the URL from anything that is not a link touch.
 *
 * Exactly the job `normalizeTodoValues` does for `todos.org_id`, and for the
 * same reason: the form keeps the URL in state while you flip through the
 * channels, so switching to Call and back does not throw away what you had
 * pasted. That makes it someone's job to stop a stale URL reaching the row —
 * and it would not be cosmetic, since `TouchList` renders a clickable anchor
 * off `url` and a Call entry would sit there wearing a link.
 *
 * Applied in `useTouchLog` rather than in the form, so it covers both the add
 * and the edit path in one place.
 */
export function normalizeTouchValues<T extends { channel: TouchChannel; url: string }>(
  values: T
): T {
  return carriesUrl(values.channel) ? values : { ...values, url: '' }
}
