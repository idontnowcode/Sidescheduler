import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, Display, Notification } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { computeWorkload, buildReminderBody } from './workload'
import {
  initDb,
  listEvents, createEvent, updateEvent, updateEventMove, updateEventInstance, deleteEvent, deleteEventInstance,
  listTasks, listAllIncompleteTasks, listAllTasks, createTask, updateTask, toggleTask, snoozeTask, deleteTask,
  listProjects,
  searchAll
} from './db/storage'
import { loadSettings, saveSettings, WindowSettings } from './settings'

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0) }

let mainWindow: BrowserWindow | null = null
let dashboardWindow: BrowserWindow | null = null
let paletteWindow: BrowserWindow | null = null
let editorWindow: BrowserWindow | null = null
let paletteRequester: 'sidebar' | 'dashboard' = 'sidebar'
let pendingEditorPayload: unknown = null
let tray: Tray | null = null
let windowExpanded = false

// ── Layout constants ──────────────────────────────────────────────────────
const EXPANDED_HEIGHT = 580   // height when panel is open
const PANEL_W         = 300

/** Sidebar collapsed height scales with width to fit icons */
function sidebarHeight(width: number): number {
  if (width === 32) return 200
  if (width === 52) return 244
  return 220  // 40px default — +36px for Notes button
}

// ── Display / bounds ──────────────────────────────────────────────────────
function getDisplayForSettings(s: WindowSettings): Display {
  if (s.displayId != null) {
    const d = screen.getAllDisplays().find(d => d.id === s.displayId)
    if (d) return d
  }
  return screen.getPrimaryDisplay()
}

function calcBounds(expanded: boolean): { x: number; y: number; width: number; height: number } {
  const s = loadSettings()
  const display = getDisplayForSettings(s)
  const wa = display.workArea
  const sidebarW = s.width
  const sH = sidebarHeight(sidebarW)
  const totalW = expanded ? sidebarW + PANEL_W : sidebarW
  const totalH = expanded ? EXPANDED_HEIGHT : sH

  const x = s.edge === 'right'
    ? wa.x + wa.width - totalW
    : wa.x

  // Default Y = vertically centered on work area
  const defaultY = wa.y + Math.max(0, Math.floor((wa.height - sH) / 2))
  const baseY = s.customY != null ? wa.y + s.customY : defaultY
  // Clamp so window stays inside work area
  const y = Math.max(wa.y, Math.min(wa.y + wa.height - totalH, baseY))

  return { x, y, width: totalW, height: totalH }
}

function applyBounds() {
  if (!mainWindow) return
  mainWindow.setBounds(calcBounds(windowExpanded))
}

function applyMovable() {
  if (!mainWindow) return
  mainWindow.setMovable(!loadSettings().locked)
}

