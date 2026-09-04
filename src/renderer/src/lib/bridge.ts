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
 * This turns that into a message naming the fix — and there are two different
 * fixes, so it has to work out which one it is looking at first.
 */

/**
 * Whether this renderer is inside Electron at all.
 *
 * Electron appends `Electron/<version>` to the default user agent and
 * `main/index.ts` never overrides it, so this is a reliable read. The URL is
 * not: under `pnpm dev` the app window and a browser tab both sit on
 * `http://localhost:5173`, which is exactly why the two get confused.
 */
function inElectron(): boolean {
  return typeof navigator !== 'undefined' && /Electron\//.test(navigator.userAgent)
}

export function bridgeMissing(name: string): string {
  /*
   * A browser tab has no preload and never will, so telling someone to restart
   * the dev server sends them somewhere that cannot help. This message said
   * exactly that to the one audience it was wrong for, because the dev server
   * serves the interface to both and only one of them gets a bridge.
   */
  if (!inElectron()) {
    return (
      `This is a browser tab, and the "${name}" bridge only exists inside the CSM ` +
      'OS app window. The dev server hands the interface to any browser, but not ' +
      'the Electron preload that reaches PostHog, the keychain, and the save ' +
      'dialog — so restarting it will not help. Open the app window that ' +
      '`pnpm dev` launched instead.'
    )
  }

  return (
    `The app cannot reach its "${name}" bridge. Restart \`pnpm dev\` — the preload ` +
    'script only reloads when the dev server does, so a renderer can end up newer ' +
    'than the bridge it is calling.'
  )
}

/** Narrow accessor that fails loudly and usefully rather than on a property read. */
export function requireBridge<K extends keyof Window['api']>(name: K): Window['api'][K] {
  const bridge = window.api?.[name]
  if (!bridge) throw new Error(bridgeMissing(String(name)))
  return bridge
}
