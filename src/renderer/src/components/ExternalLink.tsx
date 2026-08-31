import { cn } from '@/lib/utils'
import { linkHref } from '../lib/links'

interface Props {
  /** The URL as the user typed it. */
  url: string
  /** Sizing and spacing; the colour and underline are the component's. */
  className?: string
}

/**
 * A link the user typed, rendered so it opens in their browser.
 *
 * `target="_blank"` is not cosmetic: the main process turns an attempt to open a
 * window into `shell.openExternal` (see `setWindowOpenHandler` in `main/index`),
 * so this is what sends the link out. A same-tab href would instead navigate the
 * renderer itself away from the app, with no way back.
 *
 * Shows the text as typed and links the normalised href, so what you read is
 * what you wrote and what you click is what will open. Text that `linkHref`
 * won't vouch for still renders — just not as something clickable, which says
 * more than quietly dropping it would.
 *
 * Shared by the outreach log and to-do cards rather than written twice, because
 * "what is safe to open, and what does the user see" should not be able to
 * differ between two places that both hold a pasted URL.
 */
export function ExternalLink({ url, className }: Props) {
  const href = linkHref(url)
  const text = url.trim()

  if (!href) {
    return (
      <span
        title={text}
        className={cn('block truncate text-[var(--color-ink-faint)]', className)}
      >
        {text}
      </span>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={href}
      /*
       * A to-do card is itself a click target (opens the editor) sitting on a
       * drag sensor armed by pointerdown, so without these the link would open
       * the editor instead of the page, and a press-and-drag from it would take
       * the card with it. Redundant in the outreach panel, where nothing in the
       * ancestry handles either — kept here so the component is safe wherever it
       * lands rather than correct only at one call site.
       */
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'block truncate text-[var(--color-ink-muted)] underline',
        'decoration-[var(--color-line-strong)] underline-offset-2 transition-colors',
        'hover:text-[var(--color-ink)] hover:decoration-current',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)]',
        className
      )}
    >
      {text}
    </a>
  )
}
