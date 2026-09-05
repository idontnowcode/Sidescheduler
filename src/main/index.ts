import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, Display, Notification, safeStorage, dialog, globalShortcut, shell, clipboard } from 'electron'
import { join, resolve } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { computeWorkload, buildReminderBody } from './workload'
import { eventsToIcs, icsToEvents } from './ics'

// LightNote IPC handlers — CJS module, copied to out/main/lightnote/ by the copyLightnoteCjs plugin
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { registerIpcHandlers: registerLightNoteIpc } = require('./lightnote/ipc-handlers')
// Shared link store (same singleton ipc-handlers.js init()s) — used to purge orphan
// page links when an event/task is deleted in the planner.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const linkStorage = require('./lightnote/link-storage')
// Same singleton ipc-handlers.js init()s with the data root — used to resolve
// a page's notebook/section from just its id when opening a deep link.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const noteStorage = require('./lightnote/note-storage')
import {
  initDb,
  listEvents, createEvent, updateEvent, updateEventMove, updateEventInstance, deleteEvent, deleteEventInstance,
  listTasks, listAllIncompleteTasks, listAllTasks, createTask, updateTask, toggleTask, snoozeTask, deleteTask,
  rolloverOverdueTasks, addActualMinutes, getInsights,
  listHabits, createHabit, deleteHabit, toggleHabitCheckin,
  listProjects,
  listFocusAreas, createFocusArea, updateFocusArea, deleteFocusArea,
  getEventById, getTaskById,
  listNotesByItem, listAllNotes, getNoteById, createNote, updateNote, deleteNote, linkNoteToItem, unlinkNoteFromItem,
  searchAll
} from './db/storage'
import { loadSettings, saveSettings, WindowSettings } from './settings'

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0) }

// Custom URL scheme so each note has a clickable deep link
// (lightnote://page/<pageId>) that can be pasted into Explorer, Word, etc.
// Clicking it launches the app and opens that note.
const DEEP_LINK_SCHEME = 'lightnote'
if (process.defaultApp) {
  // Dev: electron.exe needs the script path as an argument to round-trip the URL
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, process.execPath, [resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME)
}

