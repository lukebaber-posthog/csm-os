import { useRef, type MouseEvent } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { motion } from 'motion/react'
import { Plus } from 'lucide-react'
import type { TodoValues } from '../lib/board'
import { EASE_SWIFT } from '../lib/motion'
import { useOutsideDismiss } from '../hooks/useOutsideDismiss'
import type { TodoColumn as TodoColumnModel } from '../hooks/useTodos'
import { TodoCard, type TodoAccount } from './TodoCard'
import { TodoForm } from './TodoForm'

/**
 * Right-clicking one of these is already inside a card, or inside the composer
 * itself. Neither is a request for a *second* composer.
 */
const OWN_SURFACE = '[data-todo-card],[data-todo-composer]'

/** Droppable id prefix, so a drag can tell a lane from a card or the rail. */
export const BUCKET_PREFIX = 'bucket:'

interface Props {
  column: TodoColumnModel
  accounts: TodoAccount[]
  accountOf: (orgId: string | null) => TodoAccount | undefined
  editingId: string | null
  /** True when this column's inline composer is the one that's open. */
  composing: boolean
  onEdit: (id: string | null) => void
  /** The header's + and a right-click both open a composer assigned to this column. */
  onCompose: () => void
  onCancelCompose: () => void
  onAdd: (values: TodoValues) => Promise<boolean>
  onSave: (id: string, values: TodoValues) => Promise<boolean>
  onDelete: (id: string) => void
  onComplete: (id: string, rect: DOMRect) => void
  /** The card just dropped, which widens back out into its slot. */
  landedId: string | null
  /** Highlights the column while a card hovers over it. */
  isActiveTarget: boolean
}

/**
 * One of the three fixed horizon columns.
 *
 * Deliberately NOT a generalised `Column`. That component is ~195 lines, and
 * roughly 120 of them are rename, arm-then-confirm delete, and column reordering
 * — none of which a fixed column has. Sharing it would mean either a `variant`
 * prop gating three unrelated features or five new optional callbacks, and each of
 * those is a place where a future change to the accounts board silently changes
 * this one.
 */
export function TodoColumn({
  column,
  accounts,
  accountOf,
  editingId,
  composing,
  onEdit,
  onCompose,
  onCancelCompose,
  onAdd,
  onSave,
  onDelete,
  onComplete,
  landedId,
  isActiveTarget
}: Props) {
  const lane = useDroppable({
    id: `${BUCKET_PREFIX}${column.bucket}`,
    data: { type: 'lane', bucket: column.bucket }
  })

  /*
   * Clicking away closes the composer, which is what replaced its Cancel button.
   * The ref goes on the composer, not on the column: a click anywhere else in
   * *this* column is still a click away from the draft.
   */
  const composer = useRef<HTMLDivElement>(null)
  useOutsideDismiss(composer, composing, onCancelCompose)

  /**
   * Right-click anywhere in the column to start a to-do in it.
   *
   * The whole section, not just the lane, so the header and the empty space below
   * the last card both work — the point is that you do not have to aim at a 16px
   * button. Only the three horizon columns have one of these; the completion rail
   * is a different component entirely, so "not on Done" needs no special case.
   *
   * preventDefault is only reached for a press that actually opens the composer,
   * which leaves the native menu alone over a card's text and inside the form's
   * own fields — where cut/copy/paste is what you wanted.
   */
  const onContextMenu = (e: MouseEvent<HTMLElement>) => {
    if (e.target instanceof Element && e.target.closest(OWN_SURFACE)) return
    e.preventDefault()
    onCompose()
  }

  /*
   * The card being edited renders a form instead of a sortable, so it registers no
   * node. Dropping its id keeps SortableContext's ordering honest rather than
   * leaving a gap the vertical strategy has to reason about.
   */
  const ids = column.todos.filter((t) => t.id !== editingId).map((t) => t.id)

  return (
    <section
      onContextMenu={onContextMenu}
      className="flex h-full min-w-[188px] flex-1 flex-col"
    >
      <header className="mb-2.5 flex items-center gap-1.5 px-1">
        <span className="truncate text-[12px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
          {column.label}
        </span>

        {/*
          Which button you press IS the horizon choice, so there is no picker for it
          to disagree with — and the same holds for the right-click, which opens the
          composer for whichever column you were over. It toggles, so the same
          button puts an unwanted composer away again.
        */}
        <button
          type="button"
          onClick={() => (composing ? onCancelCompose() : onCompose())}
          title={`Add a to-do to ${column.label} — or right-click the column`}
          aria-label={`Add a to-do to ${column.label}`}
          aria-expanded={composing}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--color-ink-faint)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)]"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>

        <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-[var(--color-ink-faint)]">
          {column.todos.length}
        </span>
      </header>

      <div
        ref={lane.setNodeRef}
        className={
          'flex-1 space-y-2 overflow-y-auto rounded-lg border border-dashed p-2 transition-colors ' +
          (isActiveTarget
            ? 'border-[var(--color-ink-faint)] bg-[var(--color-surface)]'
            : 'border-transparent')
        }
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {column.todos.map((todo) => (
            <TodoCard
              key={todo.id}
              todo={todo}
              account={accountOf(todo.orgId)}
              accounts={accounts}
              editing={editingId === todo.id}
              onEdit={onEdit}
              onSave={onSave}
              onDelete={onDelete}
              onComplete={onComplete}
              landed={landedId === todo.id}
            />
          ))}
        </SortableContext>

        {/*
          The composer fades and slides in from the column it belongs to.
          Deliberately opacity and transform ONLY — no `height: 'auto'`, and no
          overflow-hidden wrapper. Animating height to auto is motion's most
          fragile case: it needs a measurement pass, and when that does not land
          the element stays at its initial `height: 0` while `overflow-hidden`
          clips the form's own Add and Cancel buttons out of the hit-test. The
          form then looks present, reports sane rects, and cannot be clicked.
          Opacity and transform cannot clip anything, so they cannot fail that way.
        */}
        {composing && (
          <motion.div
            ref={composer}
            data-todo-composer
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: EASE_SWIFT }}
          >
            {/* Muted border and the card shadow, so the composer sits on the
                column the way a card does rather than being outlined onto it. */}
            <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] p-2 shadow-[var(--card-shadow)]">
              <TodoForm
                accounts={accounts}
                submitLabel="Add"
                compact
                hideBucket
                defaultBucket={column.bucket}
                // Closes on success, so adding one to-do gets you out of the
                // way; press + again for the next. A failed write keeps the form
                // open with the draft intact.
                onSubmit={async (values) => {
                  const ok = await onAdd(values)
                  if (ok) onCancelCompose()
                  return ok
                }}
                onCancel={onCancelCompose}
              />
            </div>
          </motion.div>
        )}

        {column.todos.length === 0 && !composing && (
          <p className="px-1 py-6 text-center text-[11px] text-[var(--color-ink-faint)]">
            Nothing here
            {/* The one place the right-click is discoverable, and an empty column
                is exactly where you are looking when you want to know. */}
            <span className="mt-1 block">Right-click to add</span>
          </p>
        )}
      </div>
    </section>
  )
}
