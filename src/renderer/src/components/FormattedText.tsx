import { Fragment } from 'react'
import { noteColorRgb, parseNote, type Node } from '../lib/noteMarkup'
import { CODE_CHIP } from '../lib/noteStyles'
import { ExternalLink } from './ExternalLink'

/**
 * Renders the note dialect — code, bold, italic, underline, colour.
 *
 * Was `InlineCode`, which did code alone. The dialect and the reasoning behind
 * each delimiter live in `lib/noteMarkup`; this is only the paint.
 *
 * Everything is sized in `em` and coloured from the current context, so one
 * component serves a 13px card title, an 11px note and a 12px row in the
 * completed list without any of them being handed its own values.
 */

function render(nodes: Node[]): React.ReactNode {
  return nodes.map((node, i) => {
    switch (node.kind) {
      case 'text':
        return <Fragment key={i}>{node.text}</Fragment>

      case 'code':
        // The class list is shared with the editor, which paints the same chip
        // while the note is being typed. See `lib/noteStyles`.
        return (
          <code key={i} className={CODE_CHIP}>
            {node.text}
          </code>
        )

      case 'link':
        // Through ExternalLink rather than a bare <a>: it owns the http(s)-only
        // rule and the target that hands the URL to the real browser, and a link
        // typed into a note must not get a weaker version of either than one
        // typed into the outreach log.
        return (
          <ExternalLink key={i} url={node.url} inline>
            {render(node.children)}
          </ExternalLink>
        )

      case 'bold':
        return (
          <strong key={i} className="font-bold">
            {render(node.children)}
          </strong>
        )

      case 'italic':
        return (
          <em key={i} className="italic">
            {render(node.children)}
          </em>
        )

      case 'underline':
        return (
          // `underline-offset` so a descender does not sit on the rule.
          <span key={i} className="underline underline-offset-2">
            {render(node.children)}
          </span>
        )

      case 'color':
        return (
          // Inline, because a Tailwind arbitrary value cannot interpolate the
          // palette — the same reason `cardSurfaceStyle` and the completion
          // rail's glow are inline.
          <span key={i} style={{ color: `rgb(${noteColorRgb(node.color)})` }}>
            {render(node.children)}
          </span>
        )
    }
  })
}

export function FormattedText({ text }: { text: string }) {
  return <>{render(parseNote(text))}</>
}
