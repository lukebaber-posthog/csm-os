import { z } from 'zod'
import {
  addTodo,
  completeTodo,
  deleteTodo,
  loadCompletedTodos,
  loadTodos,
  moveTodo,
  todoPositionFor,
  uncompleteTodo,
  updateTodo,
  type Todo
} from '../../core/board.js'
import { BUCKET_LABELS, TODO_BUCKETS, TODO_KINDS, type TodoBucket, type TodoKind } from '../../core/todos.js'
import { resolveAccount } from '../accounts.js'
import { tool, type Ctx } from '../tool.js'

const bucketArg = z
  .enum(TODO_BUCKETS as unknown as [TodoBucket, ...TodoBucket[]])
  .describe('Which horizon column: month, week, or today.')

const kindArg = z
  .enum(TODO_KINDS as unknown as [TodoKind, ...TodoKind[]])
  .describe(
    'What the to-do is about. Only "account" carries an account — a "pr" or "other" to-do ' +
      'has its account link dropped on write.'
  )

/** The shape returned to the model: ids it will need, plus the account by name. */
function present(todo: Todo, nameOf: (orgId: string) => string | null) {
  return {
    id: todo.id,
    title: todo.title,
    note: todo.note,
    url: todo.url,
    bucket: todo.bucket,
    column: BUCKET_LABELS[todo.bucket],
    kind: todo.kind,
    account: todo.orgId ? nameOf(todo.orgId) : null,
    orgId: todo.orgId,
    completedAt: todo.completedAt
  }
}

