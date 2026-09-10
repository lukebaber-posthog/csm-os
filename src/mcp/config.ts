import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Where the MCP server gets its settings.
 *
 * The same `.env` the app uses, read here rather than through Vite: the two
 * processes need identical Supabase credentials, and a second file to keep in
 * step is a second file to get wrong. `CSM_EMAIL` is the one value only this
 * side needs, because the app learns it from whoever signed in and the server
 * has no one to ask.
 */

/**
 * A deliberately small `.env` reader.
 *
 * `dotenv` would do this, but the format in play here is `KEY=value` with `#`
 * comments and nothing else, and a dependency whose whole job is one `split`
 * costs more to justify than to write. Real environment variables win, so a
 * launcher can override the file without editing it.
 */
function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {}
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return out
  }

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    // Quotes are stripped, not honoured: nothing in this file is multi-line.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

/**
 * The user-data directory Electron writes the account cache into.
 *
 * A twin of the helper in `electron.vite.config.ts`, which serves the same file
 * to the dev browser. It cannot be shared through `src/core`, because core is
 * bundled into the renderer and importing `node:os` there would break the
 * browser build.
 */
export function userDataDir(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'csm-os')
  }
  if (process.platform === 'win32') return join(process.env.APPDATA ?? homedir(), 'csm-os')
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'csm-os')
}

export interface Config {
  supabaseUrl: string
  supabaseKey: string
  /**
   * Whose board this server operates on.
   *
   * Configuration, never a tool argument. Supabase is reached with a
   * publishable key under permissive RLS, so an email supplied per-call would
   * let a prompt reach a colleague's board — the scoping has to sit somewhere
   * the model cannot write to.
   */
  email: string
}

function repoRoot(): string {
  // Built to out/mcp/index.js, so the root is two levels up from the bundle.
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
}

export function loadConfig(): Config {
  const file = readEnvFile(join(repoRoot(), '.env'))
  const get = (key: string): string | undefined => process.env[key] || file[key]

  const supabaseUrl = get('VITE_SUPABASE_URL')
  const supabaseKey = get('VITE_SUPABASE_ANON_KEY')
  const email = get('CSM_EMAIL')

  const missing = [
    !supabaseUrl && 'VITE_SUPABASE_URL',
    !supabaseKey && 'VITE_SUPABASE_ANON_KEY',
    !email && 'CSM_EMAIL'
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.join(', ')}. The first two come from .env, which the app already needs; ` +
        'CSM_EMAIL is the address you sign in with and belongs there too.'
    )
  }

  return { supabaseUrl: supabaseUrl!, supabaseKey: supabaseKey!, email: email! }
}
