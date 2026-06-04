import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } from 'electron'
import { join } from 'path'
import {
  initDb,
  listEvents, createEvent, updateEvent, deleteEvent,
  listTasks, createTask, toggleTask, deleteTask
} from './db/storage'

// Single-instance lock
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let windowExpanded = false

function getWorkArea() {
  return screen.getPrimaryDisplay().workAreaSize
}

function calcBounds(expanded: boolean) {
  const { width: w, height: h } = getWorkArea()
  return expanded
    ? { x: w - 332, y: 0, width: 332, height: h }
    : { x: w - 52,  y: 0, width: 52,  height: h }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    ...calcBounds(false),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })

  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('blur', () => mainWindow?.setAlwaysOnTop(true, 'screen-saver'))

  screen.on('display-metrics-changed', () => {
    if (!mainWindow) return
    mainWindow.setBounds(calcBounds(windowExpanded))
    mainWindow.webContents.send('display:changed')
  })
}

function createTray(): void {
  let icon: Electron.NativeImage
  try {
    icon = nativeImage
      .createFromPath(join(__dirname, '../../resources/icon.png'))
      .resize({ width: 16, height: 16 })
    if (icon.isEmpty()) throw new Error('empty')
  } catch {
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    )
  }

  tray = new Tray(icon)
  tray.setToolTip('Daily Sidebar Planner')
  tray.setContextMenu(buildTrayMenu())
  tray.on('click', () => mainWindow?.show())
}

// ── IPC: Window ───────────────────────────────────────────────────────────
ipcMain.on('window:expand', () => {
  if (!mainWindow || windowExpanded) return
  mainWindow.setBounds(calcBounds(true))
  windowExpanded = true
})

ipcMain.on('window:collapse', () => {
  if (!mainWindow || !windowExpanded) return
  mainWindow.setBounds(calcBounds(false))
  windowExpanded = false
})

// ── IPC: Events ───────────────────────────────────────────────────────────
ipcMain.handle('db:events:list',   (_e, p: { start: number; end: number }) => listEvents(p.start, p.end))
ipcMain.handle('db:events:create', (_e, data) => createEvent(data))
ipcMain.handle('db:events:update', (_e, data) => updateEvent(data))
ipcMain.handle('db:events:delete', (_e, { id }: { id: string }) => deleteEvent(id))

// ── IPC: Tasks ────────────────────────────────────────────────────────────
ipcMain.handle('db:tasks:list',   (_e, { end }: { end: number }) => listTasks(end))
ipcMain.handle('db:tasks:create', (_e, data) => createTask(data))
ipcMain.handle('db:tasks:toggle', (_e, { id }: { id: string }) => toggleTask(id))
ipcMain.handle('db:tasks:delete', (_e, { id }: { id: string }) => deleteTask(id))

// ── IPC: App settings ─────────────────────────────────────────────────────
ipcMain.handle('app:get-login-item', () => app.getLoginItemSettings().openAtLogin)
ipcMain.handle('app:set-login-item', (_e, { value }: { value: boolean }) => {
  app.setLoginItemSettings({ openAtLogin: value })
  tray?.setContextMenu(buildTrayMenu())
})

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Daily Sidebar Planner', enabled: false },
    { type: 'separator' },
    { label: '창 표시', click: () => mainWindow?.show() },
    {
      label: '자동 시작',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked })
        tray?.setContextMenu(buildTrayMenu())
      }
    },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() }
  ])
}

// ── App lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(() => {
  initDb()
  createWindow()
  createTray()
})

app.on('window-all-closed', () => { /* keep running in tray */ })
app.on('second-instance',   () => mainWindow?.show())
app.on('before-quit',       () => { tray?.destroy(); tray = null })
