/*
 * Every Supabase read and write the app performs — now in `src/core/board`, so
 * the MCP server can call exactly the same functions the UI does rather than
 * reimplementing the rules in SQL.
 *
 * This file stays as the renderer's door to it for two reasons. The import
 * pulls in `./supabase` for its side effect, which is what registers the client
 * with core, so no component can reach a query before the client exists. And
 * every call site in the app already imports from here.
 */
import './supabase'

export * from '../../../core/board'
