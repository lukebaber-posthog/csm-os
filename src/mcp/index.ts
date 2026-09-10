#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { setSupabaseClient } from '../core/supabase.js'
import { readBook } from './accounts.js'
import { loadConfig } from './config.js'
import type { Ctx, ToolDef } from './tool.js'
import { accountTools } from './tools/accounts.js'
import { columnTools } from './tools/columns.js'
import { todoTools } from './tools/todos.js'
import { touchTools } from './tools/touches.js'

/**
 * CSM OS over MCP.
 *
 * Every tool here calls the same functions in `src/core` that the app's own UI
 * calls, rather than writing SQL of its own. That is the whole design: the rules
 * that make a write correct — dropping an account link from a PR to-do, dropping
 * a url from a call, midpointing a position, refusing to place a card on a
 * computed layout — live next to the query, so an agent cannot route around
 * them by being a different caller.
 *
 * Reads and writes go straight to Supabase, so the desktop app does not need to
 * be running. It does need to have synced at least once, because the account
 * book is read from the cache Electron writes; see `accounts.ts`.
 */

const TOOLS: ToolDef[] = [...accountTools, ...touchTools, ...todoTools, ...columnTools]

async function main(): Promise<void> {
  const config = loadConfig()

  setSupabaseClient(
    createClient(config.supabaseUrl, config.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  )

  const ctx: Ctx = {
    email: config.email,
    book: () => readBook(config)
  }

  const server = new McpServer(
    { name: 'csm-os', version: '0.1.0' },
    {
      instructions:
        'The board for a PostHog CSM book of business. Accounts come from PostHog; where they ' +
        'sit and every logged touch live in Supabase.\n\n' +
        'Accounts are addressed by name — "US Mobile", "usmobile" and the org id all work — so ' +
        'there is no need to look an id up first.\n\n' +
        'Two layouts behave differently. "relationship" is arranged by hand, so move_account ' +
        'works there. "cadence" is computed from each account\'s last contact, so a card moves ' +
        'only when a touch is logged.'
    }
  )

  for (const def of TOOLS) {
    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: def.inputSchema,
        annotations: {
          readOnlyHint: def.readOnly === true,
          destructiveHint: def.destructive === true,
          // Every write here is scoped to one signed-in CSM's own rows.
          openWorldHint: false
        }
      },
      async (args: unknown) => {
        try {
          const result = await def.handler(args as Record<string, never>, ctx)
          return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
        } catch (err) {
          /*
           * Returned as an error result rather than thrown. A throw becomes a
           * protocol error the model cannot read, and almost everything that
           * fails here — an unknown account, a duplicate touch, a computed
           * layout — is something it should act on rather than give up over.
           */
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: err instanceof Error ? err.message : String(err)
              }
            ]
          }
        }
      }
    )
  }

  await server.connect(new StdioServerTransport())
}

main().catch((err: unknown) => {
  // stderr, never stdout: stdout is the protocol channel, and a stray line
  // there corrupts the stream rather than reaching anyone.
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
