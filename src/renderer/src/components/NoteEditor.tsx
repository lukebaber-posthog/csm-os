import { useEffect, useRef, type KeyboardEvent } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { cn } from '@/lib/utils'
import { dialectToDoc, docToDialect } from '../lib/noteDoc'
import { noteExtensions } from '../lib/noteEditor'
import { NoteToolbar } from './NoteToolbar'

interface Props {
  /** The note in dialect form — exactly what is stored and what the card renders. */
  value: string
  onChange: (next: string) => void
  placeholder: string
  autoFocus?: boolean
  /** The composer's Escape-to-close, which the field it replaced also carried. */
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void
  className?: string
}

/**
 * The note field: what you type is what the card will show.
 *
 * It was a textarea, which cannot be this — a textarea renders one font, so
 * `**ship it**` could only ever be four asterisks and some text, and the only
 * way to see the result was to save. Bold text in the field means a real editing
 * surface, which means a document model, so this is TipTap over ProseMirror.
 *
 * **The dialect is still the storage format.** The value in and out of this
 * component is the same plain string as before (`lib/noteDoc` parses it in and
 * serialises it back), so Supabase, the weekly export, `FormattedText` and
 * everything already written are untouched. The editor is a view, not a new
 * format — which is what kept this from being a data migration.
 */
export function NoteEditor({ value, onChange, placeholder, autoFocus, onKeyDown, className }: Props) {
  /*
   * The last string this component produced. The parent owns the note, so its
   * value comes back down on every keystroke; without something to compare
   * against, that return trip would look like an outside edit and reset the
   * document — taking the caret with it on every character typed.
   */
  const lastEmitted = useRef(value)

  // Held in a ref so the editor, created once, never calls a stale setter.
  const emit = useRef(onChange)
  useEffect(() => {
    emit.current = onChange
  })

  const editor = useEditor({
    extensions: noteExtensions(placeholder),
    content: dialectToDoc(value),
    editorProps: {
      attributes: {
        // `whitespace-pre-wrap` so runs of spaces survive as typed, matching the
        // `whitespace-pre-wrap` the card renders the note with.
        class: 'min-h-[3rem] whitespace-pre-wrap break-words outline-none'
      }
    },
    onUpdate: ({ editor }) => {
      const next = docToDialect(editor.getJSON())
      lastEmitted.current = next
      emit.current(next)
    }
  })

  /*
   * Focus on open, once.
   *
   * The element is focused directly before the command runs, because TipTap's
   * `focus` — and the `autofocus` option that calls it — does its work inside a
   * `requestAnimationFrame`, so it does nothing at all until the window paints
   * a frame. Touching the DOM node is synchronous and gets the caret into the
   * field; the command that follows puts it at the end of the text.
   *
   * Scoped by the dependency rather than by a "have I done this" ref, which is
   * not the same thing: StrictMode builds the editor, tears it down and builds
   * a second one, and a ref survives that. The guard held on the destroyed
   * editor and the live one was never focused — the caret sat in the title
   * field, which is what the field this replaced did not do.
   */
  useEffect(() => {
    if (!editor || !autoFocus) return
    editor.view.dom.focus()
    editor.commands.focus('end')
  }, [editor, autoFocus])

  /*
   * An edit from outside — the composer clearing itself after a save, an editor
   * opening on a different to-do. Anything this component itself produced is
   * already on screen.
   */
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return
    lastEmitted.current = value
    editor.commands.setContent(dialectToDoc(value), { emitUpdate: false })
  }, [editor, value])

  return (
    <div onKeyDown={onKeyDown}>
      <EditorContent
        editor={editor}
        className={cn(
          // The shadcn textarea's own chrome, so the field it replaced and this
          // one are the same object to look at. `focus-within` rather than
          // `focus-visible`: focus lands on the contenteditable inside.
          'w-full rounded-md border bg-transparent px-3 py-2 text-base transition-[color,box-shadow]',
          'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
          'md:text-sm dark:bg-input/30',
          className
        )}
      />
      {/* Below the field, not above it: the buttons act on a selection, and a
          selection is something you make in the field first. */}
      <NoteToolbar editor={editor} />
    </div>
  )
}
