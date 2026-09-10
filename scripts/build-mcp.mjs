import { build } from 'esbuild'

/**
 * Bundles the MCP server into one file.
 *
 * Bundled rather than emitted with `tsc`, and not for speed: this code imports
 * modules with extensionless relative paths, which Node's ESM loader rejects at
 * runtime. `tsc` would emit them unchanged and the server would die on its first
 * import. esbuild resolves them at build time, so the question never comes up.
 *
 * Everything is inlined, including @supabase/supabase-js, so the built file can
 * be run from anywhere without node_modules beside it.
 */
await build({
  entryPoints: ['src/mcp/index.ts'],
  outfile: 'out/mcp/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // No shebang banner: esbuild already carries the entry file's own through to
  // the bundle, and adding a second puts one on line 2 where it is a syntax
  // error rather than a comment.
  logLevel: 'info'
})
