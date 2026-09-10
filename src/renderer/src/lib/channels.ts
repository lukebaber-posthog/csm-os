import discordIcon from '../assets/channels/discord.svg'
import gmailIcon from '../assets/channels/gmail.svg'
import slackIcon from '../assets/channels/slack.svg'
import teamsIcon from '../assets/channels/teams.svg'
import type { ContactChannel } from '../../../core/channels'

/*
 * The channel set and its guard live in `src/core/channels`, shared with the
 * MCP server. The marks stay here: they are imported SVG files, and only a
 * bundler can turn those into URLs.
 */
export * from '../../../core/channels'

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
