import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { loadCompletedTodos, type Todo } from '../lib/board'
import { BUCKET_LABELS } from '../lib/todos'
import { Notice } from './ui/Notice'
import { Spinner } from './ui/Spinner'
import { AccountChip } from './AccountChip'
import type { TodoAccount } from './TodoCard'

interface Props {
  open: boolean
  email: string
  accountOf: (orgId: string | null) => TodoAccount | undefined
  onRestore: (todo: Todo) => Promise<boolean>
  onOpenChange: (open: boolean) => void
}

/**
 * What you have finished, and the way back from having finished it.
 *
 * The undo toast only lives for six seconds, so before this existed a completed
 * to-do was gone from the UI for good — the rail's counter said how many, and
 * nothing could show you which. Loaded fresh on open rather than from the board's
 * state, because the board only ever holds today's completions.
 */
export function CompletedDialog({ open, email, accountOf, onRestore, onOpenChange }: Props) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setError(null)
    loadCompletedTodos(email)
      .then((rows) => active && setTodos(rows))
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [open, email])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Completed</DialogTitle>
          <DialogDescription className="text-[12px]">
            Nothing is deleted when you complete it. Restore anything to put it back
            in the column it came from.
          </DialogDescription>
        </DialogHeader>

        {error && <Notice tone="error">{error}</Notice>}

        {loading ? (
          <Spinner label="Loading…" />
        ) : todos.length === 0 ? (
          <p className="py-4 text-[12px] text-[var(--color-ink-faint)]">
            Nothing completed yet.
          </p>
        ) : (
          <ol className="-mr-2 max-h-[46vh] space-y-1 overflow-y-auto pr-2">
            {todos.map((todo) => {
              const account = accountOf(todo.orgId)
              return (
                <li
                  key={todo.id}
                  className="group flex items-start gap-2 rounded-md border border-transparent px-2 py-1.5 hover:border-[var(--color-line)] hover:bg-[var(--color-surface)]"
                >
                  {account ? (
                    <AccountChip
                      orgId={account.orgId}
                      orgName={account.orgName}
                      domain={account.domain}
                      size="sm"
                    />
                  ) : (
                    <span aria-hidden className="h-4 w-4 shrink-0" />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-[var(--color-ink)]">{todo.title}</p>
                    <p className="mt-0.5 truncate text-[10px] text-[var(--color-ink-faint)]">
                      {BUCKET_LABELS[todo.bucket]}
                      {account && ` · ${account.orgName}`}
                      {todo.completedAt &&
                        ` · ${new Date(todo.completedAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}`}
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="xs"
                    // Quiet until the row is hovered, like the touch log's actions.
                    className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={async () => {
                      const ok = await onRestore(todo)
                      // Drop it from the list only once the write landed, so a
                      // failure leaves it here to try again.
                      if (ok) setTodos((prev) => prev.filter((t) => t.id !== todo.id))
                    }}
                  >
                    Restore
                  </Button>
                </li>
              )
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  )
}
