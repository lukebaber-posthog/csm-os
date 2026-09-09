import type { JSONContent } from '@tiptap/core'
import { isNoteColor, parseNote, type Node } from './noteMarkup'

/**
 * The bridge between the note dialect and the editor's document.
 *
 * The dialect stays the storage format — `todos.note` is still the plain text
 * `check the [**runbook**](posthog.com/docs)`, still greppable, still what the
 * weekly export and `FormattedText` read. The editor is a *view* over it: parsed
 * on the way in, serialised on the way out. Nothing downstream of this file
 * knows an editor exists, which is what kept swapping a textarea for a
 * contenteditable from becoming a data migration.
 *
 * Pure and free of TipTap beyond a type import, so the round trip can be tested
 * without a DOM.
 */

type Mark = NonNullable<JSONContent['marks']>[number]

/**
 * Nesting order for serialisation. ProseMirror holds marks as an unordered set
 * per character, but `[**x**](url)` and `**[x](url)**` are different strings, so
 * something has to choose — and it has to choose the same way every time, or
 * opening a note and closing it would rewrite it.
 *
 * Outermost first. Link leads because a link with emphasis inside it is the
 * shape people write by hand; code is last and alone, since it excludes every
 * other mark.
 */
const RANK: Record<string, number> = {
  link: 0,
  noteColor: 1,
  bold: 2,
  italic: 3,
  underline: 4,
  code: 5
}

/** Identity including attributes, so two adjacent links to different pages don't merge. */
function keyOf(mark: Mark): string {
  return `${mark.type}:${JSON.stringify(mark.attrs ?? {})}`
}

function delimiters(mark: Mark): [string, string] {
  switch (mark.type) {
    case 'bold':
      return ['**', '**']
    case 'italic':
      return ['*', '*']
    case 'underline':
      return ['++', '++']
    case 'code':
      return ['`', '`']
    case 'link':
      return ['[', `](${String(mark.attrs?.href ?? '')})`]
    case 'noteColor':
      return [`{${String(mark.attrs?.color ?? '')}|`, '}']
    default:
      return ['', '']
  }
}

/* ------------------------------------------------------------------ */
/* dialect -> document                                                 */
/* ------------------------------------------------------------------ */

/**
 * A line at a time, which is exact rather than convenient: every rule in the
 * dialect refuses to cross a newline, so parsing per line and parsing the whole
 * string give the same tree. One paragraph per line, so Enter in the editor is
 * a newline in the text and a blank line survives as an empty paragraph.
 */
export function dialectToDoc(text: string): JSONContent {
  return {
    type: 'doc',
    content: text.split('\n').map((line) => {
      const content = inlineOf(parseNote(line), [])
      // A paragraph with `content: []` is invalid; an absent key is the empty one.
      return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' }
    })
  }
}

function inlineOf(nodes: Node[], marks: Mark[]): JSONContent[] {
  const out: JSONContent[] = []
  const wrap = (children: Node[], mark: Mark) => out.push(...inlineOf(children, [...marks, mark]))

  for (const node of nodes) {
    switch (node.kind) {
      case 'text':
        if (node.text) out.push({ type: 'text', text: node.text, ...(marks.length ? { marks } : {}) })
        break
      case 'code':
        // Alone, never combined: the code mark excludes every other one, in the
        // editor and in the parser both. `**`x`**` loses the bold, which is the
        // same answer ProseMirror would give.
        out.push({ type: 'text', text: node.text, marks: [{ type: 'code' }] })
        break
      case 'link':
        wrap(node.children, { type: 'link', attrs: { href: node.url } })
        break
      case 'color':
        wrap(node.children, { type: 'noteColor', attrs: { color: node.color } })
        break
      default:
        wrap(node.children, { type: node.kind })
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/* document -> dialect                                                 */
/* ------------------------------------------------------------------ */

/** One character with the marks it carries. Short notes, so per-character is cheap. */
interface Char {
  ch: string
  marks: Mark[]
}

export function docToDialect(doc: JSONContent): string {
  return (doc.content ?? []).map(paragraph).join('\n')
}

function paragraph(node: JSONContent): string {
  const chars: Char[] = []

  for (const child of node.content ?? []) {
    if (child.type === 'hardBreak') {
      // Unmarked on purpose: it is a line boundary, and no delimiter in the
      // dialect may cross one. Every open mark closes here and reopens after.
      chars.push({ ch: '\n', marks: [] })
      continue
    }
    if (child.type !== 'text' || !child.text) continue
    for (const ch of child.text) chars.push({ ch, marks: child.marks ?? [] })
  }

  trimMarkEdges(chars)
  return serialize(chars)
}

/**
 * Pulls whitespace out from under a mark.
 *
 * Select "ship it " with the trailing space and press bold and ProseMirror will
 * happily mark the space too — but `**ship it **` does not parse back, because
 * the dialect requires a non-space against the inside of each delimiter (as
 * markdown does, and for the same reason: otherwise `2 * 3 * 4` is italic). The
 * mark would survive a save and come back as literal asterisks on the card.
 *
 * So the span shrinks to fit its own content, which is what the user meant by
 * the selection anyway.
 */
function trimMarkEdges(chars: Char[]): void {
  const drop = (i: number, key: string) => {
    chars[i] = { ...chars[i], marks: chars[i].marks.filter((m) => keyOf(m) !== key) }
  }

  const keys = new Set(chars.flatMap((c) => c.marks.map(keyOf)))
  for (const key of keys) {
    let i = 0
    while (i < chars.length) {
      if (!chars[i].marks.some((m) => keyOf(m) === key)) {
        i++
        continue
      }
      let end = i
      while (end + 1 < chars.length && chars[end + 1].marks.some((m) => keyOf(m) === key)) end++

      let from = i
      let to = end
      while (from <= to && /\s/.test(chars[from].ch)) drop(from++, key)
      while (to >= from && /\s/.test(chars[to].ch)) drop(to--, key)

      i = end + 1
    }
  }
}

/**
 * Characters back to text, opening and closing delimiters as the mark set
 * changes. A stack, so marks close in the reverse of the order they opened and
 * the output is always balanced.
 */
function serialize(chars: Char[]): string {
  let out = ''
  let open: Mark[] = []

  const closeTo = (depth: number) => {
    for (let i = open.length - 1; i >= depth; i--) out += delimiters(open[i])[1]
    open = open.slice(0, depth)
  }

  for (const { ch, marks } of chars) {
    const want = [...marks].sort((a, b) => (RANK[a.type] ?? 99) - (RANK[b.type] ?? 99))

    let shared = 0
    while (shared < open.length && shared < want.length && keyOf(open[shared]) === keyOf(want[shared])) {
      shared++
    }
    closeTo(shared)
    for (let i = shared; i < want.length; i++) {
      out += delimiters(want[i])[0]
      open.push(want[i])
    }
    out += ch
  }

  closeTo(0)
  return out
}

/** Guards content arriving from a note written before the editor existed. */
export function isKnownColor(value: unknown): boolean {
  return typeof value === 'string' && isNoteColor(value)
}
