import discordIcon from '../assets/channels/discord.svg'
import gmailIcon from '../assets/channels/gmail.svg'
import slackIcon from '../assets/channels/slack.svg'
import teamsIcon from '../assets/channels/teams.svg'

/**
 * Where an account's contact is reachable — one choice per account, shared
 * across every layout, exactly like the card colour.
 *
 * Not to be confused with `TouchChannel`: that records how a single logged
 * outreach went out (email, call, meeting…), and there can be many per account.
 * This is a standing property of the relationship.
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

/**
 * Vendored marks, imported so the bundler fingerprints them and the renderer
 * never reaches the network for chrome. See assets/channels/SOURCES.md.
 */
export const CHANNEL_ICONS: Record<ContactChannel, string> = {
  slack: slackIcon,
  gmail: gmailIcon,
  teams: teamsIcon,
  discord: discordIcon
}

/**
 * Per-mark optical correction. Gmail's envelope has no internal margin and its
 * mark is the widest of the set, so at a matched height it crowds its
 * neighbours; every other mark carries its own padding already.
 */
export const CHANNEL_ICON_CLASS: Partial<Record<ContactChannel, string>> = {
  gmail: 'p-0.5'
}

export function isContactChannel(value: unknown): value is ContactChannel {
  return typeof value === 'string' && (CONTACT_CHANNELS as readonly string[]).includes(value)
}
