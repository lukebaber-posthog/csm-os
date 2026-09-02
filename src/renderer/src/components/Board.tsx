import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates
} from '@dnd-kit/sortable'
import type { Column as ColumnModel } from '../hooks/useBoard'
import { useCardDrag } from '../hooks/useCardDrag'
import type { CardColor } from '../lib/colors'
import type { ContactChannel } from '../lib/channels'
import type { ColumnSort } from '../lib/columnSort'
import { DROP_ANIM } from '../lib/motion'
import { Column, COLUMN_PREFIX, STAGE_PREFIX } from './Column'
import { CardFace } from './AccountCard'
import { AddColumn } from './AddColumn'
import { DragCardOverlay } from './DragCardOverlay'

interface Props {
  columns: ColumnModel[]
  onOpenAccount: (orgId: string) => void
  onSetColor: (orgId: string, color: CardColor | null) => void
  onSetChannel: (orgId: string, channel: ContactChannel | null) => void
  onRename: (stageKey: string, label: string) => void
  onMove: (orgId: string, toStageKey: string, toIndex: number) => void
  onAddColumn: (label: string) => void
  onDeleteColumn: (stageKey: string) => void
  onReorderColumns: (orderedKeys: string[]) => void
  canAddColumn: boolean
  canDeleteColumn: boolean
  /** How each column orders its cards. `columns` arrives already in that order. */
  sortOf: (stageKey: string) => ColumnSort
  onCycleSort: (stageKey: string) => void
}

/**
 * The board hosts two kinds of drag — cards between columns, and columns among
 * themselves — so collisions are scoped to the matching droppables. Within that
 * scope the cursor decides the target, not the dragged element's rectangle:
 * with narrow columns a card overlaps its neighbours, and the default geometric
 * detection would drop into whichever column it straddles.
 */
const collisionDetection: CollisionDetection = (args) => {
  const isColumn = args.active.data.current?.type === 'column'

  const droppableContainers = args.droppableContainers.filter((c) => {
    const type = c.data.current?.type
    // A column must not collide with itself, or `over` would always be the
    // column being dragged and no reorder would ever register.
    if (isColumn) return type === 'column' && c.id !== args.active.id
    return type !== 'column'
  })

  const scoped = { ...args, droppableContainers }
  const byPointer = pointerWithin(scoped)
  if (byPointer.length > 0) return byPointer
  // Keyboard dragging has no pointer; fall back to geometry.
  return isColumn ? closestCenter(scoped) : closestCorners(scoped)
}

