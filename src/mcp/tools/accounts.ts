import { z } from 'zod'
import {
  accountPositionFor,
  ensureCards,
  loadCardProps,
  loadLastTouches,
  loadColumns,
  loadPlacements,
  loadStages,
  loadTouches,
  movePlacement,
  reconcilePlacements,
  setCardChannel,
  setCardColor
} from '../../core/board.js'
import { CARD_COLORS, isCardColor, type CardColor } from '../../core/colors.js'
import { CONTACT_CHANNELS, isContactChannel, type ContactChannel } from '../../core/channels.js'
import { DEFAULT_LAYOUT, cadenceBucketOf, layoutDef } from '../../core/layouts.js'
import { resolveAccount } from '../accounts.js'
import { tool, type Ctx } from '../tool.js'

/** Whole days since an ISO timestamp, or null when there is none. */
function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  return Math.floor((Date.now() - then) / 86_400_000)
}

/**
 * Which column an account sits in, for one layout.
 *
 * Computed layouts have no stored placement — the column is a fact about the
 * touch log — so this has to ask the rule rather than the table, exactly as
 * `useBoard` does. Reading `board_placements` for cadence would return either
 * nothing or a stale row from before the layout became computed.
 */
function columnOf(
  layoutKey: string,
  orgId: string,
  placements: { orgId: string; stageKey: string }[],
  lastTouch: string | null
): string | null {
  if (layoutDef(layoutKey).computed) return cadenceBucketOf(daysSince(lastTouch))
  return placements.find((p) => p.orgId === orgId)?.stageKey ?? null
}

const layoutArg = z
  .string()
  .optional()
  .describe(`Layout key. Defaults to "${DEFAULT_LAYOUT}". See list_layouts.`)