/** Extract a pageId from a lightnote:// URL. Accepts page/<id> or bare <id>. */
function parseDeepLink(url: string): string | null {
  if (!url || !url.toLowerCase().startsWith(`${DEEP_LINK_SCHEME}://`)) return null
  const rest = url.slice(`${DEEP_LINK_SCHEME}://`.length).replace(/\/+$/, '')
  const m = rest.match(/^(?:page\/)?([^/?#]+)/i)
  return m ? decodeURIComponent(m[1]) : null
}

/** Find a lightnote:// URL among process args (Windows passes it via argv). */
function deepLinkFromArgv(argv: string[]): string | null {
  return argv.find((a) => a.toLowerCase().startsWith(`${DEEP_LINK_SCHEME}://`)) || null
}

let mainWindow: BrowserWindow | null = null
let dashboardWindow: BrowserWindow | null = null
let paletteWindow: BrowserWindow | null = null
let editorWindow: BrowserWindow | null = null
let noteEditorWindow: BrowserWindow | null = null
let lightNoteWindow: BrowserWindow | null = null
let pendingLightnoteOpenPage: { pageId: string; notebookId: string; sectionId: string } | null = null
let paletteRequester: 'sidebar' | 'dashboard' = 'sidebar'
let pendingEditorPayload: unknown = null
let pendingNoteEditorPayload: unknown = null
let tray: Tray | null = null
let windowExpanded = false

// ── Layout constants ──────────────────────────────────────────────────────
const EXPANDED_HEIGHT = 580   // height when panel is open
const PANEL_W         = 300

/** Collapsed sidebar height. The renderer measures its actual content height and
 *  reports it via 'sidebar:set-height'; until then a width-based fallback is used. */
let measuredSidebarH: number | null = null
function sidebarHeight(width: number): number {
  if (measuredSidebarH && measuredSidebarH > 0) return measuredSidebarH
  return width === 32 ? 264 : width === 52 ? 324 : 300  // fallback before first measurement
}

// ── Display / bounds ──────────────────────────────────────────────────────
function getDisplayForSettings(s: WindowSettings): Display {
  if (s.displayId != null) {
    const d = screen.getAllDisplays().find(d => d.id === s.displayId)
    if (d) return d
  }
  return screen.getPrimaryDisplay()
}

// The collapsed strip must never move when the panel opens — so instead of
// re-centering the taller expanded window (which made a bottom-docked sidebar
// jump to the middle), we keep the strip pinned and open the panel toward
// whichever side has room. `anchor` tells the renderer which end the strip
// sits on (top → panel opens downward, bottom → panel opens upward).
let sidebarAnchor: 'top' | 'bottom' = 'top'

function calcBounds(expanded: boolean): { x: number; y: number; width: number; height: number; anchor: 'top' | 'bottom' } {
  const s = loadSettings()
  const display = getDisplayForSettings(s)
  const wa = display.workArea
  const sidebarW = s.width
  const sH = sidebarHeight(sidebarW)

  // Where the collapsed strip sits (its top, in screen coords).
  const defaultY = wa.y + Math.max(0, Math.floor((wa.height - sH) / 2))
  const baseY = s.customY != null ? wa.y + s.customY : defaultY
  const stripTop = Math.max(wa.y, Math.min(wa.y + wa.height - sH, baseY))

  if (!expanded) {
    const x = s.edge === 'right' ? wa.x + wa.width - sidebarW : wa.x
    return { x, y: stripTop, width: sidebarW, height: sH, anchor: 'top' }
  }

  const totalW = sidebarW + PANEL_W
  const x = s.edge === 'right' ? wa.x + wa.width - totalW : wa.x
  const h = Math.min(EXPANDED_HEIGHT, wa.height)
  const roomBelow = (wa.y + wa.height) - stripTop   // from strip top downward
  const roomAbove = (stripTop + sH) - wa.y          // from strip bottom upward

  let y: number, anchor: 'top' | 'bottom', height: number
  if (roomBelow >= h) { anchor = 'top'; y = stripTop; height = h }
  else if (roomAbove >= h) { anchor = 'bottom'; y = (stripTop + sH) - h; height = h }
  else if (roomBelow >= roomAbove) { anchor = 'top'; y = stripTop; height = roomBelow }
  else { anchor = 'bottom'; y = wa.y; height = roomAbove }

  // Strip screen position is identical in both states:
  //  anchor 'top'    → strip at window top    → screen y = y            = stripTop
  //  anchor 'bottom' → strip at window bottom → screen y = y+height-sH  = stripTop
  return { x, y, width: totalW, height, anchor }
}

function applyBounds() {
  if (!mainWindow) return
  const b = calcBounds(windowExpanded)
  sidebarAnchor = b.anchor
  mainWindow.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height })
  mainWindow.webContents.send('sidebar:anchor', b.anchor)
}

function applyMovable() {
  if (!mainWindow) return
  mainWindow.setMovable(!loadSettings().locked)
}

// "Peek mode": the sidebar can let clicks/scroll pass straight through to
// whatever is behind it. Ctrl+Shift+S toggles that pass-through on and off.
//
// The pass-through lock always starts OFF — even when peek mode is enabled the
// sidebar is clickable the moment the app launches, and the user opts into
// pass-through with the hotkey. Starting locked meant every launch began with a
// sidebar that silently ignored the mouse, which reads as the app being broken.
let sidebarInteractive = true
function applyMouseMode() {
  if (!mainWindow) return
  const peek = !!loadSettings().clickThrough
  if (peek && !sidebarInteractive) {
    mainWindow.setIgnoreMouseEvents(true) // fully click-through; no hover/expand until the hotkey
    mainWindow.webContents.send('sidebar:peek', { enabled: true, active: false })
  } else {
    mainWindow.setIgnoreMouseEvents(false)
    mainWindow.webContents.send('sidebar:peek', { enabled: peek, active: peek ? sidebarInteractive : false })
  }
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

  mainWindow.webContents.once('did-finish-load', () => applyMouseMode())
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
let pendingDashboardView: string | null = null
function openDashboard(view?: string): void {
  if (view) pendingDashboardView = view
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.focus()
    if (view) dashboardWindow.webContents.send('dashboard:set-view', view)
    return
  }
  dashboardWindow = new BrowserWindow({
    width: 960, height: 700, minWidth: 800, minHeight: 560,
    title: 'Daily Sidebar Planner — Calendar',
    icon: join(__dirname, '../../resources/icon.ico'),
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
    { label: 'Open Dashboard', click: () => openDashboard() },
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

/** Notify all data-bearing windows that something changed. */
function broadcastRefresh(): void {
  mainWindow?.webContents.send('palette:refresh')
  dashboardWindow?.webContents.send('palette:refresh')
  editorWindow?.webContents.send('palette:refresh')
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
// Renderer reports its measured strip height so the collapsed sidebar window
// resizes to fit its content exactly (icons, timer, etc.) — no clipping.
ipcMain.on('sidebar:set-height', (_e, h: number) => {
  const r = Math.round(h)
  if (r > 0 && r !== measuredSidebarH) {
    measuredSidebarH = r
    if (mainWindow && !windowExpanded) applyBounds()
  }
})
ipcMain.on('window:open-dashboard', () => openDashboard())
ipcMain.on('window:open-dashboard-view', (_e, view: string) => openDashboard(view))
ipcMain.handle('dashboard:consume-pending-view', () => { const v = pendingDashboardView; pendingDashboardView = null; return v })
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
  // Close on blur — but NOT when focus moved to the note-editor child window
  // (opening a note from the editor must not dismiss the editor underneath it).
  editorWindow.on('blur', () => {
    setTimeout(() => {
      if (noteEditorWindow && !noteEditorWindow.isDestroyed() && noteEditorWindow.isFocused()) return
      if (editorWindow && !editorWindow.isDestroyed() && editorWindow.isFocused()) return
      closeEditorWindow()
    }, 120)
  })
  editorWindow.webContents.on('console-message', (_e, _level, message) => {
    console.log(`[editor-renderer] ${message}`)
  })
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

// ── Note Editor window (note create/edit overlay) ─────────────────────────
const NOTE_EDITOR_W = 480
const NOTE_EDITOR_H = 640

function calcNoteEditorBounds() {
  const display = getDisplayForSettings(loadSettings())
  const wa = display.workArea
  return {
    x: wa.x + Math.max(0, Math.floor((wa.width  - NOTE_EDITOR_W) / 2)),
    y: wa.y + Math.max(0, Math.floor((wa.height - NOTE_EDITOR_H) / 4)),
    width: NOTE_EDITOR_W, height: NOTE_EDITOR_H
  }
}

function openNoteEditorWindow(payload: unknown): void {
  pendingNoteEditorPayload = payload

  if (noteEditorWindow && !noteEditorWindow.isDestroyed()) {
    noteEditorWindow.setBounds(calcNoteEditorBounds())
    noteEditorWindow.webContents.send('note-editor:payload', payload)
    noteEditorWindow.show()
    noteEditorWindow.focus()
    return
  }

  noteEditorWindow = new BrowserWindow({
    ...calcNoteEditorBounds(),
    frame: false, transparent: true,
    alwaysOnTop: true, skipTaskbar: true,
    resizable: false, hasShadow: false, focusable: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  })
  noteEditorWindow.setAlwaysOnTop(true, 'screen-saver')

  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    noteEditorWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#note')
  } else {
    noteEditorWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'note' })
  }

  noteEditorWindow.once('ready-to-show', () => {
    if (!noteEditorWindow || noteEditorWindow.isDestroyed()) return
    noteEditorWindow.setBounds(calcNoteEditorBounds())
    noteEditorWindow.show()
    noteEditorWindow.focus()
  })
  noteEditorWindow.webContents.on('console-message', (_e, _level, message) => {
    console.log(`[note-renderer] ${message}`)
  })
  // Note editor stays open on blur (unlike event/task editor) — user needs time to write
  noteEditorWindow.on('closed', () => { noteEditorWindow = null })
}

function closeNoteEditorWindow(): void {
  if (noteEditorWindow && !noteEditorWindow.isDestroyed()) noteEditorWindow.close()
  noteEditorWindow = null
}

ipcMain.on('note-editor:open', (_e, payload: unknown) => openNoteEditorWindow(payload))
ipcMain.on('note-editor:close', () => closeNoteEditorWindow())
ipcMain.handle('note-editor:get-pending', () => pendingNoteEditorPayload)
ipcMain.on('note-editor:saved', () => { broadcastRefresh() })

// ── Quick-capture window (global hotkey) ────────────────────────────────────
let captureWindow: BrowserWindow | null = null
function openCaptureWindow(): void {
  if (captureWindow && !captureWindow.isDestroyed()) { captureWindow.show(); captureWindow.focus(); return }
  const { workArea } = screen.getPrimaryDisplay()
  const W = 560, H = 140
  captureWindow = new BrowserWindow({
    x: workArea.x + Math.floor((workArea.width - W) / 2),
    y: workArea.y + Math.floor(workArea.height * 0.22),
    width: W, height: H,
    frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true,
    resizable: false, hasShadow: false, show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  })
  captureWindow.setAlwaysOnTop(true, 'screen-saver')
  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    captureWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#capture')
  } else {
    captureWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'capture' })
  }
  captureWindow.once('ready-to-show', () => { captureWindow?.show(); captureWindow?.focus() })
  // Dismiss on blur in normal use; keep open under E2E (no real OS focus there).
  captureWindow.on('blur', () => { if (!process.env.DSP_TEST_DATA_DIR) closeCaptureWindow() })
  captureWindow.on('closed', () => { captureWindow = null })
}
function closeCaptureWindow(): void {
  if (captureWindow && !captureWindow.isDestroyed()) captureWindow.close()
  captureWindow = null
}
ipcMain.on('capture:open', openCaptureWindow)
ipcMain.on('capture:close', closeCaptureWindow)

