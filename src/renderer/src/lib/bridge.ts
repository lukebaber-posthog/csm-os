/**
 * Guards against a preload bridge that is not there.
 *
 * `contextBridge.exposeInMainWorld` runs only when the preload script is
 * evaluated, so a renderer running against a preload built before a bridge was
 * added sees `window.api.<name>` as undefined. The failure that follows is a bare
 * "Cannot read properties of undefined (reading 'saveText')", which says nothing
 * about the cause and sends you looking in the renderer for a bug that is not
 * there.
 *
 * This turns that into a message naming the fix. It matters most under
 * `pnpm dev`: a long-running dev server can be serving an older preload than the
 * renderer it is hot-reloading, and every symptom points the wrong way.
 */
export function bridgeMissing(name: string): string {
  return (
    `The app cannot reach its "${name}" bridge. If you are running \`pnpm dev\`, ` +
    'restart it — the preload script only reloads when the dev server does, so a ' +
    'renderer can end up newer than the bridge it is calling.'
  )
}

/** Narrow accessor that fails loudly and usefully rather than on a property read. */
export function requireBridge<K extends keyof Window['api']>(name: K): Window['api'][K] {
  const bridge = window.api?.[name]
  if (!bridge) throw new Error(bridgeMissing(String(name)))
  return bridge
}