export function Board({
  columns,
  onOpenAccount,
  onSetColor,
  onSetChannel,
  onRename,
  onMove,
  onAddColumn,
  onDeleteColumn,
  onReorderColumns,
  canAddColumn,
  canDeleteColumn,
  sortOf,
  onCycleSort
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeType, setActiveType] = useState<'card' | 'column' | null>(null)
  const [targetStage, setTargetStage] = useState<string | null>(null)

  // The pickup-and-land feel, shared with the to-do board. See `useCardDrag`.
  const { pickup, landedId, grab, release, land } = useCardDrag()

  // Past roughly six columns the board scrolls horizontally, which would leave
  // a newly added column (and the Add button) off-screen. Follow the addition.
  const scrollRef = useRef<HTMLDivElement>(null)
  const previousCount = useRef(columns.length)
  useEffect(() => {
    if (columns.length > previousCount.current) {
      const el = scrollRef.current
      if (el) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' })
    }
    previousCount.current = columns.length
  }, [columns.length])

  const sensors = useSensors(
    // A small distance threshold lets a plain click open the drawer, and a
    // double-click rename a column, without either starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const columnIds = useMemo(
    () => columns.map((c) => `${COLUMN_PREFIX}${c.stage.key}`),
    [columns]
  )

  const activeCard = useMemo(() => {
    if (!activeId || activeType !== 'card') return null
    for (const col of columns) {
      const found = col.cards.find((c) => c.account.orgId === activeId)
      if (found) return found
    }
    return null
  }, [activeId, activeType, columns])

  const activeColumn = useMemo(() => {
    if (!activeId || activeType !== 'column') return null
    const key = activeId.slice(COLUMN_PREFIX.length)
    return columns.find((c) => c.stage.key === key) ?? null
  }, [activeId, activeType, columns])

  /** Which column an id belongs to — a lane, a column, or a card within one. */
  function stageOf(id: string): ColumnModel | null {
    if (id.startsWith(STAGE_PREFIX)) {
      const key = id.slice(STAGE_PREFIX.length)
      return columns.find((c) => c.stage.key === key) ?? null
    }
    if (id.startsWith(COLUMN_PREFIX)) {
      const key = id.slice(COLUMN_PREFIX.length)
      return columns.find((c) => c.stage.key === key) ?? null
    }
    return columns.find((c) => c.cards.some((card) => card.account.orgId === id)) ?? null
  }

  function reset() {
    setActiveId(null)
    setActiveType(null)
    setTargetStage(null)
    release()
  }

  function handleDragStart(e: DragStartEvent) {
    const isColumn = e.active.data.current?.type === 'column'
    setActiveId(String(e.active.id))
    setActiveType(isColumn ? 'column' : 'card')
    // Cards only. A column drags by its header and keeps its own overlay, which
    // is a label chip rather than a copy of the column.
    if (!isColumn) grab(e)
  }

  function handleDragOver(e: DragOverEvent) {
    if (e.active.data.current?.type === 'column') return
    const over = e.over ? stageOf(String(e.over.id)) : null
    setTargetStage(over?.stage.key ?? null)
  }

  function handleDragEnd(e: DragEndEvent) {
    const wasColumn = e.active.data.current?.type === 'column'
    const overId = e.over ? String(e.over.id) : null
    reset()

    if (wasColumn) {
      if (!overId) return
      const from = String(e.active.id).slice(COLUMN_PREFIX.length)
      if (!overId.startsWith(COLUMN_PREFIX)) return
      const to = overId.slice(COLUMN_PREFIX.length)
      if (from === to) return

      const keys = columns.map((c) => c.stage.key)
      const fromIndex = keys.indexOf(from)
      const toIndex = keys.indexOf(to)
      if (fromIndex < 0 || toIndex < 0) return
      onReorderColumns(arrayMove(keys, fromIndex, toIndex))
      return
    }

    const orgId = String(e.active.id)

    /*
     * The landing is unconditional; only the write below is not.
     *
     * The card comes back into the DOM at full width whatever the drop decided,
     * so it always has an expansion to play — including the very common gesture
     * of picking a card up and putting it back where it came from. Landing used
     * to sit after the "nothing to do" guard, which meant that gesture skipped
     * the animation entirely and the card popped open instead.
     */
    land(orgId)

    if (!overId) return
    const target = stageOf(overId)
    if (!target) return

    const from = columns.find((c) => c.cards.some((card) => card.account.orgId === orgId))

    /*
     * A sorted column has no insertion point: the comparator decides where a card
     * sits, not where you let go of it. So dropping inside one is a no-op, and a
     * card arriving from another column goes to the end of the stored hand order
     * — which keeps that order coherent for when the sort is turned back off.
     */
    if (sortOf(target.stage.key) !== 'manual') {
      if (from?.stage.key === target.stage.key) return
      onMove(orgId, target.stage.key, target.cards.length)
      return
    }

    // Insertion index is the over-card's index in the target column's full
    // list, which matches dnd-kit's own arrayMove semantics in both directions.
    const index = overId.startsWith(STAGE_PREFIX)
      ? target.cards.filter((c) => c.account.orgId !== orgId).length
      : target.cards.findIndex((c) => c.account.orgId === overId)
    if (index < 0) return

    const currentIndex = from?.cards.findIndex((c) => c.account.orgId === orgId) ?? -1
    // Nothing to persist when the card was dropped exactly where it started.
    if (from?.stage.key === target.stage.key && currentIndex === index) return

    onMove(orgId, target.stage.key, index)
  }

  /** Escape mid-drag puts the card back, which is a landing like any other. */
  function handleDragCancel(e: DragCancelEvent) {
    if (e.active.data.current?.type !== 'column') land(String(e.active.id))
    reset()
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div ref={scrollRef} className="flex h-full gap-3 overflow-x-auto px-5 pb-6">
        <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
          {columns.map((column) => (
            <Column
              key={column.stage.key}
              column={column}
              onOpenAccount={onOpenAccount}
              onSetColor={onSetColor}
              onSetChannel={onSetChannel}
              onRename={onRename}
              onDelete={onDeleteColumn}
              canDelete={canDeleteColumn}
              sort={sortOf(column.stage.key)}
              onCycleSort={onCycleSort}
              landedId={landedId}
              isActiveTarget={activeType === 'card' && targetStage === column.stage.key}
            />
          ))}
        </SortableContext>

        <AddColumn canAdd={canAddColumn} count={columns.length} onAdd={onAddColumn} />
      </div>

      <DragOverlay dropAnimation={DROP_ANIM}>
        {activeCard && (
          <DragCardOverlay pickup={pickup}>
            <CardFace card={activeCard} dragging />
          </DragCardOverlay>
        )}
        {activeColumn && (
          <div className="dragging-card w-[212px] cursor-grabbing rounded-lg border border-[var(--color-ink)] bg-[var(--color-raised)] px-3 py-2.5 shadow-[var(--card-shadow-lift)]">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[12px] font-semibold uppercase tracking-wider">
                {activeColumn.stage.label}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-[var(--color-ink-faint)]">
                {activeColumn.cards.length}
              </span>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
