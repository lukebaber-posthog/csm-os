import type { ActivityTouch, Todo } from './board'
import { BUCKET_LABELS } from './todos'
import { linkHref } from './touchChannels'

/**
 * Turns a week of activity into a markdown document meant to be pasted into an AI
 * agent as context.
 *
 * Pure: takes rows, returns a string. That keeps the shape of the document
 * something you can reason about and change without a database or an Electron
 * window in the loop.
 *
 * Written for a reader that has no other context, which drives most of the
 * choices here: account names rather than org ids, weekday-and-date rather than
 * ISO timestamps, explicit counts so the agent knows the scope of what it has,
 * and an explicit note when a section is empty rather than a silently absent
 * heading — "no touchpoints logged" and "this export omitted touchpoints" should
 * not look the same.
 */

export interface ActivityExport {
  email: string
  /** Inclusive start of the window, ISO. */
  sinceIso: string
  /** When the export was taken, ISO. */
  generatedAtIso: string
  touches: ActivityTouch[]
  completed: Todo[]
  /** Account name by org id. Missing ids fall back to the id itself. */
  orgNames: Record<string, string>
}

const dayFormat: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: 'numeric',
  month: 'short'
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, dayFormat)
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/*
 * Capitalised in place rather than mapped through channels.ts. `CHANNEL_LABELS`
 * there is for ContactChannel — where an account is reachable: slack, gmail,
 * teams, discord — and this is TouchChannel: how one logged outreach went out,
 * email, call, meeting, slack, link, other. Only 'slack' appears in both, so
 * mapping through the wrong one silently blanks five of the six. Same
 * distinction the account panel keeps, and the same one the README calls out.
 *
 * `TOUCH_CHANNEL_LABELS` in `touchChannels.ts` is the right map and would work,
 * but every label in it is the value capitalised, so importing it here would buy
 * a coupling and nothing else.
 */
function channelLabel(channel: string): string {
  return channel.charAt(0).toUpperCase() + channel.slice(1)
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * Indents a note under its bullet and keeps its own line breaks.
 *
 * A note is free text a human typed, so it can contain blank lines and its own
 * markdown. Blank lines inside a list item end the item, so each line is indented
 * to keep it attached to its bullet, and empty lines become an indented `>` rather
 * than nothing.
 */
function quoteNote(note: string, indent: string): string {
  return note
    .trim()
    .split('\n')
    .map((line) => {
      const text = line.trimEnd()
      // A truly empty line, not an indented one. Markdown reads a blank line
      // followed by indented text as a new paragraph *within* the list item, which
      // is what we want; emitting the indent instead just leaves trailing
      // whitespace that some renderers turn into a hard break.
      return text ? `${indent}${text}` : ''
    })
    .join('\n')
}

export function buildActivityMarkdown(input: ActivityExport): string {
  const { email, sinceIso, generatedAtIso, touches, completed, orgNames } = input
  const nameOf = (orgId: string | null): string | null =>
    orgId ? (orgNames[orgId] ?? orgId) : null

  const out: string[] = []

  out.push(`# CSM activity — ${day(sinceIso)} to ${day(generatedAtIso)}`)
  out.push('')
  out.push(`- **Owner:** ${email}`)
  out.push(`- **Window:** ${day(sinceIso)} to ${day(generatedAtIso)} (7 days, inclusive)`)
  out.push(`- **Exported:** ${new Date(generatedAtIso).toLocaleString()}`)
  out.push(
    `- **Contents:** ${plural(touches.length, 'touchpoint', 'touchpoints')}, ` +
      `${plural(completed.length, 'to-do', 'to-dos')} completed`
  )
  out.push('')

  // --- Touchpoints, grouped by account ------------------------------------
  out.push('## Touchpoints')
  out.push('')

  if (touches.length === 0) {
    out.push('_No touchpoints logged in this window._')
    out.push('')
  } else {
    // Grouped by account because that is the unit a CSM thinks in, and it lets an
    // agent answer "what is going on with X" without scanning the whole document.
    const byAccount = new Map<string, ActivityTouch[]>()
    for (const touch of touches) {
      const key = nameOf(touch.orgId) ?? 'Unknown account'
      const list = byAccount.get(key)
      if (list) list.push(touch)
      else byAccount.set(key, [touch])
    }

    const accounts = [...byAccount.keys()].sort((a, b) => a.localeCompare(b))
    out.push(
      `${plural(touches.length, 'touchpoint', 'touchpoints')} across ` +
        `${plural(accounts.length, 'account', 'accounts')}.`
    )
    out.push('')

    for (const account of accounts) {
      const rows = byAccount.get(account) as ActivityTouch[]
      out.push(`### ${account}`)
      out.push('')
      for (const touch of rows) {
        const replied = touch.replied ? ' · they replied' : ''
        out.push(`- **${day(touch.occurredAt)}** · ${channelLabel(touch.channel)}${replied}`)
        if (touch.url) {
          // Angle brackets so every markdown renderer autolinks it, and so a URL
          // with parentheses or a trailing period cannot swallow them. Falls back
          // to the raw text when `linkHref` will not vouch for it — the document
          // should say what was logged either way.
          const href = linkHref(touch.url)
          out.push(`  ${href ? `<${href}>` : touch.url.trim()}`)
        }
        if (touch.note) {
          out.push(quoteNote(touch.note, '  '))
        }
      }
      out.push('')
    }
  }

  // --- Completed to-dos, grouped by the day they were finished -------------
  out.push('## Completed to-dos')
  out.push('')

  if (completed.length === 0) {
    out.push('_No to-dos completed in this window._')
    out.push('')
  } else {
    const byDay = new Map<string, Todo[]>()
    for (const todo of completed) {
      // Only rows with a completed_at reach here, but the type allows null.
      const when = todo.completedAt
      if (!when) continue
      const key = dayKey(when)
      const list = byDay.get(key)
      if (list) list.push(todo)
      else byDay.set(key, [todo])
    }

    // Newest day first, matching how the rows arrived.
    for (const key of [...byDay.keys()].sort().reverse()) {
      const rows = byDay.get(key) as Todo[]
      const first = rows[0].completedAt as string
      out.push(`### ${day(first)}`)
      out.push('')
      for (const todo of rows) {
        const account = nameOf(todo.orgId)
        const context = [BUCKET_LABELS[todo.bucket], account].filter(Boolean).join(' · ')
        out.push(`- ${todo.title} _(${context})_`)
        if (todo.note) {
          out.push(quoteNote(todo.note, '  '))
        }
      }
      out.push('')
    }
  }

  // A single trailing newline: most editors and diff tools expect one, and none
  // want the three that naive section joining leaves behind.
  return out.join('\n').replace(/\n{3,}$/, '\n')
}

/** `csm-activity-2026-08-19.md` — sorts chronologically in a file listing. */
export function activityFileName(generatedAtIso: string): string {
  const d = new Date(generatedAtIso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `csm-activity-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.md`
}