// ── IPC: Notes ────────────────────────────────────────────────────────────
ipcMain.handle('db:notes:by-item', (_e, { kind, itemId }: { kind: 'event' | 'task'; itemId: string }) => listNotesByItem(kind, itemId))
ipcMain.handle('db:notes:all',     () => listAllNotes())
ipcMain.handle('db:notes:get',     (_e, { id }: { id: string }) => getNoteById(id))
ipcMain.handle('db:notes:create',  (_e, data) => { const r = createNote(data); broadcastRefresh(); return r })
ipcMain.handle('db:notes:update',  (_e, data) => { const r = updateNote(data); broadcastRefresh(); return r })
ipcMain.handle('db:notes:delete',  (_e, { id }: { id: string }) => { deleteNote(id); broadcastRefresh(); return null })
ipcMain.handle('db:notes:link',    (_e, { noteId, kind, itemId }: { noteId: string; kind: 'event' | 'task'; itemId: string }) => { const r = linkNoteToItem(noteId, kind, itemId); broadcastRefresh(); return r })
ipcMain.handle('db:notes:unlink',  (_e, { noteId, kind, itemId }: { noteId: string; kind: 'event' | 'task'; itemId: string }) => { unlinkNoteFromItem(noteId, kind, itemId); broadcastRefresh(); return null })