export const todoTools = [
  tool<{ bucket?: TodoBucket; kind?: TodoKind; account?: string; completed?: boolean }>({
    name: 'list_todos',
    title: 'List to-dos',
    description:
      'Open to-dos by default, in board order. Set completed to see finished ones instead, ' +
      'newest first.',
    readOnly: true,
    inputSchema: {
      bucket: bucketArg.optional(),
      kind: kindArg.optional(),
      account: z.string().optional().describe('Only to-dos about this account.'),
      completed: z.boolean().optional().describe('Return completed to-dos instead of open ones.')
    },
    async handler({ bucket, kind, account, completed }, ctx: Ctx) {
      const book = ctx.book()
      const nameOf = (orgId: string) =>
        book.accounts.find((a) => a.orgId === orgId)?.orgName ?? null

      const rows = completed
        ? await loadCompletedTodos(ctx.email)
        : await loadTodos(ctx.email)

      const orgId = account ? resolveAccount(book, account).orgId : null
      const filtered = rows.filter(
        (t) =>
          (!bucket || t.bucket === bucket) &&
          (!kind || t.kind === kind) &&
          (!orgId || t.orgId === orgId)
      )

      return { count: filtered.length, todos: filtered.map((t) => present(t, nameOf)) }
    }
  }),

  tool<{
    title: string
    bucket?: TodoBucket
    kind?: TodoKind
    account?: string
    note?: string
    url?: string
  }>({
    name: 'create_todo',
    title: 'Create a to-do',
    description:
      'Adds a to-do at the bottom of its column. Notes support the app\'s markup: `code`, ' +
      '**bold**, *italic*, ++underline++, {blue|coloured} and [label](url).',
    inputSchema: {
      title: z.string().describe('What needs doing.'),
      bucket: bucketArg.optional().describe('Defaults to week.'),
      kind: kindArg.optional().describe('Defaults to account.'),
      account: z.string().optional().describe('Account name or org id, for an account to-do.'),
      note: z.string().optional(),
      url: z.string().optional().describe('A link the to-do is about.')
    },
    async handler({ title, bucket, kind, account, note, url }, ctx: Ctx) {
      const book = ctx.book()
      const resolvedKind = kind ?? 'account'
      const orgId = account ? resolveAccount(book, account).orgId : null

      if (resolvedKind === 'account' && !orgId) {
        throw new Error(
          'An account to-do needs an account. Pass one, or set kind to "pr" or "other".'
        )
      }

      const existing = await loadTodos(ctx.email)
      const created = await addTodo(
        ctx.email,
        {
          title,
          note: note ?? '',
          url: url ?? '',
          bucket: bucket ?? 'week',
          kind: resolvedKind,
          orgId
        },
        existing
      )
      return present(created, (id) => book.accounts.find((a) => a.orgId === id)?.orgName ?? null)
    }
  }),

  tool<{
    id: string
    title: string
    bucket: TodoBucket
    kind: TodoKind
    account?: string
    note?: string
    url?: string
  }>({
    name: 'update_todo',
    title: 'Edit a to-do',
    description:
      'Rewrites a to-do. Every field is written, so anything left out is cleared — read it with ' +
      'list_todos first.',
    inputSchema: {
      id: z.string(),
      title: z.string(),
      bucket: bucketArg,
      kind: kindArg,
      account: z.string().optional(),
      note: z.string().optional(),
      url: z.string().optional()
    },
    async handler({ id, title, bucket, kind, account, note, url }, ctx: Ctx) {
      const book = ctx.book()
      const all = await loadTodos(ctx.email)
      const before = all.find((t) => t.id === id)
      if (!before) throw new Error(`No open to-do with id ${id}.`)

      const orgId = account ? resolveAccount(book, account).orgId : null
      // Position only has to change when the column does; otherwise it keeps
      // its slot, which is what the app's editor does too.
      const position =
        bucket === before.bucket
          ? before.position
          : todoPositionFor(all, id, bucket, Number.MAX_SAFE_INTEGER)

      await updateTodo(
        ctx.email,
        id,
        { title, note: note ?? '', url: url ?? '', bucket, kind, orgId },
        position
      )
      return { id, title, bucket, kind, account: orgId ? account : null }
    }
  }),

  tool<{ id: string; bucket: TodoBucket; index?: number }>({
    name: 'move_todo',
    title: 'Move a to-do to another column',
    description: 'Moves a to-do between the three horizon columns, optionally to a given position.',
    inputSchema: {
      id: z.string(),
      bucket: bucketArg,
      index: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Position in the column, 0 being the top. Defaults to the bottom.')
    },
    async handler({ id, bucket, index }, ctx: Ctx) {
      const all = await loadTodos(ctx.email)
      if (!all.some((t) => t.id === id)) throw new Error(`No open to-do with id ${id}.`)
      const toIndex = index ?? all.filter((t) => t.bucket === bucket && t.id !== id).length
      const position = todoPositionFor(all, id, bucket, toIndex)
      await moveTodo(ctx.email, id, bucket, position)
      return { id, bucket, column: BUCKET_LABELS[bucket], index: toIndex }
    }
  }),

  tool<{ id: string }>({
    name: 'complete_todo',
    title: 'Complete a to-do',
    description:
      'Marks a to-do done. Nothing is deleted — it moves to the completed list and can be ' +
      'restored with reopen_todo.',
    inputSchema: { id: z.string() },
    async handler({ id }, ctx: Ctx) {
      await completeTodo(ctx.email, id, new Date().toISOString())
      return { id, completed: true }
    }
  }),

  tool<{ id: string }>({
    name: 'reopen_todo',
    title: 'Reopen a completed to-do',
    description: 'Puts a completed to-do back on the board, in the column and slot it left.',
    inputSchema: { id: z.string() },
    async handler({ id }, ctx: Ctx) {
      await uncompleteTodo(ctx.email, id)
      return { id, reopened: true }
    }
  }),

  tool<{ id: string }>({
    name: 'delete_todo',
    title: 'Delete a to-do',
    description:
      'Removes a to-do permanently. Completing is almost always what you want instead — that ' +
      'keeps it in the completed list.',
    destructive: true,
    inputSchema: { id: z.string() },
    async handler({ id }, ctx: Ctx) {
      await deleteTodo(ctx.email, id)
      return { id, deleted: true }
    }
  })
]