export const accountTools = [
  tool<{ layout?: string; staleOnly?: boolean }>({
    name: 'list_accounts',
    title: 'List accounts',
    description:
      'Every account in the book with its ARR, card colour, contact channel, days since last ' +
      'contact, and which column it currently sits in. The starting point for almost any ' +
      'question about the board.',
    readOnly: true,
    inputSchema: {
      layout: layoutArg,
      staleOnly: z
        .boolean()
        .optional()
        .describe('Only accounts with no contact logged, or none in over 30 days.')
    },
    async handler({ layout, staleOnly }, ctx: Ctx) {
      const layoutKey = layout ?? DEFAULT_LAYOUT
      const book = ctx.book()
      const [props, lastTouches, placements, stages] = await Promise.all([
        loadCardProps(ctx.email),
        loadLastTouches(ctx.email),
        layoutDef(layoutKey).computed
          ? Promise.resolve([])
          : loadPlacements(ctx.email, layoutKey),
        loadColumns(ctx.email, layoutKey)
      ])

      const labelOf = new Map(stages.map((s) => [s.key, s.label]))
      const rows = book.accounts.map((a) => {
        const last = lastTouches[a.orgId] ?? null
        const stageKey = columnOf(layoutKey, a.orgId, placements, last)
        return {
          orgId: a.orgId,
          name: a.orgName,
          arr: a.arr,
          domain: a.domain,
          color: props.colors[a.orgId] ?? null,
          contactChannel: props.channels[a.orgId] ?? null,
          lastTouchedAt: last,
          daysSinceContact: daysSince(last),
          column: stageKey ? (labelOf.get(stageKey) ?? stageKey) : null,
          columnKey: stageKey
        }
      })

      const filtered = staleOnly
        ? rows.filter((r) => r.daysSinceContact === null || r.daysSinceContact > 30)
        : rows

      return {
        layout: layoutKey,
        bookFetchedAt: book.fetchedAt,
        count: filtered.length,
        accounts: filtered.sort((a, b) => a.name.localeCompare(b.name))
      }
    }
  }),

  tool<{ account: string }>({
    name: 'get_account',
    title: 'Get one account',
    description:
      'One account with its full outreach log, newest first. Use this before writing a touch, ' +
      'to see what has already been logged.',
    readOnly: true,
    inputSchema: {
      account: z.string().describe('Account name or org id. Names are matched loosely.')
    },
    async handler({ account }, ctx: Ctx) {
      const found = resolveAccount(ctx.book(), account)
      const [props, touches] = await Promise.all([
        loadCardProps(ctx.email),
        loadTouches(ctx.email, found.orgId)
      ])
      return {
        orgId: found.orgId,
        name: found.orgName,
        arr: found.arr,
        segment: found.segment,
        domain: found.domain,
        csmDateAssigned: found.csmDateAssigned,
        color: props.colors[found.orgId] ?? null,
        contactChannel: props.channels[found.orgId] ?? null,
        touches
      }
    }
  }),

  tool<{ account: string; color: string | null }>({
    name: 'set_account_color',
    title: 'Set an account card colour',
    description:
      'Tints an account card. The colour belongs to the account, so it shows in every layout. ' +
      'Pass null to go back to monochrome.',
    inputSchema: {
      account: z.string().describe('Account name or org id.'),
      color: z
        .enum(CARD_COLORS as unknown as [CardColor, ...CardColor[]])
        .nullable()
        .describe('One of the card colours, or null to clear.')
    },
    async handler({ account, color }, ctx: Ctx) {
      const found = resolveAccount(ctx.book(), account)
      if (color !== null && !isCardColor(color)) throw new Error(`"${color}" is not a card colour.`)
      await setCardColor(ctx.email, found.orgId, color)
      return { account: found.orgName, color }
    }
  }),

  tool<{ account: string; channel: string | null }>({
    name: 'set_account_channel',
    title: 'Set where an account is reachable',
    description:
      'Records the standing channel for the relationship (Slack, Gmail, Teams, Discord). Not ' +
      'the same as a logged touch — this is where the contact lives, not how one message went.',
    inputSchema: {
      account: z.string().describe('Account name or org id.'),
      channel: z
        .enum(CONTACT_CHANNELS as unknown as [ContactChannel, ...ContactChannel[]])
        .nullable()
        .describe('Contact channel, or null to clear.')
    },
    async handler({ account, channel }, ctx: Ctx) {
      const found = resolveAccount(ctx.book(), account)
      if (channel !== null && !isContactChannel(channel)) {
        throw new Error(`"${channel}" is not a contact channel.`)
      }
      await setCardChannel(ctx.email, found.orgId, channel)
      return { account: found.orgName, channel }
    }
  }),

  tool<{ account: string; column: string; layout?: string; index?: number }>({
    name: 'move_account',
    title: 'Move an account to a column',
    description:
      'Moves a card into a column of a draggable layout. Refused on the cadence layout, where ' +
      'the column is computed from the touch log — log a touch there instead.',
    inputSchema: {
      account: z.string().describe('Account name or org id.'),
      column: z.string().describe('Target column, by key or by label.'),
      layout: layoutArg,
      index: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Position within the column, 0 being the top. Defaults to the bottom.')
    },
    async handler({ account, column, layout, index }, ctx: Ctx) {
      const layoutKey = layout ?? DEFAULT_LAYOUT

      /*
       * The same guard `useBoard.move` carries. A computed layout has no
       * placement to write, so a row written here would be one nothing ever
       * reads — and the card would not move, which looks like a silent failure.
       */
      if (layoutDef(layoutKey).computed) {
        throw new Error(
          `The "${layoutKey}" layout is computed from each account's last contact, so a card ` +
            'cannot be moved into a column directly. Use log_touch — the card moves when the ' +
            'underlying fact changes.'
        )
      }

      const found = resolveAccount(ctx.book(), account)
      const stages = await loadStages(ctx.email, layoutKey)
      const lower = column.trim().toLowerCase()
      const stage = stages.find(
        (s) => s.key === column || s.label.toLowerCase() === lower
      )
      if (!stage) {
        throw new Error(
          `No column "${column}" in layout "${layoutKey}". ` +
            `Columns are: ${stages.map((s) => s.label).join(', ')}.`
        )
      }

      // New accounts need a placement row before one can be moved, which is the
      // same reconcile the board runs on load.
      const existing = await loadPlacements(ctx.email, layoutKey)
      await ensureCards(ctx.email, ctx.book().accounts)
      const placements = await reconcilePlacements(
        ctx.email,
        layoutKey,
        ctx.book().accounts,
        existing
      )

      const inColumn = placements.filter(
        (p) => p.stageKey === stage.key && p.orgId !== found.orgId
      ).length
      const toIndex = index ?? inColumn
      const position = accountPositionFor(placements, found.orgId, stage.key, toIndex)
      await movePlacement(ctx.email, layoutKey, found.orgId, stage.key, position)

      return { account: found.orgName, layout: layoutKey, column: stage.label, index: toIndex }
    }
  })
]
