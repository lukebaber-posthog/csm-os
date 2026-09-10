import type { ZodRawShape } from 'zod'
import type { Book } from './accounts.js'

/**
 * What a tool file exports, and what it is handed.
 *
 * Tools return plain data and throw plain errors; `index.ts` is the only place
 * that knows about MCP's content envelope. That keeps each tool readable as the
 * board operation it is, and means the serialisation and error shape cannot
 * drift between twenty of them.
 */

export interface Ctx {
  /** Whose board. From configuration, never from a tool argument. */
  email: string
  /**
   * The account book, re-read per call rather than captured at startup, so a
   * sync in the app is visible to the very next tool call instead of needing
   * the server restarted.
   */
  book: () => Book
}

export interface ToolDef {
  name: string
  title: string
  description: string
  inputSchema: ZodRawShape
  /** Set on anything that removes data, so a host can prompt before running it. */
  destructive?: boolean
  /** Set on anything that only reads, which lets a host run it freely. */
  readOnly?: boolean
  handler: (args: Record<string, never>, ctx: Ctx) => Promise<unknown>
}

/** Narrows a tool's own argument type without repeating the cast at each call. */
export function tool<A>(def: {
  name: string
  title: string
  description: string
  inputSchema: ZodRawShape
  destructive?: boolean
  readOnly?: boolean
  handler: (args: A, ctx: Ctx) => Promise<unknown>
}): ToolDef {
  return def as unknown as ToolDef
}
