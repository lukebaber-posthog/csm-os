import { z } from 'zod'
import { addTouch, deleteTouch, loadTouches, updateTouch } from '../../core/board.js'
import { carriesUrl } from '../../core/touchChannels.js'
import { TOUCH_CHANNELS, type TouchChannel } from '../../shared/types.js'
import { resolveAccount } from '../accounts.js'
import { tool, type Ctx } from '../tool.js'

/**
 * Noon UTC, matching what the app writes when you pick a date in the touch form.
 *
 * The form has no time field, so a date has to become a timestamp somehow, and
 * the app's answer is the middle of the day. Writing midnight instead would put
 * touches an hour or two either side of a date boundary depending on the
 * reader's timezone, and days-since-contact would disagree with the form.
 */
function atNoon(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error(`"${day}" is not a date. Use YYYY-MM-DD.`)
  }
  return `${day}T17:00:00.000Z`
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

const channelArg = z
  .enum(TOUCH_CHANNELS as unknown as [TouchChannel, ...TouchChannel[]])
  .describe(
    'How the outreach went out. "link" is the odd one — it records something you sent, and is ' +
      'the only channel that carries a url.'
  )

export const touchTools = [
  tool<{
    account: string
    channel: TouchChannel
    note?: string
    url?: string
    date?: string
    allowDuplicate?: boolean
  }>({
    name: 'log_touch',
    title: 'Log an outreach touch',
    description:
      'Records contact with an account. This is what drives days-since-contact, which column a ' +
      'card sits in on the cadence layout, and the weekly export — so it should reflect ' +
      'outreach that actually happened.',
    inputSchema: {
      account: z.string().describe('Account name or org id.'),
      channel: channelArg,
      note: z.string().optional().describe('What was said or sent.'),
      url: z
        .string()
        .optional()
        .describe('Only meaningful on the "link" channel; dropped on every other.'),
      date: z
        .string()
        .optional()
        .describe('YYYY-MM-DD. Defaults to today.'),
      allowDuplicate: z
        .boolean()
        .optional()
        .describe('Write even when this account already has a touch on that date.')
    },
    async handler({ account, channel, note, url, date, allowDuplicate }, ctx: Ctx) {
      const found = resolveAccount(ctx.book(), account)
      const day = date ?? today()

      /*
       * Re-running a batch is the obvious way to get this wrong — a repeated
       * prompt would otherwise double every entry silently, and the duplicates
       * are only visible one account at a time in the drawer.
       */
      if (!allowDuplicate) {
        const existing = await loadTouches(ctx.email, found.orgId)
        const clash = existing.find((t) => t.occurredAt.slice(0, 10) === day)
        if (clash) {
          throw new Error(
            `${found.orgName} already has a ${clash.channel} touch logged on ${day}: ` +
              `${(clash.note ?? '(no note)').slice(0, 80)}. ` +
              'Pass allowDuplicate: true if a second one is genuinely right.'
          )
        }
      }

      if (url && !carriesUrl(channel)) {
        throw new Error(
          `A "${channel}" touch does not carry a url — only "link" does. ` +
            'Put the address in the note, or log it as a link.'
        )
      }

      await addTouch(ctx.email, found.orgId, {
        channel,
        note: note ?? '',
        url: url ?? '',
        occurredAt: atNoon(day)
      })
      return { account: found.orgName, channel, date: day, note: note ?? null }
    }
  }),

  tool<{
    id: string
    channel: TouchChannel
    note?: string
    url?: string
    date: string
  }>({
    name: 'update_touch',
    title: 'Edit a logged touch',
    description:
      'Rewrites a touch. Every field is written, so anything left out is cleared — read the ' +
      'entry with get_account first. Changing the date recomputes days-since-contact.',
    inputSchema: {
      id: z.string().describe('Touch id, from get_account.'),
      channel: channelArg,
      note: z.string().optional(),
      url: z.string().optional(),
      date: z.string().describe('YYYY-MM-DD.')
    },
    async handler({ id, channel, note, url, date }, _ctx: Ctx) {
      await updateTouch(id, {
        channel,
        note: note ?? '',
        url: url ?? '',
        occurredAt: atNoon(date)
      })
      return { id, channel, date }
    }
  }),

  tool<{ id: string }>({
    name: 'delete_touch',
    title: 'Delete a logged touch',
    description:
      'Removes a touch permanently. There is no undo, and it will move the account on the ' +
      'cadence board if it was the most recent one.',
    destructive: true,
    inputSchema: { id: z.string().describe('Touch id, from get_account.') },
    async handler({ id }, _ctx: Ctx) {
      await deleteTouch(id)
      return { id, deleted: true }
    }
  })
]