ipcMain.handle('db:events:get', (_e, { id }: { id: string }) => getEventById(id) ?? null)
ipcMain.handle('db:tasks:get',  (_e, { id }: { id: string }) => getTaskById(id)  ?? null)

// ── IPC: Window settings + displays ───────────────────────────────────────
ipcMain.handle('settings:get', () => loadSettings())
ipcMain.handle('settings:set', (_e, patch: Partial<WindowSettings>) => {
  const next = saveSettings(patch)
  // 모드를 껐다 켜도 잠금이 아니라 '선택 가능'에서 다시 시작한다.
  if ('clickThrough' in patch) sidebarInteractive = true
  applyBounds()
  applyMovable()
  applyMouseMode()
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
ipcMain.handle('db:events:delete',          (_e, { id }: { id: string }) => { deleteEvent(id); linkStorage.removeItemLinks('event', id); broadcastRefresh(); return null })
ipcMain.handle('db:events:delete-instance', (_e, data: { originalId: string; instanceDate: number; mode: 'only' | 'future' | 'all' }) => { deleteEventInstance(data); if (data.mode === 'all') linkStorage.removeItemLinks('event', data.originalId); broadcastRefresh(); return null })

// ── IPC: Tasks ────────────────────────────────────────────────────────────
ipcMain.handle('db:tasks:list',                (_e, { end }: { end: number }) => listTasks(end))
ipcMain.handle('db:tasks:list-all-incomplete', () => listAllIncompleteTasks())
ipcMain.handle('db:tasks:list-all',            () => listAllTasks())
ipcMain.handle('db:tasks:create',              (_e, data) => { const r = createTask(data);              broadcastRefresh(); return r })
ipcMain.handle('db:tasks:update',              (_e, data) => { const r = updateTask(data);              broadcastRefresh(); return r })
ipcMain.handle('db:tasks:toggle',              (_e, { id }: { id: string }) => { const r = toggleTask(id);             broadcastRefresh(); return r })
ipcMain.handle('db:tasks:snooze',              (_e, { id, due_at }: { id: string; due_at: number | null }) => { const r = snoozeTask(id, due_at); broadcastRefresh(); return r })
ipcMain.handle('db:tasks:delete',              (_e, { id }: { id: string }) => { deleteTask(id); linkStorage.removeItemLinks('task', id); broadcastRefresh(); return null })
ipcMain.handle('db:tasks:rollover',            () => { const n = rolloverOverdueTasks(); if (n > 0) broadcastRefresh(); return n })
ipcMain.handle('db:tasks:add-actual',          (_e, { id, minutes }: { id: string; minutes: number }) => { const r = addActualMinutes(id, minutes); broadcastRefresh(); return r })
ipcMain.handle('db:insights:get',              (_e, { days }: { days?: number } = {}) => getInsights(days))

// ── IPC: Habits ───────────────────────────────────────────────────────────
ipcMain.handle('db:habits:list',   () => listHabits())
ipcMain.handle('db:habits:create', (_e, data: { title: string; color?: string }) => { const r = createHabit(data); broadcastRefresh(); return r })
ipcMain.handle('db:habits:delete', (_e, { id }: { id: string }) => { deleteHabit(id); broadcastRefresh(); return null })
ipcMain.handle('db:habits:toggle', (_e, { id, dayTs }: { id: string; dayTs?: number }) => { const r = toggleHabitCheckin(id, dayTs); broadcastRefresh(); return r })

// ── IPC: ICS import/export ──────────────────────────────────────────────────
const ICS_WINDOW_MS = 365 * 24 * 3600 * 1000 * 2
ipcMain.handle('ics:export-string', () => eventsToIcs(listEvents(Date.now() - ICS_WINDOW_MS, Date.now() + ICS_WINDOW_MS)))
ipcMain.handle('ics:import-string', (_e, { text }: { text: string }) => {
  const parsed = icsToEvents(text)
  for (const ev of parsed) createEvent(ev)
  if (parsed.length) broadcastRefresh()
  return parsed.length
})
ipcMain.handle('ics:export-file', async () => {
  const res = await dialog.showSaveDialog({ title: 'Export calendar (.ics)', defaultPath: 'daily-sidebar-planner.ics', filters: [{ name: 'iCalendar', extensions: ['ics'] }] })
  if (res.canceled || !res.filePath) return { saved: false, count: 0 }
  const all = listEvents(Date.now() - ICS_WINDOW_MS, Date.now() + ICS_WINDOW_MS)
  writeFileSync(res.filePath, eventsToIcs(all), 'utf-8')
  return { saved: true, count: all.length, path: res.filePath }
})
ipcMain.handle('ics:import-file', async () => {
  const res = await dialog.showOpenDialog({ title: 'Import calendar (.ics)', properties: ['openFile'], filters: [{ name: 'iCalendar', extensions: ['ics'] }] })
  if (res.canceled || !res.filePaths[0]) return { imported: 0 }
  const parsed = icsToEvents(readFileSync(res.filePaths[0], 'utf-8'))
  for (const ev of parsed) createEvent(ev)
  if (parsed.length) broadcastRefresh()
  return { imported: parsed.length }
})

// ── IPC: Search ───────────────────────────────────────────────────────────
ipcMain.handle('db:search', (_e, { query }: { query: string }) => searchAll(query))

// ── IPC: Projects ─────────────────────────────────────────────────────────
ipcMain.handle('db:projects:list', () => listProjects())

// ── IPC: Focus Areas ──────────────────────────────────────────────────────
ipcMain.handle('db:focus-areas:list',   () => listFocusAreas())
ipcMain.handle('db:focus-areas:create', (_e, data) => createFocusArea(data))
ipcMain.handle('db:focus-areas:update', (_e, data) => updateFocusArea(data))
ipcMain.handle('db:focus-areas:delete', (_e, { id }: { id: string }) => { deleteFocusArea(id); broadcastRefresh(); return null })

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

// ── LightNote embedded window ─────────────────────────────────────────────
// LightNote runs inside DSP's own Electron process — no external launcher.
// Renderer = React app via out/renderer/index.html#lightnote; preload = out/preload/lightnote.js.
// (The legacy vanilla-JS UI under resources/lightnote/ is unused.)

function openLightNoteWindow(): void {
  if (lightNoteWindow && !lightNoteWindow.isDestroyed()) {
    lightNoteWindow.show()
    lightNoteWindow.focus()
    return
  }

  lightNoteWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'LightNote',
    icon: join(__dirname, '../../resources/icon.ico'),
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/lightnote.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  lightNoteWindow.setMenuBarVisibility(false)
  lightNoteWindow.once('ready-to-show', () => lightNoteWindow?.show())
  lightNoteWindow.on('closed', () => { lightNoteWindow = null })

  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    lightNoteWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#lightnote')
  } else {
    lightNoteWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'lightnote' })
  }
}

