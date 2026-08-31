import { Calendar, Link2, MoreHorizontal, Phone, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TouchChannel } from '../../../shared/types'
import gmailIcon from '../assets/channels/gmail.svg'
import slackIcon from '../assets/channels/slack.svg'
import { TOUCH_CHANNEL_LABELS } from '../lib/touchChannels'

/**
 * One mark per outreach channel, for the picker and the history list.
 *
 * Two kinds of mark, deliberately mixed. Email and Slack name a *product*, so
 * they get that product's own logo — the vendored full-colour files already in
 * `assets/channels/`, shared with the contact pill rather than copied. The other
 * four name an act, not a service, so they are `currentColor` lucide glyphs that
 * follow the row they sit in. Drawing Call or Meeting in some invented brand
 * colour would imply a vendor that isn't there.
 *
 * Every mark renders into a fixed square box whatever its own aspect ratio, so
 * the labels line up down the dropdown — the same trick `TodoForm` plays with an
 * empty box beside "No account yet".
 */

/** Full-colour product logos, rendered as `<img>` like the contact pill's. */
const BRAND: Partial<Record<TouchChannel, string>> = {
  email: gmailIcon,
  slack: slackIcon
}

/**
 * `Link2` rather than `Link`: the single straight chain link, which is the mark
 * used for a hyperlink everywhere else. `MoreHorizontal` for Other, because the
 * honest glyph for "none of the above" is an ellipsis — anything more specific
 * would be a sixth category wearing a fifth one's clothes.
 */
const GLYPH: Partial<Record<TouchChannel, LucideIcon>> = {
  call: Phone,
  meeting: Calendar,
  link: Link2,
  other: MoreHorizontal
}

interface Props {
  channel: TouchChannel
  /** Applied to the box, not the mark. Sizing is fixed on purpose. */
  className?: string
}

export function TouchChannelIcon({ channel, className }: Props) {
  const brand = BRAND[channel]
  const Glyph = GLYPH[channel]

  return (
    <span
      aria-hidden
      title={TOUCH_CHANNEL_LABELS[channel]}
      className={cn('flex h-4 w-4 shrink-0 items-center justify-center', className)}
    >
      {brand ? (
        <img
          src={brand}
          alt=""
          // Images drag natively, which would spawn a ghost inside the panel.
          draggable={false}
          // Sized by height, not into a square box: Gmail's mark is 4:3, so a
          // square box renders it a quarter shorter than everything beside it.
          style={{ height: 13, width: 'auto' }}
        />
      ) : (
        Glyph && (
          // `size-` and `text-` prefixes are load-bearing inside a Select: the
          // primitive restyles any descendant svg that carries neither, which
          // would resize these to 16px and repaint them muted-foreground.
          <Glyph className="size-[15px] text-current" strokeWidth={1.75} />
        )
      )}
    </span>
  )
}
