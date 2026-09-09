import { useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { Bold, Code, Italic, Link2, Underline } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOutsideDismiss } from '../hooks/useOutsideDismiss'
import { NOTE_COLORS, noteColorRgb, type NoteColor } from '../lib/noteMarkup'

interface Props {
  /** Null for the first render, before the editor view exists. */
  editor: Editor | null
}

const button =
  'flex h-6 w-6 items-center justify-center rounded text-[var(--color-ink-faint)] ' +
  'transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)]'

/** A mark that is on at the caret. */
const active = 'bg-[var(--color-surface)] text-[var(--color-ink)]'

/** Shared chrome for the two drop-downs. */
const panel =
  'absolute top-full z-50 mt-1.5 rounded-lg border border-[var(--color-line)] ' +
  'bg-[var(--color-raised)] p-2.5 shadow-[var(--card-shadow-lift)]'

/** `(` and `)` and whitespace end a URL in the markup, so they leave as escapes. */
const ESCAPES: Record<string, string> = { '(': '%28', ')': '%29' }

/**
 * Formatting buttons for the note editor.
 *
 * Every button is a toggle on the current selection, and lights up when the mark
 * is on at the caret — which the textarea version could not do, because a
 * selection in plain text has no formatting to report. Pressing one with nothing
 * selected arms the mark for what you type next, the same as in any editor.
 */