ipcMain.on('lightnote:launch', openLightNoteWindow)

function openLightNoteToPage(target: { pageId: string; notebookId: string; sectionId: string }): void {
  // Stash the target so a freshly-created LightNote window can PULL it on mount —
  // a one-shot send can race the renderer registering its listener and get lost.
  pendingLightnoteOpenPage = target
  openLightNoteWindow()
  // Also push for an already-open window (its listener is live).
  const send = () => lightNoteWindow?.webContents.send('lightnote:open-page', target)
  if (lightNoteWindow?.webContents.isLoading()) {
    lightNoteWindow.webContents.once('did-finish-load', send)
  } else {
    setTimeout(send, 100)
  }
}

ipcMain.on('lightnote:open-page', (_e, target) => openLightNoteToPage(target))

// Resolve a deep link's pageId to its notebook/section, then open it.
async function openLightNotePageById(pageId: string): Promise<boolean> {
  try {
    const loc = await noteStorage.findPageLocation(pageId)
    if (!loc) return false
    openLightNoteToPage({ pageId: loc.pageId, notebookId: loc.notebookId, sectionId: loc.sectionId })
    return true
  } catch { return false }
}

/** Handle a lightnote:// deep link from argv / open-url. */
async function handleDeepLink(url: string | null): Promise<void> {
  if (!url) return
  const pageId = parseDeepLink(url)
  if (pageId) await openLightNotePageById(pageId)
}

