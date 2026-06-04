import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } from 'electron'
import { join } from 'path'
import {
  initDb,
  listEvents, createEvent, updateEvent, updateEventMove, updateEventInstance, deleteEvent, deleteEventInstance,
  listTasks, createTask, toggleTask, deleteTask
} from './db/storage'

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0) }

let mainWindow: BrowserWindow | null = null
let dashboardWindow: BrowserWindow | null = null
let tray: Tray | null = null
let windowExpanded = false

// ── Window helpers ────────────────────────────────────────────────────────
function getWorkArea() { return screen.getPrimaryDisplay().workAreaSize }

function calcBounds(expanded: boolean) {
  const { width: w, height: h } = getWorkArea()
  return expanded ? { x: w - 332, y: 0, width: 332, height: h }
                  : { x: w - 52,  y: 0, width: 52,  height: h }
}

// ── Sidebar window ────────────────────────────────────────────────────────
function createWindow(): void {
  mainWindow = new BrowserWindow({
    ...calcBounds(false), frame: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: true, resizable: false, hasShadow: false, focusable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
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

// ── Dashboard window ──────────────────────────────────────────────────────
function openDashboard(): void {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.focus(); return
  }
  dashboardWindow = new BrowserWindow({
    width: 960, height: 700, minWidth: 800, minHeight: 560,
    title: 'Daily Sidebar Planner — 달력',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  })
  dashboardWindow.once('ready-to-show', () => dashboardWindow?.show())
  dashboardWindow.on('closed', () => { dashboardWindow = null })

  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    dashboardWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#dashboard')
  } else {
    dashboardWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'dashboard' })
  }
}

// ── Tray ──────────────────────────────────────────────────────────────────
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Daily Sidebar Planner', enabled: false },
    { type: 'separator' },
    { label: '창 표시', click: () => mainWindow?.show() },
    { label: '대시보드 열기', click: openDashboard },
    { type: 'separator' },
    {
      label: '자동 시작', type: 'checkbox',
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

function createTray(): void {
  let icon: Electron.NativeImage
  try {
    icon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png')).resize({ width: 16, height: 16 })
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
  mainWindow.setBounds(calcBounds(true)); windowExpanded = true
})
ipcMain.on('window:collapse', () => {
  if (!mainWindow || !windowExpanded) return
  mainWindow.setBounds(calcBounds(false)); windowExpanded = false
})
ipcMain.on('window:open-dashboard', openDashboard)

/** Dashboard → navigate sidebar to a specific date */
ipcMain.on('navigate-date', (_e, { ts }: { ts: number }) => {
  mainWindow?.webContents.send('navigate-to-date', { ts })
})

// ── IPC: Events ───────────────────────────────────────────────────────────
ipcMain.handle('db:events:list',            (_e, p: { start: number; end: number }) => listEvents(p.start, p.end))
ipcMain.handle('db:events:create',          (_e, data) => createEvent(data))
ipcMain.handle('db:events:update',          (_e, data) => updateEvent(data))
ipcMain.handle('db:events:move',            (_e, { id, start_at, end_at }: { id: string; start_at: number; end_at: number }) => updateEventMove(id, start_at, end_at))
ipcMain.handle('db:events:update-instance', (_e, data) => { updateEventInstance(data); return null })
ipcMain.handle('db:events:delete',          (_e, { id }: { id: string }) => deleteEvent(id))
ipcMain.handle('db:events:delete-instance', (_e, data) => { deleteEventInstance(data); return null })

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

// ── App lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(() => { initDb(); createWindow(); createTray() })
app.on('window-all-closed', () => { /* keep alive in tray */ })
app.on('second-instance',   () => mainWindow?.show())
app.on('before-quit',       () => { tray?.destroy(); tray = null })
