import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { motion, useReducedMotion } from 'motion/react'
import type { Todo, TodoValues } from '../lib/board'
import { DROP_ANIM } from '../lib/motion'
import { playCompletionFx, type FxRect } from '../lib/completionFx'
import type { TodoBucket } from '../lib/todos'
import type { TodoColumn as TodoColumnModel } from '../hooks/useTodos'
import { TodoColumn, BUCKET_PREFIX } from './TodoColumn'
import { TodoFace, type TodoAccount } from './TodoCard'
import { CompleteZone, DONE_ID, type AcceptSignal } from './CompleteZone'
import { CompletionUndo } from './CompletionUndo'

/**
 * Droppables are re-measured throughout the drag, not once at the start.
 *
 * The completion rail doubles in width while a card is in flight, which also
 * reflows the three columns beside it. dnd-kit's default is to measure droppables
 * once when dragging begins, so every one of those rects would be stale for the
 * rest of the drag: the rail would accept drops where it *used* to be and ignore
 * the half of itself that just appeared. Four droppables on a 50ms throttle is
 * nothing.
 */
const measuring = {
  droppable: { strategy: MeasuringStrategy.Always, frequency: 50 }
}

/**
 * Only cards drag on this board, so unlike `Board.tsx` there is no drag *type* to
 * scope collisions by. The work here is the opposite one: keeping the completion
 * rail from stealing drops meant for the last column.
 *
 * The rail abuts "Today", so a card dragged near that column's right edge
 * overlaps the rail's rectangle — and geometric detection resolves against the
 * dragged card's box, not the cursor. So the rail participates by pointer only,
 * and is filtered out of the keyboard fallback entirely.
 *
 * Deliberately a second function rather than `Board.tsx`'s with a mode flag: the
 * rules genuinely differ, and in particular nothing here should copy that one's
 * `c.id !== args.active.id` self-collision filter, which exists only because
 * columns there are themselves draggable.
 */
const collisionDetection: CollisionDetection = (args) => {
  const byPointer = pointerWithin(args)
  if (byPointer.length > 0) {
    // Pick the rail explicitly rather than trusting index 0 — pointerWithin's
    // ordering is not part of its contract.
    const done = byPointer.find((c) => c.id === DONE_ID)
    return done ? [done] : byPointer
  }
  // Keyboard dragging has no pointer. Geometry over lanes and cards only; the
  // rail's keyboard path is the per-card "Done" button instead.
  return closestCorners({
    ...args,
    droppableContainers: args.droppableContainers.filter((c) => c.id !== DONE_ID)
  })
}

interface Props {
  columns: TodoColumnModel[]
  accounts: TodoAccount[]
  doneTodayCount: number
  onAdd: (values: TodoValues) => Promise<boolean>
  onSave: (id: string, values: TodoValues) => Promise<boolean>
  onMove: (id: string, toBucket: TodoBucket, toIndex: number) => Promise<void>
  onComplete: (id: string) => Promise<void>
  onUndo: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<boolean>
  onOpenCompleted: () => void
}