// Build the canonical deep link for a page and copy it to the clipboard.
ipcMain.handle('lightnote:copy-page-link', (_e, { pageId }) => {
  const url = `${DEEP_LINK_SCHEME}://page/${pageId}`
  clipboard.writeText(url)
  return url
})

// Renderer pulls (and clears) the pending open-page target once mounted.
ipcMain.handle('lightnote:consume-pending-open', () => {
  const p = pendingLightnoteOpenPage
  pendingLightnoteOpenPage = null
  return p
})

ipcMain.handle('lightnote:links:items-for-page', (_e, { pageId }) => {
  const links = linkStorage.getLinksByPage(pageId)
  if (!links) return { events: [], tasks: [] }
  return {
    events: (links.linkedEvents as string[])
      .map((id: string) => getEventById(id))
      .filter(Boolean)
      .map((e: ReturnType<typeof getEventById>) => ({ id: e!.id, title: e!.title, start_at: e!.start_at, end_at: e!.end_at })),
    tasks: (links.linkedTasks as string[])
      .map((id: string) => getTaskById(id))
      .filter(Boolean)
      .map((t: ReturnType<typeof getTaskById>) => ({ id: t!.id, title: t!.title, done: t!.done, due_at: t!.due_at }))
  }
})

// ── IPC: App settings ─────────────────────────────────────────────────────
ipcMain.handle('app:get-login-item', () => app.getLoginItemSettings().openAtLogin)
ipcMain.handle('app:set-login-item', (_e, { value }: { value: boolean }) => {
  app.setLoginItemSettings({ openAtLogin: value })
  tray?.setContextMenu(buildTrayMenu())
})

