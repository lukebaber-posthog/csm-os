import type { TouchChannel } from '../../../shared/types'

/**
 * Display and validation for `TouchChannel` — how one logged outreach went out.
 *
 * Deliberately not in `lib/channels.ts`, which is `ContactChannel`: where an
 * account's contact lives, one standing choice per account. The two share the
 * word and one value ('slack'), which is exactly why mixing them silently
 * half-works. See the README's note on the collision.
 *
 * Pure — the marks themselves live in `components/TouchChannelIcon`, and turning
 * a typed URL into a safe href lives in `lib/links`, shared with to-dos.
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
