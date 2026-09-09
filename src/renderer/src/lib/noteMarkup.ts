import { isCardColor, rgbOf, type CardColor } from './colors'

/**
 * The small markup dialect a to-do title or note is written in, and its parser.
 *
 * Not markdown, and not a subset of it either — a deliberate near-miss. Every
 * delimiter here was chosen so that text a CSM actually types cannot be read as
 * markup by accident, which real markdown fails at immediately: `$set_once`
 * contains an underscore pair, so a markdown renderer italicises the middle of
 * a PostHog property name.
 *
 * Hence:
 *  - *italic* is asterisk-only. Underscores are never a delimiter, anywhere.
 *  - ++underline++ is doubled, because markdown has no underline and a single
 *    `+` starts a list item in some dialects and appears in plain arithmetic.
 *  - {blue|text} for colour, which markdown cannot express at all. A brace form
 *    rather than raw HTML, so nothing the user types is ever interpreted as
 *    markup by the browser.
 *
 * The one borrowing is [text](url), which markdown gets right: a bracketed run
 * followed with no gap by a parenthesised one is not a shape that turns up in a
 * note by accident, and it is the syntax anyone who has written a README already
 * has in their fingers.
 *
 * Pure — the rendering lives in `components/FormattedText`.
 */

export type NoteColor = CardColor

/**
 * Six, chosen as a spread rather than as the whole palette.
 *
 * This started at ten — the seven card hues plus orange, cyan and slate — which
 * put three near-duplicate pairs in the picker and made the swatches a grid to
 * read rather than a row to point at. Six is one sweep of the wheel with no two
 * adjacent, so every entry is telling you something the others aren't.
 */
export const NOTE_COLORS: readonly NoteColor[] = [
  'red',
  'amber',
  'green',
  'teal',
  'blue',
  'violet'
]

export function noteColorRgb(color: NoteColor): string {
  return rgbOf(color)
}

/**
 * Any card hue, not just the six the picker offers.
 *
 * The parser is deliberately the more generous of the two: trimming the picker
 * should change what you can write next, not turn `{pink|…}` in a note you
 * already have into a pair of visible braces.
 */
export function isNoteColor(value: string): value is NoteColor {
  return isCardColor(value)
}

export type Node =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; url: string; children: Node[] }
  | { kind: 'bold'; children: Node[] }
  | { kind: 'italic'; children: Node[] }
  | { kind: 'underline'; children: Node[] }
  | { kind: 'color'; color: NoteColor; children: Node[] }

/**
 * Ordered, and the order is load-bearing twice over.
 *
 * `code` is first so nothing inside a code span is ever treated as markup — a
 * snippet containing `**` should render those asterisks, not go bold. `bold`
 * precedes `italic` because `**x**` would otherwise match the italic rule first
 * and leave stray asterisks on both sides.
 *
 * Every pattern refuses to cross a newline and requires content, so an unclosed
 * delimiter cannot swallow the rest of a note hunting for its partner — it just
 * stays the literal character someone typed.
 *
 * The emphasis rules also require a **non-space against the inside of each
 * delimiter**, which markdown does too and for the same reason: without it
 * `2 * 3 * 4` is italic from the first asterisk to the second. It matters more
 * here than in markdown, because the editor writes this text as well as reading
 * it — select "ship it " with the trailing space, press bold, and `**ship it **`
 * would come back as literal asterisks on the card. `lib/noteDoc` shrinks a mark
 * off its own whitespace on the way out to hold up this end of the bargain.
 */
const RULES = [
  { kind: 'code', re: /`([^`\n]+)`/ },
  /*
   * The URL half stops at a space or a closing paren, so an unclosed `(` cannot
   * run off into the rest of the note. The toolbar percent-encodes both before
   * writing a link, which is what lets that stay strict.
   */
  { kind: 'link', re: /\[([^\]\n]+)\]\(([^)\s]+)\)/ },
  /*
   * Bold and italic together, before either alone. `***x***` is the string both
   * marks on one run serialises to, and neither of the rules below can read it:
   * bold stops because its content may not open with an asterisk, and italic
   * because its content may hold none at all. CommonMark carries the same
   * special case for the same reason.
   */
  { kind: 'bolditalic', re: /\*\*\*([^\s*](?:[^\n]*?[^\s*])?)\*\*\*/ },
  // Lazy, and asterisks are allowed inside: `**a *b* c**` is italic within bold,
  // which is the order `noteDoc` emits the pair in.
  { kind: 'bold', re: /\*\*([^\s*](?:[^\n]*?[^\s*])?)\*\*/ },
  { kind: 'underline', re: /\+\+([^\s+](?:[^\n]*?[^\s+])?)\+\+/ },
  { kind: 'italic', re: /\*([^\s*](?:[^*\n]*[^\s*])?)\*/ },
  { kind: 'color', re: /\{([a-z]+)\|([^}\n]+)\}/ }
] as const

/** Text in, tree out. Unmatched delimiters survive as the characters they are. */
export function parseNote(text: string): Node[] {
  const out: Node[] = []
  let rest = text

  while (rest.length > 0) {
    // Earliest match wins, so the rules are a priority list only where two
    // patterns start at the same index (`**` as bold before italic).
    let best: { index: number; rule: (typeof RULES)[number]; m: RegExpMatchArray } | null = null
    for (const rule of RULES) {
      const m = rest.match(rule.re)
      if (m?.index === undefined) continue
      if (!best || m.index < best.index) best = { index: m.index, rule, m }
    }

    if (!best) {
      out.push({ kind: 'text', text: rest })
      break
    }

    if (best.index > 0) out.push({ kind: 'text', text: rest.slice(0, best.index) })

    const { rule, m } = best
    if (rule.kind === 'code') {
      out.push({ kind: 'code', text: m[1] })
    } else if (rule.kind === 'link') {
      // The label is parsed on: a link is a thing you can also make bold.
      out.push({ kind: 'link', url: m[2], children: parseNote(m[1]) })
    } else if (rule.kind === 'bolditalic') {
      // Nested rather than a node kind of its own — it is two marks, and every
      // consumer already knows what these two are.
      out.push({ kind: 'bold', children: [{ kind: 'italic', children: parseNote(m[1]) }] })
    } else if (rule.kind === 'color') {
      const name = m[1]
      if (isNoteColor(name)) {
        out.push({ kind: 'color', color: name, children: parseNote(m[2]) })
      } else {
        // An unknown colour is not markup. Keep the braces the user typed rather
        // than dropping text on the floor because a name was misspelt.
        out.push({ kind: 'text', text: m[0] })
      }
    } else {
      out.push({ kind: rule.kind, children: parseNote(m[1]) })
    }

    rest = rest.slice(best.index + m[0].length)
  }

  return out
}

/**
 * The same text with every delimiter removed.
 *
 * For places that take plain strings — an `aria-label`, a `title`, the undo
 * toast — where the raw form would read out punctuation that is markup rather
 * than words. A link comes back as its label alone; the URL is not something
 * anyone wants read aloud.
 */
export function stripNoteMarkup(text: string): string {
  const flat = (nodes: Node[]): string =>
    nodes
      .map((n) => {
        if (n.kind === 'text' || n.kind === 'code') return n.text
        return flat(n.children)
      })
      .join('')
  return flat(parseNote(text))
}
