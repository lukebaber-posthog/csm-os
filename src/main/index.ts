import { join } from 'node:path'
import { app, shell, BrowserWindow, nativeTheme } from 'electron'
import { registerIpc } from './ipc.js'
import { buildMenu } from './menu.js'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    // Enough that all six columns stay legible without horizontal scrolling.
    minWidth: 1180,
    minHeight: 600,
    show: false,
    title: 'CSM OS',
    titleBarStyle: 'hiddenInset',
    // Matches the renderer's page background so there is no flash on open.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#ffffff',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Rebuilt per window, because the Settings item targets this window's renderer.
  buildMenu(win)

  // Keep external links in the user's browser rather than in an app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServer = process.env.ELECTRON_RENDERER_URL
  if (devServer) {
    void win.loadURL(devServer)
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
