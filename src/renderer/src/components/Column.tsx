import { useEffect, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Column as ColumnModel } from '../hooks/useBoard'
import type { CardColor } from '../lib/colors'
import type { ContactChannel } from '../lib/channels'
import { AccountCard } from './AccountCard'

/** Droppable id prefixes, so a drag can tell what it is over. */
export const STAGE_PREFIX = 'stage:'
export const COLUMN_PREFIX = 'column:'

interface Props {
  column: ColumnModel
  onOpenAccount: (orgId: string) => void
  onSetColor: (orgId: string, color: CardColor | null) => void
  onSetChannel: (orgId: string, channel: ContactChannel | null) => void
  onRename: (stageKey: string, label: string) => void
  onDelete: (stageKey: string) => void
  canDelete: boolean
  /** Highlights the column while a card hovers over it. */
  isActiveTarget: boolean
}

export function Column({
  column,
  onOpenAccount,
  onSetColor,
  onSetChannel,
  onRename,
  onDelete,
  canDelete,
  isActiveTarget
}: Props) {
  // Two roles: the column is a droppable lane for cards, and a sortable item
  // for reordering the columns themselves.
  const lane = useDroppable({
    id: `${STAGE_PREFIX}${column.stage.key}`,
    data: { type: 'lane' }
  })
  const sortable = useSortable({
    id: `${COLUMN_PREFIX}${column.stage.key}`,
    data: { type: 'column' }
  })

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(column.stage.label)
  const [confirming, setConfirming] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(column.stage.label)
  }, [column.stage.label])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  // A pending delete shouldn't stay armed indefinitely.
  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 3500)
    return () => clearTimeout(t)
  }, [confirming])

  function commit() {
    setEditing(false)
    if (draft.trim() && draft.trim() !== column.stage.label) {
      onRename(column.stage.key, draft)
    } else {
      setDraft(column.stage.label)
    }
  }

  const ids = column.cards.map((c) => c.account.orgId)
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

  return (
    <section
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition
      }}
      className={
        'group/col flex h-full min-w-[188px] flex-1 flex-col ' +
        (sortable.isDragging ? 'opacity-40' : '')
      }
    >
      <header
        // The header is the drag handle. The 5px activation distance keeps a
        // click (rename, delete) from being read as the start of a drag.
        {...sortable.attributes}
        {...sortable.listeners}
        title="Drag to reorder this column"
        className="mb-2.5 flex cursor-grab items-center justify-between gap-2 px-1 active:cursor-grabbing"
      >
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onPointerDown={stop}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setDraft(column.stage.label)
                setEditing(false)
              }
            }}
            className="min-w-0 flex-1 border-b border-[var(--color-ink)] bg-transparent text-[12px] font-semibold uppercase tracking-wider text-[var(--color-ink)] focus:outline-none"
          />
        ) : (
          <button
            onDoubleClick={() => setEditing(true)}
            title="Double-click to rename"
            className="min-w-0 flex-1 truncate text-left text-[12px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            {column.stage.label}
          </button>
        )}

        {!editing && (
          <>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--color-ink-faint)]">
              {column.cards.length}
            </span>
            {canDelete && (
              <button
                onPointerDown={stop}
                onClick={(e) => {
                  stop(e)
                  if (confirming) {
                    onDelete(column.stage.key)
                    setConfirming(false)
                  } else {
                    setConfirming(true)
                  }
                }}
                title={
                  column.cards.length > 0
                    ? `Delete this column; its ${column.cards.length} card(s) move to the first column`
                    : 'Delete this column'
                }
                aria-label={`Delete column ${column.stage.label}`}
                className={
                  'shrink-0 rounded px-1 text-[11px] transition-opacity hover:bg-[var(--color-surface)] ' +
                  (confirming
                    ? 'font-semibold text-[var(--color-ink)] opacity-100'
                    : 'text-[var(--color-ink-faint)] opacity-0 group-hover/col:opacity-100 hover:text-[var(--color-ink)]')
                }
              >
                {confirming ? 'Delete?' : '✕'}
              </button>
            )}
          </>
        )}
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
          {column.cards.map((card) => (
            <AccountCard
              key={card.account.orgId}
              card={card}
              onOpen={onOpenAccount}
              onSetColor={onSetColor}
              onSetChannel={onSetChannel}
            />
          ))}
        </SortableContext>

        {column.cards.length === 0 && (
          <p className="px-1 py-6 text-center text-[11px] text-[var(--color-ink-faint)]">
            Drop accounts here
          </p>
        )}
      </div>
    </section>
  )
}