// ── AI scheduler context (passed into LightNote so its AI is calendar-aware) ─
function buildScheduleDigest(): string {
  const now = Date.now()
  const DAY = 86400000
  const evs = listEvents(now, now + 7 * DAY).slice(0, 20)
  const tasks = listAllIncompleteTasks().slice(0, 20)
  const dt = (ts: number) => new Date(ts).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const d = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const lines: string[] = [`Now: ${new Date(now).toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`]
  if (evs.length) {
    lines.push('Upcoming events (next 7 days):')
    for (const e of evs) lines.push(`- ${e.title} @ ${dt(e.start_at)}${e.location ? ` @ ${e.location}` : ''}`)
  }
  if (tasks.length) {
    lines.push('Open tasks:')
    for (const t of tasks) lines.push(`- ${t.title}${t.due_at ? ` (due ${d(t.due_at)})` : ''} [${t.priority}]`)
  }
  return lines.join('\n')
}
function pageLinkContext(pageId: string): string {
  const links = linkStorage.getLinksByPage(pageId)
  if (!links) return ''
  const parts: string[] = []
  for (const id of (links.linkedEvents as string[])) { const e = getEventById(id); if (e) parts.push(`event "${e.title}" on ${new Date(e.start_at).toLocaleString()}`) }
  for (const id of (links.linkedTasks as string[])) { const t = getTaskById(id); if (t) parts.push(`task "${t.title}"${t.due_at ? ` due ${new Date(t.due_at).toLocaleDateString()}` : ''}`) }
  return parts.length ? `(This note is linked to: ${parts.join('; ')}.)` : ''
}

