import { InputRule, Mark, markInputRule, markPasteRule, mergeAttributes, type Extensions } from '@tiptap/core'
import Bold, { starInputRegex as boldStarInput, starPasteRegex as boldStarPaste } from '@tiptap/extension-bold'
import Code from '@tiptap/extension-code'
import Document from '@tiptap/extension-document'
import HardBreak from '@tiptap/extension-hard-break'
import Italic, {
  starInputRegex as italicStarInput,
  starPasteRegex as italicStarPaste
} from '@tiptap/extension-italic'
import Link from '@tiptap/extension-link'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Underline from '@tiptap/extension-underline'
import { Placeholder, UndoRedo } from '@tiptap/extensions'
import { isNoteColor, noteColorRgb, type NoteColor } from './noteMarkup'
import { CODE_CHIP, INLINE_LINK } from './noteStyles'

/**
 * The editor's schema: exactly the dialect, and nothing else.
 *
 * Built from single extensions rather than StarterKit because what this document
 * may contain is the point. A note is inline text in paragraphs — no headings,
 * lists, quotes, code blocks or rules — and every one of those would be a
 * construct the dialect cannot store and `FormattedText` cannot paint, silently
 * lost on save. Leaving them out of the schema means they cannot be typed,
 * pasted or dragged in.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    noteColor: {
      setNoteColor: (color: NoteColor) => ReturnType
      unsetNoteColor: () => ReturnType
    }
  }
}

/**
 * Colour, as a mark carrying a palette *name*.
 *
 * Not `@tiptap/extension-color`, which stores a CSS colour string: that would
 * mean matching `rgb(13, 148, 136)` back to "teal" on the way out, and getting
 * it wrong the moment a browser normalised the string differently. The name is
 * the value; the rgb is derived for display only.
 */
export const NoteColorMark = Mark.create({
  name: 'noteColor',

  addAttributes() {
    return {
      color: {
        default: null,
        // Validated on the way in, so a hand-edited or pasted `data-note-color`
        // cannot put `{nonsense|…}` into the note text.
        parseHTML: (element) => {
          const value = element.getAttribute('data-note-color')
          return value && isNoteColor(value) ? value : null
        },
        renderHTML: (attributes) => {
          const color = attributes.color as NoteColor | null
          if (!color) return {}
          return { 'data-note-color': color, style: `color: rgb(${noteColorRgb(color)})` }
        }
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-note-color]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setNoteColor:
        (color) =>
        ({ commands }) =>
          commands.setMark(this.name, { color }),
      unsetNoteColor:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name)
    }
  }
})

/**
 * `++text++`, in the shape of TipTap's own emphasis rules: a boundary before the
 * opening pair, no match when the content is only spaces, and anchored to the
 * caret so it fires on the keystroke that closes it.
 */
const UNDERLINE_INPUT = /(?:^|\s)(\+\+(?!\s+\+\+)((?:[^+]+))\+\+(?!\s+\+\+))$/
const UNDERLINE_PASTE = /(?:^|\s)(\+\+(?!\s+\+\+)((?:[^+]+))\+\+(?!\s+\+\+))/g

/**
 * Bold and italic with the underscore rules removed.
 *
 * TipTap ships `__text__` and `_text_` alongside the asterisk forms, and the
 * dialect's founding rule is that an underscore is never a delimiter — because
 * `$set_once` is the sort of thing this app is used to write about. Overriding
 * `addInputRules` only replaces the typing rules; the paste rules are declared
 * again here for the same reason.
 */
const NoteBold = Bold.extend({
  addInputRules() {
    return [markInputRule({ find: boldStarInput, type: this.type })]
  },
  addPasteRules() {
    return [markPasteRule({ find: boldStarPaste, type: this.type })]
  }
})

const NoteItalic = Italic.extend({
  addInputRules() {
    return [markInputRule({ find: italicStarInput, type: this.type })]
  },
  addPasteRules() {
    return [markPasteRule({ find: italicStarPaste, type: this.type })]
  }
})

const NoteUnderline = Underline.extend({
  addInputRules() {
    return [markInputRule({ find: UNDERLINE_INPUT, type: this.type })]
  },
  addPasteRules() {
    return [markPasteRule({ find: UNDERLINE_PASTE, type: this.type })]
  }
})

/**
 * `[label](url)` as you type it.
 *
 * Hand-written rather than `markInputRule`, which takes the *last* capture group
 * as the text to keep — that is the URL here, so the generic helper would leave
 * the address on screen and hide the label.
 */
const NoteLink = Link.extend({
  addInputRules() {
    return [
      new InputRule({
        find: /\[([^\]\n]+)\]\(([^)\s]+)\)$/,
        handler: ({ state, range, match }) => {
          const [, label, href] = match
          state.tr.insertText(label, range.from, range.to)
          state.tr.addMark(range.from, range.from + label.length, this.type.create({ href }))
          // Or the next character typed would land inside the link.
          state.tr.removeStoredMark(this.type)
        }
      })
    ]
  }
})

export function noteExtensions(placeholder: string): Extensions {
  return [
    // `paragraph+` rather than the default `block+`: there is no other block in
    // this schema, and saying so keeps an empty document valid.
    Document.extend({ content: 'paragraph+' }),
    Paragraph,
    Text,
    HardBreak,

    NoteBold,
    NoteItalic,
    NoteUnderline,
    NoteColorMark,
    Code.configure({ HTMLAttributes: { class: CODE_CHIP } }),
    NoteLink.configure({
      HTMLAttributes: { class: INLINE_LINK },
      /*
       * Never navigate from inside the editor. This is an Electron renderer
       * showing the app's own origin: following a link in place would replace
       * the app with a web page and there is no way back. Reading a note is
       * where links are for clicking, and there they go through `ExternalLink`,
       * which hands them to the real browser.
       */
      openOnClick: false,
      // Typing a bare domain should stay text — the link button is how a link
      // gets made, and autolinking mid-sentence rewrites what you just typed.
      autolink: false,
      // Pasting a URL over selected words links them, which is the one case
      // where guessing the intent is safe.
      linkOnPaste: true,
      defaultProtocol: 'https'
    }),

    UndoRedo,
    Placeholder.configure({
      placeholder,
      // Shown whenever the note is empty rather than only while the caret is in
      // it, so an untouched composer still says what the field is for. Only the
      // whole-document class is styled, so blank lines mid-note stay blank.
      showOnlyCurrent: false,
      showOnlyWhenEditable: false
    })
  ]
}