// ── Sidebar window ────────────────────────────────────────────────────────
function createWindow(): void {
  mainWindow = new BrowserWindow({
    ...calcBounds(false),
    frame: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: true, resizable: false, hasShadow: false, focusable: true,
    movable: !loadSettings().locked,
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

  // Persist Y after user drags the window
  mainWindow.on('moved', () => {
    if (!mainWindow) return
    const s = loadSettings()
    if (s.locked) return
    const b = mainWindow.getBounds()
    const display = getDisplayForSettings(s)
    saveSettings({ customY: Math.max(0, b.y - display.workArea.y) })
  })

  screen.on('display-metrics-changed', () => {
    if (!mainWindow) return
    applyBounds()
    mainWindow.webContents.send('display:changed')
  })
  screen.on('display-added',   () => mainWindow?.webContents.send('displays:updated'))
  screen.on('display-removed', () => mainWindow?.webContents.send('displays:updated'))
}

// ── Dashboard window ──────────────────────────────────────────────────────
function openDashboard(): void {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) { dashboardWindow.focus(); return }
  dashboardWindow = new BrowserWindow({
    width: 960, height: 700, minWidth: 800, minHeight: 560,
    title: 'Daily Sidebar Planner — Calendar',
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
    { label: 'Show Sidebar', click: () => mainWindow?.show() },
    { label: 'Open Dashboard', click: openDashboard },
    { type: 'separator' },
    {
      label: 'Launch at Startup', type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked })
        tray?.setContextMenu(buildTrayMenu())
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
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

/** Notify both data-bearing windows that something changed. */
function broadcastRefresh(): void {
  mainWindow?.webContents.send('palette:refresh')
  dashboardWindow?.webContents.send('palette:refresh')
  scheduleEventReminders()   // event data may have changed → rebuild reminders
}

// ── IPC: Window ───────────────────────────────────────────────────────────
ipcMain.on('window:expand', () => {
  if (!mainWindow || windowExpanded) return
  windowExpanded = true; applyBounds()
})
ipcMain.on('window:collapse', () => {
  if (!mainWindow || !windowExpanded) return
  windowExpanded = false; applyBounds()
})
ipcMain.on('window:open-dashboard', openDashboard)
ipcMain.on('navigate-date', (_e, { ts }: { ts: number }) => {
  mainWindow?.webContents.send('navigate-to-date', { ts })
})

// ── Palette window (separate floating overlay) ────────────────────────────
const PALETTE_W = 640
const PALETTE_H = 460

function calcPaletteBounds() {
  const display = getDisplayForSettings(loadSettings())
  const wa = display.workArea
  return {
    x: wa.x + Math.max(0, Math.floor((wa.width  - PALETTE_W) / 2)),
    y: wa.y + Math.max(0, Math.floor((wa.height - PALETTE_H) / 3)),
    width: PALETTE_W,
    height: PALETTE_H
  }
}

function openPaletteWindow(requester: 'sidebar' | 'dashboard'): void {
  paletteRequester = requester

  // If an existing palette window is stale or stuck at wrong size, force-close it
  if (paletteWindow && !paletteWindow.isDestroyed()) {
    paletteWindow.setBounds(calcPaletteBounds())
    paletteWindow.show()
    paletteWindow.focus()
    return
  }

  paletteWindow = new BrowserWindow({
    ...calcPaletteBounds(),
    frame: false, transparent: true,
    alwaysOnTop: true, skipTaskbar: true,
    resizable: false, hasShadow: false, focusable: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  })
  paletteWindow.setAlwaysOnTop(true, 'screen-saver')

  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    paletteWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#palette')
  } else {
    paletteWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'palette' })
  }

  paletteWindow.once('ready-to-show', () => {
    if (!paletteWindow || paletteWindow.isDestroyed()) return
    // Re-enforce bounds after layout — defends against any race conditions
    paletteWindow.setBounds(calcPaletteBounds())
    paletteWindow.show()
    paletteWindow.focus()
  })
  paletteWindow.on('blur', () => closePaletteWindow())
  paletteWindow.on('closed', () => { paletteWindow = null })
}

function closePaletteWindow(): void {
  if (paletteWindow && !paletteWindow.isDestroyed()) {
    paletteWindow.close()
  }
  paletteWindow = null
}

ipcMain.on('palette:open', (e) => {
  const requester: 'sidebar' | 'dashboard' =
    dashboardWindow && e.sender.id === dashboardWindow.webContents.id ? 'dashboard' : 'sidebar'
  openPaletteWindow(requester)
})
ipcMain.on('palette:close', () => closePaletteWindow())

/** Palette tells main to forward an action (e.g. open-event-modal) to its requester window */
ipcMain.on('palette:action', (_e, action: { kind: string; payload?: unknown }) => {
  const target = paletteRequester === 'dashboard' ? dashboardWindow : mainWindow
  target?.webContents.send('palette:action', action)
  closePaletteWindow()
})

/** After palette directly created an event/task, refresh both windows */
ipcMain.on('palette:refresh', () => {
  mainWindow?.webContents.send('palette:refresh')
  dashboardWindow?.webContents.send('palette:refresh')
})

// ── Editor window (event/task add/edit overlay) ───────────────────────────
const EDITOR_W = 460
const EDITOR_H = 680

function calcEditorBounds() {
  const display = getDisplayForSettings(loadSettings())
  const wa = display.workArea
  return {
    x: wa.x + Math.max(0, Math.floor((wa.width  - EDITOR_W) / 2)),
    y: wa.y + Math.max(0, Math.floor((wa.height - EDITOR_H) / 4)),
    width: EDITOR_W, height: EDITOR_H
  }
}

function openEditorWindow(payload: unknown): void {
  pendingEditorPayload = payload

  if (editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.setBounds(calcEditorBounds())
    editorWindow.webContents.send('editor:payload', payload)
    editorWindow.show()
    editorWindow.focus()
    return
  }

  editorWindow = new BrowserWindow({
    ...calcEditorBounds(),
    frame: false, transparent: true,
    alwaysOnTop: true, skipTaskbar: true,
    resizable: false, hasShadow: false, focusable: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  })
  editorWindow.setAlwaysOnTop(true, 'screen-saver')

  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    editorWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#editor')
  } else {
    editorWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'editor' })
  }

  editorWindow.once('ready-to-show', () => {
    if (!editorWindow || editorWindow.isDestroyed()) return
    editorWindow.setBounds(calcEditorBounds())
    editorWindow.show()
    editorWindow.focus()
  })
  editorWindow.on('blur', () => closeEditorWindow())
  editorWindow.on('closed', () => { editorWindow = null })
}

