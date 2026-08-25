import { useEffect, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion, useAnimate } from 'motion/react'
import { cn } from '@/lib/utils'
import { EASE_SWIFT } from '../lib/motion'
import { cardSurfaceStyle, type CardColor } from '../lib/colors'
import type { Todo, TodoValues } from '../lib/board'
import { useOutsideDismiss } from '../hooks/useOutsideDismiss'
import { AccountChip } from './AccountChip'
import { GithubMark } from './icons/GithubMark'
import { TodoForm } from './TodoForm'

/**
 * The account facts a to-do card needs. Assembled in BoardScreen from data
 * `useBoard` has already loaded, so linking a to-do to an account costs no extra
 * query — and the to-do inherits that account's card colour, which keeps the two
 * boards reading as one app.
 */
export interface TodoAccount {
  orgId: string
  orgName: string
  /** The account's website, for its logo. Null when Salesforce has none. */
  domain: string | null
  color: CardColor | null
}

/** Presentational card body, shared by the sortable card, the drag overlay, and
 *  the completion effects' shard clones. */
export function TodoFace({
  todo,
  account,
  dragging = false
}: {
  todo: Todo
  account?: TodoAccount
  dragging?: boolean
}) {
  return (
    <div
      // Background, border, and shadow all come from cardSurfaceStyle; the
      // classes here only supply the monochrome defaults it may override.
      className={
        'h-full rounded-lg border bg-[var(--color-raised)] px-3 py-2.5 text-left transition-shadow ' +
        (dragging
          ? 'border-[var(--color-ink)]'
          : 'border-[var(--color-line)] hover:border-[var(--color-line-strong)]')
      }
      style={cardSurfaceStyle(account?.color ?? null, dragging)}
    >
      {/*
        Stacked rather than side by side. In a narrow column a chip beside the text
        left the title about 130px to wrap in, so a card was a long thin strip; on
        its own row the title gets the full width and the card reads closer to
        square. min-h keeps a one-line to-do from collapsing back into a strip.
      */}
      <div className="flex min-h-[104px] flex-col gap-1.5">
        {account ? (
          <div className="flex items-center gap-1.5">
            <AccountChip orgId={account.orgId} orgName={account.orgName} domain={account.domain} />
            <span
              className="min-w-0 flex-1 truncate text-[11px] leading-none text-[var(--color-ink-muted)]"
              title={account.orgName}
            >
              {account.orgName}
            </span>
          </div>
        ) : (
          /*
            PR only. An "Other" to-do gets no marker on purpose: the kind exists to
            stop your own work being filed as an account to-do with the account left
            blank, and once it is out of that bucket there is nothing more to say —
            a row reading "Other" on every personal card is noise. A PR is different:
            the mark makes review work scannable down a column.
          */
          todo.kind === 'pr' && (
            <div className="flex items-center gap-1.5 text-[var(--color-ink-muted)]">
              {/* The same tile AccountChip draws at `md`, so a PR card and an
                  account card line their titles up at the same height. */}
              <span
                aria-hidden
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--color-line)] bg-[var(--color-surface)]"
              >
                <GithubMark className="h-3.5 w-3.5" />
              </span>
              <span className="text-[11px] leading-none">Pull request</span>
            </div>
          )
        )}

        <span className="line-clamp-3 text-[13px] font-semibold leading-snug tracking-tight">
          {todo.title}
        </span>

        {todo.note && (
          <p className="line-clamp-3 whitespace-pre-wrap text-[11px] leading-snug text-[var(--color-ink-faint)]">
            {todo.note}
          </p>
        )}
      </div>
    </div>
  )
}

interface Props {
  todo: Todo
  account?: TodoAccount
  accounts: TodoAccount[]
  editing: boolean
  onEdit: (id: string | null) => void
  onSave: (id: string, values: TodoValues) => Promise<boolean>
  onDelete: (id: string) => void
  /** Given the card's own rect, so completing by keyboard animates from the card. */
  onComplete: (id: string, rect: DOMRect) => void
  /** True for the moment after this card is dropped, so it widens into its slot. */
  landed: boolean
}

/** Quiet until the card is hovered or the button takes focus. */
const action =
  'rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-ink-faint)] opacity-0 ' +
  'transition-opacity hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)] ' +
  'group-hover/todo:opacity-100 focus-visible:opacity-100 focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-[var(--color-ink)]'

