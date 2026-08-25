import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'

/**
 * The application menu.
 *
 * Setting one at all is what this exists for: Electron's default menu has no
 * Settings item, and on macOS the app menu with Cmd+, is the first place anyone
 * looks. Replacing the default means supplying the standard items too, hence the
 * roles below — they get the platform's own labels and accelerators for free.
 *
 * The item does not open anything itself; it tells the renderer, which owns the
 * dialog.
 */
export function buildMenu(win: BrowserWindow): void {
  const isMac = process.platform === 'darwin'

  const settings: MenuItemConstructorOptions = {
    label: 'Settings…',
    accelerator: 'CmdOrCtrl+,',
    click: () => win.webContents.send('menu:settings')
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              settings,
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ] as MenuItemConstructorOptions[])
      : []),
    // On Windows and Linux the convention is File, so Settings lives there.
    isMac
      ? { role: 'fileMenu' }
      : { label: '&File', submenu: [settings, { type: 'separator' }, { role: 'quit' }] },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