export function TodoBoard({
  columns,
  accounts,
  doneTodayCount,
  onAdd,
  onSave,
  onMove,
  onComplete,
  onUndo,
  onDelete,
  onOpenCompleted
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [targetBucket, setTargetBucket] = useState<TodoBucket | null>(null)
  const [overDone, setOverDone] = useState(false)
  /**
   * The source card's size, and how far the overlay must move to sit centred on
   * the cursor from wherever it was grabbed.
   *
   * `width` is the card's full width; the overlay animates to half of it, so the
   * offset is computed against the *halved* width — the thing being centred is what
   * the card becomes, not what it was.
   */
  const [pickup, setPickup] = useState({ x: 0, y: 0, width: 0, height: 0 })
  /** Cleared shortly after a drop; only drives the widen-into-slot animation. */
  const [landedId, setLandedId] = useState<string | null>(null)
  const landTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  // One composer at a time, identified by the column it belongs to.
  const [composingBucket, setComposingBucket] = useState<TodoBucket | null>(null)
  const [accept, setAccept] = useState<AcceptSignal | null>(null)
  const [undoStack, setUndoStack] = useState<{ id: string; title: string }[]>([])

  useEffect(() => {
    return () => {
      if (landTimer.current !== null) clearTimeout(landTimer.current)
    }
  }, [])

  const acceptSeq = useRef(0)
  const railRef = useRef<HTMLDivElement>(null)
  // `boolean | null` from the hook; null means "not determined yet".
  const reduced = useReducedMotion() ?? false

  const sensors = useSensors(
    // The 5px threshold is load-bearing: it lets a plain click open the inline
    // editor, and a click on the "Done" button stay a click, without either
    // being read as the start of a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const byOrgId = useMemo(() => new Map(accounts.map((a) => [a.orgId, a])), [accounts])
  const accountOf = useCallback(
    (orgId: string | null) => (orgId ? byOrgId.get(orgId) : undefined),
    [byOrgId]
  )

  const allTodos = useMemo(() => columns.flatMap((c) => c.todos), [columns])
  const activeTodo = useMemo(
    () => (activeId ? (allTodos.find((t) => t.id === activeId) ?? null) : null),
    [activeId, allTodos]
  )

  /** Which column an id belongs to — a lane, or a card within one. */
  function bucketOf(id: string): TodoColumnModel | null {
    if (id.startsWith(BUCKET_PREFIX)) {
      const key = id.slice(BUCKET_PREFIX.length)
      return columns.find((c) => c.bucket === key) ?? null
    }
    return columns.find((c) => c.todos.some((t) => t.id === id)) ?? null
  }

  function reset() {
    setActiveId(null)
    setTargetBucket(null)
    setOverDone(false)
    // Back to the card's own footprint, so a dropped overlay widens back out and
    // lands square with its slot rather than thin and offset.
    setPickup((p) => ({ ...p, x: 0, y: 0 }))
  }

  /**
   * Starts the celebration and the write, in that order and both synchronously.
   *
   * React batches them into one commit, so the drag overlay unmounts on exactly
   * the frame the effect's clone mounts. Move either behind an await and you get a
   * frame where the card is simply gone and the effect appears out of nothing.
   *
   * The write is deliberately not awaited: a Supabase round trip is longer than
   * most of the effects, so awaiting would leave the card on screen for a beat and
   * then burst confetti where it no longer is.
   */
  const completeWithFx = useCallback(
    (todo: Todo, rect: FxRect, target: { x: number; y: number }) => {
      const { landAt } = playCompletionFx(
        {
          rect,
          target,
          color: accountOf(todo.orgId)?.color ?? null,
          // A static face: no interactive props, so ChannelSlider-style live
          // controls never get cloned into the shards' accessibility tree.
          face: <TodoFace todo={todo} account={accountOf(todo.orgId)} />
        },
        reduced
      )

      acceptSeq.current += 1
      // Fires even when no effect played (reduced motion), so the rail still
      // acknowledges the drop.
      setAccept({ seq: acceptSeq.current, delay: landAt })
      setUndoStack((prev) => [...prev, { id: todo.id, title: todo.title }])
      void onComplete(todo.id)
    },
    [accountOf, onComplete, reduced]
  )

  /** The keyboard path: the card measures itself, the rail is measured here. */
  const completeFromCard = useCallback(
    (id: string, rect: DOMRect) => {
      const todo = allTodos.find((t) => t.id === id)
      const rail = railRef.current?.getBoundingClientRect()
      if (!todo || !rail) return
      setEditingId((current) => (current === id ? null : current))
      completeWithFx(todo, rect, {
        x: rail.left + rail.width / 2,
        y: rail.top + rail.height / 2
      })
    },
    [allTodos, completeWithFx]
  )

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))

    /*
     * dnd-kit lines the overlay's top-left up with the source card's top-left and
     * then applies the drag delta, so by default the cursor sits wherever it
     * happened to grab. To centre the card on the cursor instead, shift it by the
     * grab point measured from the card's own centre.
     *
     * The activator event is the pointerdown that armed the drag — five pixels of
     * movement earlier — which is exactly "where you grabbed it".
     *
     * The rect is read straight from the DOM rather than from
     * `active.rect.current.initial`, which is still null this early: dnd-kit
     * populates it after onDragStart, so using it silently left the offset at zero
     * and the card never moved off dnd-kit's default alignment.
     */
    const activator = e.activatorEvent as Partial<PointerEvent> | undefined
    const node = document.querySelector(`[data-todo-id="${CSS.escape(String(e.active.id))}"]`)
    const rect = node?.getBoundingClientRect()
    if (!rect) return

    if (typeof activator?.clientX === 'number' && typeof activator?.clientY === 'number') {
      setPickup({
        // Halved width, so a quarter of the full width is its new half-extent.
        x: activator.clientX - rect.left - rect.width / 4,
        y: activator.clientY - rect.top - rect.height / 2,
        width: rect.width,
        height: rect.height
      })
    } else {
      // Keyboard drags have no pointer to centre on; leave the card where it is.
      setPickup({ x: 0, y: 0, width: rect.width, height: rect.height })
    }
  }

  function handleDragOver(e: DragOverEvent) {
    const overId = e.over ? String(e.over.id) : null
    // Set while the pointer is still over the rail, never on drop: dnd-kit starts
    // its drop animation in the same commit that clears activeId, so a flag
    // written in onDragEnd is a race against the thing it is meant to configure.
    setOverDone(overId === DONE_ID)
    const over = overId && overId !== DONE_ID ? bucketOf(overId) : null
    setTargetBucket(over?.bucket ?? null)
  }

  function handleDragEnd(e: DragEndEvent) {
    const id = String(e.active.id)
    const overId = e.over ? String(e.over.id) : null
    // Read the rects before reset(), while dnd-kit's measurements are still live.
    const rect = e.active.rect.current.translated ?? e.active.rect.current.initial
    const overRect = e.over?.rect ?? null
    reset()
    if (!overId) return

    // The completion branch must come before the bucket lookup, or it falls
    // through the `if (!target) return` guard below and nothing happens.
    if (overId === DONE_ID) {
      const todo = allTodos.find((t) => t.id === id)
      if (!todo) return
      if (rect && overRect) {
        completeWithFx(todo, rect, {
          // over.rect is already measured by dnd-kit, so this costs no forced
          // layout read in the middle of a drop.
          x: overRect.left + overRect.width / 2,
          y: overRect.top + overRect.height / 2
        })
      } else {
        void onComplete(id)
      }
      return
    }

    const target = bucketOf(overId)
    if (!target) return

    // The insertion index is the over-card's index in the target column's FULL
    // list, which is what matches dnd-kit's own arrayMove semantics in both
    // directions. Note the opposite rule one call away: positionFor's siblings
    // must EXCLUDE the dragged card, or a same-column drag midpoints against
    // itself. Two opposite exclusions, a line apart — keep both comments.
    const index = overId.startsWith(BUCKET_PREFIX)
      ? target.todos.filter((t) => t.id !== id).length
      : target.todos.findIndex((t) => t.id === overId)
    if (index < 0) return

    const current = columns.find((c) => c.todos.some((t) => t.id === id))
    const currentIndex = current?.todos.findIndex((t) => t.id === id) ?? -1
    // Nothing to do when the card was dropped exactly where it started.
    if (current?.bucket === target.bucket && currentIndex === index) return

    // Marks the card so it widens back out into its new slot on arrival.
    setLandedId(id)
    if (landTimer.current !== null) clearTimeout(landTimer.current)
    landTimer.current = setTimeout(() => setLandedId(null), 400)

    void onMove(id, target.bucket, index)
  }

  const top = undoStack[undoStack.length - 1]

  /*
   * Stable identities. CompletionUndo's dismiss timeout depends on these, so an
   * inline arrow here would hand it a new function every render and restart the
   * six-second clock each time — leaving the toast up indefinitely.
   */
  const undoOne = useCallback(
    (id: string) => {
      setUndoStack((prev) => prev.filter((entry) => entry.id !== id))
      void onUndo(id)
    },
    [onUndo]
  )
  const dismissUndo = useCallback(() => setUndoStack([]), [])

  return (
    <DndContext
      sensors={sensors}
      measuring={measuring}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={reset}
    >
      {/*
        No horizontal scroll: three columns plus an 88px rail always fit. That
        removes two whole classes of drag bug at a stroke — dnd-kit auto-scrolling
        the container mid-drag so coordinates computed earlier go stale, and an
        element's rect landing outside the window entirely.
      */}
      <div className="flex h-full gap-3 overflow-hidden px-5 pb-6">
        {columns.map((column) => (
          <TodoColumn
            key={column.bucket}
            column={column}
            accounts={accounts}
            accountOf={accountOf}
            editingId={editingId}
            composing={composingBucket === column.bucket}
            onEdit={(id) => {
              // Opening a card's editor closes the composer, so there is only ever
              // one form on the board.
              setComposingBucket(null)
              setEditingId(id)
            }}
            onCompose={() => {
              setEditingId(null)
              setComposingBucket(column.bucket)
            }}
            onCancelCompose={() => setComposingBucket(null)}
            onAdd={onAdd}
            onSave={onSave}
            onDelete={(id) => {
              setEditingId(null)
              void onDelete(id)
            }}
            onComplete={completeFromCard}
            landedId={landedId}
            isActiveTarget={activeId !== null && targetBucket === column.bucket}
          />
        ))}

        <CompleteZone
          containerRef={railRef}
          count={doneTodayCount}
          armed={activeId !== null}
          hot={overDone}
          accept={accept}
          reduced={reduced}
          onOpenCompleted={onOpenCompleted}
        />

      </div>

      <DragOverlay dropAnimation={overDone ? null : DROP_ANIM}>
        {activeTodo && (
          /*
           * No fixed width class. dnd-kit sizes the overlay wrapper to the card's
           * own measured rect, and the child animates within it: full width at the
           * moment of pickup, then half, so the card visibly thins as you lift it
           * and widens back out into its column when you let go.
           *
           * Width rather than scaleX, deliberately — scaling would squash the text
           * horizontally, where narrowing lets it rewrap and still read.
           *
           * motion drives it so picking a card up is a glide rather than a jump.
           * Note this composes rather than conflicts: dnd-kit writes the drag
           * translation to its own wrapper element and this transform sits on a
           * child, so the two never fight over one element's `transform`.
           */
          <motion.div
            initial={{ x: 0, y: 0, rotate: 0, width: pickup.width || undefined }}
            animate={{
              x: pickup.x,
              y: pickup.y,
              // Squaring up as it nears the rail foreshadows the swallow.
              rotate: overDone ? 0 : 1,
              width: pickup.width ? pickup.width / 2 : undefined
            }}
            transition={{ type: 'spring', stiffness: 520, damping: 42, mass: 0.6 }}
            className="dragging-card cursor-grabbing"
          >
            <TodoFace todo={activeTodo} account={accountOf(activeTodo.orgId)} dragging />
          </motion.div>
        )}
      </DragOverlay>

      <CompletionUndo
        top={top ? { ...top, runLength: undoStack.length } : null}
        reduced={reduced}
        onUndo={undoOne}
        onDismiss={dismissUndo}
      />
    </DndContext>
  )
}