// ── App lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Test isolation: when DSP_TEST_DATA_DIR is set, redirect ALL on-disk state
  // (planner.json under userData + lightnote data under appData) into a temp dir
  // so E2E runs never touch real user data. No-op in production.
  if (process.env.DSP_TEST_DATA_DIR) {
    const dir = process.env.DSP_TEST_DATA_DIR
    try { app.setPath('appData', dir) } catch { /* ignore */ }
    try { app.setPath('userData', join(dir, 'userData')) } catch { /* ignore */ }
  }
  // Windows: required for Notification title/grouping to show app name
  app.setAppUserModelId('com.gcjang.daily-sidebar-planner')

  // Block any in-app navigation to external URLs. Without this, an <a href>
  // click in the renderer loads the URL on top of the React app (the user's
  // "DSP 화면이 나옴" bug). Route http/https/mailto/tel to the system browser
  // via shell.openExternal and let our own file:// / localhost dev assets
  // navigate normally.
  const EXTERNAL_RE = /^(https?:|mailto:|tel:)/i
  const isInternal = (url: string) =>
    url.startsWith('file://') || url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-navigate', (ev, url) => {
      if (isInternal(url)) return
      if (EXTERNAL_RE.test(url)) {
        ev.preventDefault()
        shell.openExternal(url).catch(() => { /* ignore */ })
      } else {
        ev.preventDefault()
      }
    })
    contents.setWindowOpenHandler(({ url }) => {
      if (EXTERNAL_RE.test(url) && !isInternal(url)) {
        shell.openExternal(url).catch(() => { /* ignore */ })
      }
      return { action: 'deny' }
    })
  })

  initDb()
  registerLightNoteIpc(ipcMain, () => lightNoteWindow, safeStorage, dialog, app, {
    scheduleDigest: buildScheduleDigest,
    pageLinks: pageLinkContext,
    createTask: (data: Parameters<typeof createTask>[0]) => createTask(data),
    createEvent: (data: Parameters<typeof createEvent>[0]) => createEvent(data),
    refresh: () => broadcastRefresh(),
    // For LightNote work-object calendar sync: complete a linked task (idempotent
    // — only toggles when not already done), and read a task's current state.
    completeTask: (id: string) => {
      const t = getTaskById(id)
      if (t && !t.done) { toggleTask(id); broadcastRefresh() }
      const u = getTaskById(id)
      return u ? { id: u.id, done: !!u.done } : null
    },
    getTask: (id: string) => {
      const t = getTaskById(id)
      return t ? { id: t.id, title: t.title, due_at: t.due_at ?? null, done: !!t.done } : null
    },
    getItem: (kind: 'event' | 'task', id: string) => {
      if (kind === 'event') {
        const e = getEventById(id)
        return e ? { title: e.title, start_at: e.start_at, end_at: e.end_at, location: e.location ?? undefined } : null
      }
      const t = getTaskById(id)
      return t ? { title: t.title, due_at: t.due_at ?? undefined } : null
    }
  })
  createWindow()
  createTray()
  scheduleNextReminder()
  scheduleEventReminders()
  // Re-scan event reminders every 15 min so instances beyond the 24h horizon
  // (and the next day's recurring ones) get picked up.
  setInterval(scheduleEventReminders, 15 * 60 * 1000)
  // Global quick-capture hotkey: toggle a one-line natural-language capture box.
  try {
    globalShortcut.register('CommandOrControl+Shift+Space', () => {
      if (captureWindow && !captureWindow.isDestroyed()) closeCaptureWindow()
      else openCaptureWindow()
    })
  } catch { /* hotkey may be taken by another app */ }

  // Peek mode: toggle the sidebar between click-through and interactive.
  try {
    globalShortcut.register('CommandOrControl+Shift+S', () => {
      if (!loadSettings().clickThrough) return // only meaningful when peek mode is on
      sidebarInteractive = !sidebarInteractive
      applyMouseMode()
      if (sidebarInteractive) mainWindow?.show()
      else if (windowExpanded) { windowExpanded = false; applyBounds() } // collapse when leaving interactive
    })
  } catch { /* hotkey may be taken by another app */ }

  // If the app was cold-launched via a lightnote:// deep link, the URL is in argv.
  handleDeepLink(deepLinkFromArgv(process.argv))
})
app.on('window-all-closed', () => { /* keep alive in tray */ })
app.on('second-instance', (_e, argv) => {
  mainWindow?.show()
  // Windows/Linux deliver the deep link to the already-running instance here.
  handleDeepLink(deepLinkFromArgv(argv))
})
// macOS delivers the deep link via this event.
app.on('open-url', (e, url) => { e.preventDefault(); handleDeepLink(url) })
app.on('before-quit',       () => {
  if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null }
  clearEventReminders()
  tray?.destroy(); tray = null
})
app.on('will-quit', () => { globalShortcut.unregisterAll() })