function closeEditorWindow(): void {
  if (editorWindow && !editorWindow.isDestroyed()) editorWindow.close()
  editorWindow = null
}

ipcMain.on('editor:open', (_e, payload: unknown) => openEditorWindow(payload))
ipcMain.on('editor:close', () => closeEditorWindow())
/** Stays valid across multiple polls — React StrictMode invokes useEffect
 *  twice in dev; we cleared the value too aggressively before. The value is
 *  overwritten the next time openEditorWindow runs. */
ipcMain.handle('editor:get-pending', () => pendingEditorPayload)
ipcMain.on('editor:saved', () => {
  broadcastRefresh()
  closeEditorWindow()
})

// ── IPC: Window settings + displays ───────────────────────────────────────
ipcMain.handle('settings:get', () => loadSettings())
ipcMain.handle('settings:set', (_e, patch: Partial<WindowSettings>) => {
  const next = saveSettings(patch)
  applyBounds()
  applyMovable()
  mainWindow?.webContents.send('settings:changed', next)
  // Reschedule reminders if work hours / toggle changed
  if ('reminderEnabled' in patch || 'workStartHour' in patch || 'workEndHour' in patch) {
    scheduleNextReminder()
  }
  return next
})
ipcMain.handle('displays:list', () => {
  return screen.getAllDisplays().map(d => ({
    id: d.id, label: d.label || '',
    bounds: d.bounds, workArea: d.workArea,
    scaleFactor: d.scaleFactor,
    isPrimary: d.id === screen.getPrimaryDisplay().id
  }))
})

// ── IPC: Events ───────────────────────────────────────────────────────────
ipcMain.handle('db:events:list',            (_e, p: { start: number; end: number }) => listEvents(p.start, p.end))
ipcMain.handle('db:events:create',          (_e, data) => { const r = createEvent(data);     broadcastRefresh(); return r })
ipcMain.handle('db:events:update',          (_e, data) => { const r = updateEvent(data);     broadcastRefresh(); return r })
ipcMain.handle('db:events:move',            (_e, { id, start_at, end_at }: { id: string; start_at: number; end_at: number }) => { const r = updateEventMove(id, start_at, end_at); broadcastRefresh(); return r })
ipcMain.handle('db:events:update-instance', (_e, data) => { updateEventInstance(data);       broadcastRefresh(); return null })
ipcMain.handle('db:events:delete',          (_e, { id }: { id: string }) => { deleteEvent(id);            broadcastRefresh(); return null })
ipcMain.handle('db:events:delete-instance', (_e, data) => { deleteEventInstance(data);       broadcastRefresh(); return null })

// ── IPC: Tasks ────────────────────────────────────────────────────────────
ipcMain.handle('db:tasks:list',                (_e, { end }: { end: number }) => listTasks(end))
ipcMain.handle('db:tasks:list-all-incomplete', () => listAllIncompleteTasks())
ipcMain.handle('db:tasks:list-all',            () => listAllTasks())
ipcMain.handle('db:tasks:create',              (_e, data) => { const r = createTask(data);              broadcastRefresh(); return r })
ipcMain.handle('db:tasks:update',              (_e, data) => { const r = updateTask(data);              broadcastRefresh(); return r })
ipcMain.handle('db:tasks:toggle',              (_e, { id }: { id: string }) => { const r = toggleTask(id);             broadcastRefresh(); return r })
ipcMain.handle('db:tasks:snooze',              (_e, { id, due_at }: { id: string; due_at: number | null }) => { const r = snoozeTask(id, due_at); broadcastRefresh(); return r })
ipcMain.handle('db:tasks:delete',              (_e, { id }: { id: string }) => { deleteTask(id);                       broadcastRefresh(); return null })

// ── IPC: Search ───────────────────────────────────────────────────────────
ipcMain.handle('db:search', (_e, { query }: { query: string }) => searchAll(query))

// ── IPC: Projects ─────────────────────────────────────────────────────────
ipcMain.handle('db:projects:list', () => listProjects())

// ── IPC: Workload ─────────────────────────────────────────────────────────
ipcMain.handle('workload:get', () => computeWorkload(Date.now()))

