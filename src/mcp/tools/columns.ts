import { z } from 'zod'
import {
  addStage,
  deleteStage,
  loadColumns,
  loadLayouts,
  loadPlacements,
  loadStages,
  renameStage,
  reorderStages
} from '../../core/board.js'
import { DEFAULT_LAYOUT, layoutDef } from '../../core/layouts.js'
import { tool, type Ctx } from '../tool.js'

const MIN_COLUMNS = 2
const MAX_COLUMNS = 10

const layoutArg = z
  .string()
  .optional()
  .describe(`Layout key. Defaults to "${DEFAULT_LAYOUT}".`)

/**
 * A computed layout's columns are a rule over the touch log, so there is nothing
 * to rename, add, reorder or delete — the same reason `Column` hides those
 * controls in the UI.
 */
function refuseIfComputed(layoutKey: string): void {
  if (layoutDef(layoutKey).computed) {
    throw new Error(
      `The "${layoutKey}" layout's columns are computed from each account's last contact, so ` +
        'they cannot be edited. Its shape lives in src/core/layouts.ts.'
    )
  }
}

export const columnTools = [
  tool<Record<string, never>>({
    name: 'list_layouts',
    title: 'List layouts and their columns',
    description:
      'Every layout with its columns in order. Call this first when a request names a column, ' +
      'so the key and the label can be told apart.',
    readOnly: true,
    inputSchema: {},
    async handler(_args, ctx: Ctx) {
      const layouts = await loadLayouts(ctx.email)
      const withStages = await Promise.all(
        layouts.map(async (l) => ({
          key: l.key,
          label: l.label,
          computed: layoutDef(l.key).computed === true,
          columns: (await loadColumns(ctx.email, l.key)).map((s) => ({
            key: s.key,
            label: s.label
          }))
        }))
      )
      return { layouts: withStages }
    }
  }),

  tool<{ label: string; layout?: string }>({
    name: 'add_column',
    title: 'Add a column',
    description: `Appends a column to a layout. A layout holds ${MIN_COLUMNS} to ${MAX_COLUMNS}.`,
    inputSchema: {
      label: z.string().describe('The column heading.'),
      layout: layoutArg
    },
    async handler({ label, layout }, ctx: Ctx) {
      const layoutKey = layout ?? DEFAULT_LAYOUT
      refuseIfComputed(layoutKey)
      const stages = await loadStages(ctx.email, layoutKey)
      if (stages.length >= MAX_COLUMNS) {
        throw new Error(`"${layoutKey}" already has ${MAX_COLUMNS} columns, which is the ceiling.`)
      }
      const created = await addStage(ctx.email, layoutKey, label, stages)
      return { layout: layoutKey, column: created }
    }
  }),

  tool<{ column: string; label: string; layout?: string }>({
    name: 'rename_column',
    title: 'Rename a column',
    description: 'Changes a column heading. The key stays as it was, so placements are untouched.',
    inputSchema: {
      column: z.string().describe('Column key or current label.'),
      label: z.string().describe('The new heading.'),
      layout: layoutArg
    },
    async handler({ column, label, layout }, ctx: Ctx) {
      const layoutKey = layout ?? DEFAULT_LAYOUT
      refuseIfComputed(layoutKey)
      const stages = await loadStages(ctx.email, layoutKey)
      const lower = column.trim().toLowerCase()
      const stage = stages.find((s) => s.key === column || s.label.toLowerCase() === lower)
      if (!stage) {
        throw new Error(
          `No column "${column}" in "${layoutKey}". Columns are: ` +
            stages.map((s) => s.label).join(', ')
        )
      }
      await renameStage(ctx.email, layoutKey, stage.key, label)
      return { layout: layoutKey, key: stage.key, label }
    }
  }),

  tool<{ orderedColumns: string[]; layout?: string }>({
    name: 'reorder_columns',
    title: 'Reorder a layout\'s columns',
    description: 'Sets the left-to-right order. Every column must appear exactly once.',
    inputSchema: {
      orderedColumns: z.array(z.string()).describe('Column keys or labels, left to right.'),
      layout: layoutArg
    },
    async handler({ orderedColumns, layout }, ctx: Ctx) {
      const layoutKey = layout ?? DEFAULT_LAYOUT
      refuseIfComputed(layoutKey)
      const stages = await loadStages(ctx.email, layoutKey)

      const keys = orderedColumns.map((c) => {
        const lower = c.trim().toLowerCase()
        const stage = stages.find((s) => s.key === c || s.label.toLowerCase() === lower)
        if (!stage) throw new Error(`No column "${c}" in "${layoutKey}".`)
        return stage.key
      })

      // The RPC rewrites every position in one statement, so a partial list
      // would leave columns holding positions that no longer mean anything.
      if (new Set(keys).size !== stages.length) {
        throw new Error(
          `Give all ${stages.length} columns exactly once. Current order: ` +
            stages.map((s) => s.label).join(', ')
        )
      }

      await reorderStages(ctx.email, layoutKey, keys)
      return { layout: layoutKey, order: keys }
    }
  }),

  tool<{ column: string; layout?: string }>({
    name: 'delete_column',
    title: 'Delete a column',
    description:
      'Removes a column. Any cards in it move to the leftmost remaining column rather than ' +
      `being lost. A layout cannot go below ${MIN_COLUMNS} columns.`,
    destructive: true,
    inputSchema: {
      column: z.string().describe('Column key or label.'),
      layout: layoutArg
    },
    async handler({ column, layout }, ctx: Ctx) {
      const layoutKey = layout ?? DEFAULT_LAYOUT
      refuseIfComputed(layoutKey)
      const stages = await loadStages(ctx.email, layoutKey)
      if (stages.length <= MIN_COLUMNS) {
        throw new Error(`"${layoutKey}" is down to ${stages.length} columns, which is the floor.`)
      }
      const lower = column.trim().toLowerCase()
      const stage = stages.find((s) => s.key === column || s.label.toLowerCase() === lower)
      if (!stage) throw new Error(`No column "${column}" in "${layoutKey}".`)

      const placements = await loadPlacements(ctx.email, layoutKey)
      const rehomed = placements.filter((p) => p.stageKey === stage.key).length
      await deleteStage(ctx.email, layoutKey, stage.key)
      return { layout: layoutKey, deleted: stage.label, cardsRehomed: rehomed }
    }
  })
]