export function TodoCard({
  todo,
  account,
  accounts,
  editing,
  onEdit,
  onSave,
  onDelete,
  onComplete,
  landed
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: todo.id,
    data: { type: 'todo', bucket: todo.bucket }
  })
  const cardRef = useRef<HTMLDivElement | null>(null)
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

  /*
   * Clicking away closes the editor, matching the composer. Declared up here
   * rather than in the editing branch below, because that branch returns early
   * and a hook inside it would run on some renders and not others.
   */
  const editor = useRef<HTMLDivElement>(null)
  useOutsideDismiss(editor, editing, () => onEdit(null))

  /*
   * The other half of the pickup effect: the overlay thins to half width while in
   * flight, so on landing the card widens back out into its column.
   *
   * It has to happen here rather than on the overlay, because dnd-kit caches the
   * overlay's rendered node for the drop animation — re-rendering it wider has no
   * effect on what is on screen.
   *
   * Imperative rather than declarative: a card dragged within its own column is
   * never unmounted, so an `initial` would not re-run, and a state-driven `animate`
   * would have to pass through the half-width value on the way in. useAnimate just
   * plays it, the same shape as the completion rail's accept pulse.
   */
  const [scope, animate] = useAnimate()
  useEffect(() => {
    if (!landed || !scope.current) return
    void animate(scope.current, { width: ['50%', '100%'] }, { duration: 0.28, ease: EASE_SWIFT })
  }, [landed, animate, scope])

  /*
   * While editing, the form replaces the sortable wrapper rather than rendering
   * inside it. Nested inside, every keystroke and every pointerdown on an input
   * would reach the drag listeners spread onto the wrapper: the 5px activation
   * distance means dragging a text selection across the field would start
   * dragging the card. TodoColumn drops this id from SortableContext to match.
   */
  if (editing) {
    return (
      <div
        ref={editor}
        data-todo-card
        className="rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] p-2 shadow-[var(--card-shadow)]"
      >
        <TodoForm
          initial={todo}
          accounts={accounts}
          submitLabel="Save changes"
          compact
          onCancel={() => onEdit(null)}
          onSubmit={async (values) => {
            const ok = await onSave(todo.id, values)
            if (ok) onEdit(null)
            return ok
          }}
        />
        <button
          type="button"
          onClick={() => onDelete(todo.id)}
          className="mt-1.5 rounded px-1.5 py-0.5 text-[10px] text-[var(--color-ink-faint)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]"
        >
          Delete this to-do
        </button>
      </div>
    )
  }

  return (
    /*
     * The entrance animation lives on a WRAPPER, outside the sortable node.
     * dnd-kit writes the drag translation to the sortable's own inline transform,
     * and motion animates transform too — on one element they would fight and the
     * card would jump. Nested, the two transforms simply compose.
     *
     * Enter only, no exit: a completed card is already animated by the effect
     * layer, and an AnimatePresence exit here would fade a second copy out
     * underneath the shards.
     */
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.24, ease: EASE_SWIFT }}
    >
      <div ref={scope}>
      <div
        ref={(node) => {
          setNodeRef(node)
          cardRef.current = node
        }}
        style={{ transform: CSS.Translate.toString(transform), transition }}
        // Marks this subtree as a card, so a column's click-to-create ignores
        // clicks that started here.
        data-todo-card
        // The board measures this at drag start to work out where the pointer
        // grabbed the card.
        data-todo-id={todo.id}
        // cursor-pointer sits here rather than on TodoFace so it doesn't fight the
        // drag overlay's cursor-grabbing. The original slot stays in place but goes
        // blank while the overlay drags.
        className={cn('group/todo relative cursor-pointer', isDragging && 'opacity-0')}
        {...attributes}
        {...listeners}
        role="button"
        tabIndex={0}
        onClick={() => onEdit(todo.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onEdit(todo.id)
          }
        }}
        aria-label={todo.title}
      >
        <TodoFace todo={todo} account={account} />

        {/*
          The keyboard path to completion. The rail is excluded from the geometric
          collision fallback so it cannot steal drops meant for the last column,
          which also makes it unreachable by keyboard drag — this button is the
          replacement, and it feeds the same rect-driven animation.
        */}
        <button
          type="button"
          title="Complete this to-do"
          aria-label={`Complete ${todo.title}`}
          // pointerdown would arm the drag sensor, click would open the editor.
          onPointerDown={stop}
          onClick={(e) => {
            stop(e)
            const rect = cardRef.current?.getBoundingClientRect()
            if (rect) onComplete(todo.id, rect)
          }}
          onKeyDown={stop}
          className={cn('absolute right-1.5 top-1.5', action)}
        >
          Done
        </button>
      </div>
      </div>
    </motion.div>
  )
}