// ── Reminder scheduler ────────────────────────────────────────────────────
const REMINDER_HOURS = [9, 13]
let reminderTimer: ReturnType<typeof setTimeout> | null = null

function showReminder(): void {
  if (!Notification.isSupported()) return
  const w = computeWorkload(Date.now())
  const hour = new Date().getHours()
  const title = hour < 12 ? 'Morning Briefing' : 'Midday Check-in'

  const n = new Notification({ title, body: buildReminderBody(w) })
  n.on('click', () => { openDashboard() })
  n.show()
}

// ── Per-event "starting soon" reminders ───────────────────────────────────
// Map of fire-time key -> timer. Rebuilt whenever data changes.
const eventReminderTimers = new Map<string, ReturnType<typeof setTimeout>>()

function clearEventReminders(): void {
  for (const t of eventReminderTimers.values()) clearTimeout(t)
  eventReminderTimers.clear()
}

function fmtClock(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function scheduleEventReminders(): void {
  clearEventReminders()
  const now = Date.now()
  const horizon = now + 24 * 60 * 60 * 1000   // look ahead 24h (covers recurring instances)

  // listEvents expands recurring instances; instance ids look like "orig__ts"
  for (const ev of listEvents(now, horizon)) {
    if (ev.reminder_minutes == null || ev.reminder_minutes < 0) continue
    const fireAt = ev.start_at - ev.reminder_minutes * 60000
    if (fireAt <= now || fireAt > horizon) continue

    const key = `${ev.id}@${fireAt}`
    const delay = fireAt - now
    const timer = setTimeout(() => {
      if (!Notification.isSupported()) return
      const mins = ev.reminder_minutes!
      const when = mins === 0 ? 'now' : `in ${mins} min`
      const body = `${fmtClock(ev.start_at)}–${fmtClock(ev.end_at)}${ev.location ? ` · ${ev.location}` : ''}`
      const n = new Notification({ title: `${ev.title} starts ${when}`, body })
      n.on('click', () => { mainWindow?.show(); mainWindow?.webContents.send('navigate-to-date', { ts: ev.start_at }) })
      n.show()
      eventReminderTimers.delete(key)
    }, delay)
    eventReminderTimers.set(key, timer)
  }
}

function scheduleNextReminder(): void {
  if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null }
  if (!loadSettings().reminderEnabled) return

  const now = new Date()
  let next: Date | null = null
  for (const h of REMINDER_HOURS) {
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0, 0, 0)
    if (t.getTime() > now.getTime()) { next = t; break }
  }
  if (!next) {
    // all of today's reminders passed → first one tomorrow
    next = new Date(now)
    next.setDate(next.getDate() + 1)
    next.setHours(REMINDER_HOURS[0], 0, 0, 0)
  }

  const delay = next.getTime() - now.getTime()
  reminderTimer = setTimeout(() => {
    showReminder()
    scheduleNextReminder()
  }, delay)
}

// ── LightNote launcher ────────────────────────────────────────────────────
// Launches the LightNote app from AppLab as a separate detached process.
const LIGHTNOTE_DIR = join(
  'C:', 'Users', 'admin', 'Desktop', 'AI_Based_Projects', '9_AppLab', 'apps', 'lightnote'
)

ipcMain.on('lightnote:launch', () => {
  const child = spawn('npm', ['start'], {
    cwd: LIGHTNOTE_DIR,
    detached: true,
    stdio: 'ignore',
    shell: true
  })
  child.unref()
})

// ── IPC: App settings ─────────────────────────────────────────────────────
ipcMain.handle('app:get-login-item', () => app.getLoginItemSettings().openAtLogin)
ipcMain.handle('app:set-login-item', (_e, { value }: { value: boolean }) => {
  app.setLoginItemSettings({ openAtLogin: value })
  tray?.setContextMenu(buildTrayMenu())
})

// ── App lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Windows: required for Notification title/grouping to show app name
  app.setAppUserModelId('com.gcjang.daily-sidebar-planner')
  initDb()
  createWindow()
  createTray()
  scheduleNextReminder()
  scheduleEventReminders()
  // Re-scan event reminders every 15 min so instances beyond the 24h horizon
  // (and the next day's recurring ones) get picked up.
  setInterval(scheduleEventReminders, 15 * 60 * 1000)
})
app.on('window-all-closed', () => { /* keep alive in tray */ })
app.on('second-instance',   () => mainWindow?.show())
app.on('before-quit',       () => {
  if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null }
  clearEventReminders()
  tray?.destroy(); tray = null
})
