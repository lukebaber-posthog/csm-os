/**
 * Where an account's contact is reachable — one choice per account, shared
 * across every layout, exactly like the card colour.
 *
 * Not to be confused with `TouchChannel`: that records how a single logged
 * outreach went out (email, call, meeting…), and there can be many per account.
 * This is a standing property of the relationship.
 *
 * The marks that go with these live in the renderer's `lib/channels`, because
 * they are imported SVG files and only a bundler can produce those.
 */

/**
 * Order is the order of the segments in the pill. Only real services: a
 * catch-all "other" told you an account wasn't on any of these, which is not
 * something worth a segment — leaving it unset says the same thing.
 */
export const CONTACT_CHANNELS = ['slack', 'gmail', 'teams', 'discord'] as const
export type ContactChannel = (typeof CONTACT_CHANNELS)[number]

export const CHANNEL_LABELS: Record<ContactChannel, string> = {
  slack: 'Slack',
  gmail: 'Gmail',
  teams: 'Microsoft Teams',
  discord: 'Discord'
}

export function isContactChannel(value: unknown): value is ContactChannel {
  return typeof value === 'string' && (CONTACT_CHANNELS as readonly string[]).includes(value)
}