export function NoteToolbar({ editor }: Props) {
  /*
   * One slot, not a flag per drop-down: the colour swatches and the link field
   * both want the width under the toolbar, so two open at once would overlap.
   */
  const [menu, setMenu] = useState<'colour' | 'link' | null>(null)
  const [url, setUrl] = useState('')

  /*
   * Anchored on the whole toolbar rather than on each trigger. A column is
   * `min-w-[188px]` and scrolls, so it clips horizontally — a panel hung off the
   * fifth button in would open past the right edge and be cut in half. From the
   * toolbar's left edge both have the full width of the form to sit in.
   */
  const root = useRef<HTMLDivElement>(null)
  useOutsideDismiss(root, menu !== null, () => setMenu(null))

  const marks = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? {
            bold: editor.isActive('bold'),
            italic: editor.isActive('italic'),
            underline: editor.isActive('underline'),
            code: editor.isActive('code'),
            link: editor.isActive('link'),
            colour: (editor.getAttributes('noteColor').color as NoteColor | undefined) ?? null
          }
        : null
  })

  if (!editor) return null

  /**
   * Puts the caret back where it was before returning to work.
   *
   * Pressing a toolbar button moves focus off the editor, and a command that
   * does not focus first would apply to an empty selection. `focus()` in the
   * chain restores the range the editor still holds, so the buttons compose:
   * bold, then blue, then link, on the same words.
   */
  const chain = () => editor.chain().focus()

  const applyColour = (colour: NoteColor) => {
    setMenu(null)
    // A second press of the colour already on removes it, which is the only way
    // back to the default ink without retyping.
    if (marks?.colour === colour) chain().unsetNoteColor().run()
    else chain().setNoteColor(colour).run()
  }

  /**
   * Links the selection, or inserts the URL as its own label when there is none
   * — which is what the standalone link field this replaced produced.
   */
  const applyLink = () => {
    const href = url.trim()
    if (!href) return

    const safe = href.replace(/[()\s]/g, (c) => ESCAPES[c] ?? '%20')
    const { empty } = editor.state.selection

    if (empty) chain().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href: safe } }] }).run()
    // `extendMarkRange` so pressing it with the caret inside an existing link
    // replaces that whole link rather than splitting it in two.
    else chain().extendMarkRange('link').setLink({ href: safe }).run()

    setMenu(null)
    setUrl('')
  }

  const openLink = () => {
    setUrl(editor.getAttributes('link').href ?? '')
    setMenu((open) => (open === 'link' ? null : 'link'))
  }

  return (
    <div ref={root} className="relative mt-1.5">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          title="Bold"
          aria-label="Bold"
          aria-pressed={marks?.bold}
          className={cn(button, marks?.bold && active)}
          onClick={() => chain().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Italic"
          aria-label="Italic"
          aria-pressed={marks?.italic}
          className={cn(button, marks?.italic && active)}
          onClick={() => chain().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Underline"
          aria-label="Underline"
          aria-pressed={marks?.underline}
          className={cn(button, marks?.underline && active)}
          onClick={() => chain().toggleUnderline().run()}
        >
          <Underline className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Code"
          aria-label="Code"
          aria-pressed={marks?.code}
          className={cn(button, marks?.code && active)}
          onClick={() => chain().toggleCode().run()}
        >
          <Code className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Link"
          aria-label="Link"
          aria-expanded={menu === 'link'}
          className={cn(button, (menu === 'link' || marks?.link) && active)}
          onClick={openLink}
        >
          <Link2 className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          title="Colour"
          aria-label={marks?.colour ? `Colour: ${marks.colour}` : 'Colour'}
          aria-expanded={menu === 'colour'}
          className={cn(button, menu === 'colour' && active)}
          onClick={() => setMenu((open) => (open === 'colour' ? null : 'colour'))}
        >
          {/*
            A plain grey circle, filled with whatever colour is on at the caret.
            It was a conic gradient of every swatch, which said "colours" but at
            14px read as a smudge and never showed which one was in use — this is
            both the label and the state.
          */}
          <span
            aria-hidden
            className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10 dark:ring-white/20"
            style={{
              background: marks?.colour ? `rgb(${noteColorRgb(marks.colour)})` : 'var(--color-ink-faint)'
            }}
          />
        </button>
      </div>

      {menu === 'colour' && (
        <div role="menu" className={cn(panel, 'left-0 grid grid-cols-3 gap-2.5')}>
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="menuitem"
              title={c}
              aria-label={c}
              onClick={() => applyColour(c)}
              className={cn(
                'h-6 w-6 rounded-full ring-1 ring-black/10 transition-transform',
                'hover:scale-110 focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-[var(--color-ink)] dark:ring-white/20',
                c === marks?.colour && 'ring-2 ring-[var(--color-ink)]'
              )}
              style={{ background: `rgb(${noteColorRgb(c)})` }}
            />
          ))}
        </div>
      )}

      {menu === 'link' && (
        // Full width of the toolbar: a URL is long and this is the only field
        // here that anyone types into.
        <div className={cn(panel, 'inset-x-0 flex items-center gap-1.5 p-2')}>
          <input
            // Not type="url", for the same reason as the field it replaced: the
            // browser would reject "posthog.com/docs" in its own words before
            // `linkHref` gets to supply the scheme.
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            value={url}
            placeholder="https://…"
            aria-label="Link URL"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              /*
               * This lives inside the composer's <form>, where Enter in a text
               * input submits it — so without this, adding a link would save the
               * to-do instead. Escape is caught here too rather than bubbling to
               * the editor's wrapper, whose handler closes the whole composer.
               */
              if (e.key === 'Enter') {
                e.preventDefault()
                applyLink()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                setMenu(null)
              }
            }}
            className={
              'min-w-0 flex-1 rounded border border-[var(--color-line)] bg-transparent px-2 py-1 ' +
              'text-[11px] outline-none placeholder:text-[var(--color-ink-faint)] ' +
              'focus-visible:border-[var(--color-line-strong)]'
            }
          />
          <button
            type="button"
            onClick={applyLink}
            disabled={!url.trim()}
            className={
              'shrink-0 rounded px-1.5 py-1 text-[11px] font-medium text-[var(--color-ink-muted)] ' +
              'transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)] ' +
              'disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none ' +
              'focus-visible:ring-2 focus-visible:ring-[var(--color-ink)]'
            }
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}
