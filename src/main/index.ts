import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, Display, Notification, safeStorage, dialog, globalShortcut, shell, clipboard } from 'electron'
import { join, resolve } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync, watch } from 'fs'
import { computeWorkload, buildReminderBody } from './workload'
import { eventsToIcs, icsToEvents } from './ics'
import { readOutlookCalendar } from './outlook'

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
// 스티커 메모의 "메모" 노트북·새 메모 만들기. 같은 저장소를 쓴다.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const stickyStore = require('./lightnote/sticky')
import {
  initDb,
  listEvents, createEvent, syncExternalEvents, updateEvent, updateEventMove, updateEventInstance, deleteEvent, deleteEventInstance,
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
// "새 창에서 열기" 등으로 만든 추가 LightNote 창들. Electron은 참조를
// 안 들고 있으면 GC로 창이 사라지므로 배열로 붙잡아 둔다. 각 창에 전달할
// 시작 페이지는 pendingLightnoteOpenPage(단일 슬롯, 기본 창용)와 달리
// webContents id로 구분해서, 여러 창을 동시에 열어도 서로 안 섞인다.
const secondaryLightNoteWindows: BrowserWindow[] = []
const pendingOpenByWebContentsId = new Map<number, { pageId: string; notebookId: string; sectionId: string }>()
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
    // 사이드바는 안 쓰고 LightNote만 트레이/단축키로 쓰고 싶다는 피드백 —
    // 지난번에 숨겨뒀다면 이번 실행에도 자동으로 뜨지 않는다. 창 자체는
    // 그대로 만들어(로드는 하되) 숨겨서, 트레이에서 "사이드바 보이기"를
    // 누르면 다시 로드 없이 바로 뜬다.
    show: !loadSettings().sidebarHidden,
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
// "사이드바가 거슬리고 버튼도 안 쓴다, LightNote만 트레이/단축키로 쓰고
// 싶다"는 피드백 — 사이드바를 아예 꺼둘 수 있는 체크박스와, LightNote를
// 사이드바를 거치지 않고 바로 여는 항목을 추가한다. 사이드바를 숨겨도
// LightNote는 이미 독립된 창(openLightNoteWindow)이라 그대로 잘 열린다.
function setSidebarHidden(hidden: boolean): void {
  saveSettings({ sidebarHidden: hidden })
  if (hidden) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide()
  } else {
    showMainWindow()
  }
  tray?.setContextMenu(buildTrayMenu())
}

function buildTrayMenu() {
  const sidebarHidden = !!loadSettings().sidebarHidden
  return Menu.buildFromTemplate([
    { label: 'Daily Sidebar Planner', enabled: false },
    { type: 'separator' },
    { label: `📝 Open LightNote${hotkeyLabel(lightNoteHotkey)}`, click: () => openLightNoteWindow() },
    { label: `🗒 Action Items${hotkeyLabel(actionItemsHotkey)}`, click: () => toggleActionItemsWindow() },
    { label: `📓 기록장 열기${hotkeyLabel(journalHotkey)}`, click: () => openJournalCapture() },
    { label: `🟨 새 스티커 메모${hotkeyLabel(stickyHotkey)}`, click: () => { newSticky() } },
    { type: 'separator' },
    {
      label: 'Show Sidebar', type: 'checkbox', checked: !sidebarHidden,
      click: (item) => setSidebarHidden(!item.checked)
    },
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

// 실제로 등록에 성공한 단축키(없으면 null). 트레이 메뉴에 표시한다.
let lightNoteHotkey: string | null = null
let actionItemsHotkey: string | null = null
let journalHotkey: string | null = null
let stickyHotkey: string | null = null

// globalShortcut.register는 다른 앱이 이미 쓰고 있으면 예외를 던지는 게
// 아니라 false를 돌려준다 — try/catch로만 감싸두면 조용히 실패한다.
// 후보를 차례로 시도하고 실제로 잡힌 키를 돌려준다.
function registerFirstAvailable(candidates: string[], handler: () => void): string | null {
  for (const accel of candidates) {
    try {
      if (globalShortcut.register(accel, handler)) return accel
    } catch { /* 이 키는 못 쓴다 — 다음 후보로 */ }
  }
  return null
}

/** 트레이 메뉴에 붙일 사람이 읽는 형태: "  (Ctrl+Alt+L)" */
function hotkeyLabel(accel: string | null): string {
  if (!accel) return '  (단축키 없음 — 다른 앱이 선점)'
  return `  (${accel.replace('CommandOrControl', process.platform === 'darwin' ? 'Cmd' : 'Ctrl')})`
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
  tray.on('click', () => showMainWindow())
}

/** mainWindow may have been closed/destroyed by the user; recreate it if needed
 *  rather than calling a method on a destroyed BrowserWindow (throws). */
function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
  }
  mainWindow?.show()
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
  // Outlook 가져오기를 켜거나 끄면 주기 작업도 같이 맞춘다.
  if ('outlookEnabled' in patch) scheduleOutlookSync()
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

// ── IPC: Outlook 일정 가져오기 ────────────────────────────────────────────
// 켜 둔 Outlook에서 읽어 와 그 구간을 맞춘다. 되풀이해서 눌러도 쌓이지 않고,
// 저쪽에서 없어진 일정은 여기서도 빠진다(syncExternalEvents).
const OUTLOOK_SOURCE = 'outlook'

async function syncOutlook(): Promise<{
  ok: boolean; error?: string; message?: string
  added?: number; updated?: number; removed?: number; count?: number
}> {
  const s = loadSettings()
  const back = s.outlookDaysBack ?? 7
  const ahead = s.outlookDaysAhead ?? 60
  const r = await readOutlookCalendar(back, ahead)
  if (!r.ok) return { ok: false, error: r.error, message: r.message }

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
  const from = dayStart.getTime() - back * 86400000
  const to = dayStart.getTime() + ahead * 86400000
  const res = syncExternalEvents(OUTLOOK_SOURCE, from, to, r.events.map((e) => ({
    external_id: e.uid,
    title: e.subject || '(제목 없음)',
    start_at: e.start,
    end_at: e.end > e.start ? e.end : e.start + 1800000,
    location: e.location || null,
    description: e.body || null,
  })))
  saveSettings({ outlookLastSync: Date.now() })
  if (res.added || res.updated || res.removed) broadcastRefresh()
  return { ok: true, count: r.count, ...res }
}

ipcMain.handle('outlook:sync', () => syncOutlook())
ipcMain.handle('outlook:status', () => {
  const s = loadSettings()
  return {
    enabled: !!s.outlookEnabled,
    daysBack: s.outlookDaysBack ?? 7,
    daysAhead: s.outlookDaysAhead ?? 60,
    lastSync: s.outlookLastSync ?? null,
  }
})

// 켜 두면 주기적으로 맞춘다. Outlook이 꺼져 있으면 조용히 넘어간다 —
// 그때마다 알리면 성가시기만 하다.
let outlookTimer: ReturnType<typeof setInterval> | null = null
function scheduleOutlookSync(): void {
  if (outlookTimer) { clearInterval(outlookTimer); outlookTimer = null }
  if (!loadSettings().outlookEnabled) return
  syncOutlook().catch(() => { /* 꺼져 있으면 그만 */ })
  outlookTimer = setInterval(() => { syncOutlook().catch(() => {}) }, 15 * 60 * 1000)
}

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

// 제목 표시줄을 앱 헤더와 합친 창 설정. 높이는 헤더(--header-h)와 같아야
// 창 조작 단추가 헤더 줄에 정확히 얹힌다 — 어긋나면 단추만 따로 떠 보인다.
const LIGHTNOTE_HEADER_H = 44
// 창 조작 단추는 앱이 헤더 안에 직접 그린다(WindowControls.tsx). 운영체제
// 오버레이를 쓰면 단추 오른쪽에 아무것도 못 놓는다 — 테마의 귀퉁이 장식 자리.
const LIGHTNOTE_TITLEBAR = {
  titleBarStyle: 'hidden' as const,
}

ipcMain.on('lightnote:win', (e, act: string) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win || win.isDestroyed()) return
  if (act === 'minimize') win.minimize()
  else if (act === 'maximize') { if (win.isMaximized()) win.unmaximize(); else win.maximize() }
  else if (act === 'close') win.close()
})
ipcMain.handle('lightnote:win-is-max', (e) => !!BrowserWindow.fromWebContents(e.sender)?.isMaximized())

// 테마를 바꾸면 단추 색도 따라가야 한다(밝은 테마에 흰 단추는 안 보인다).
// 테마마다 머리말 높이가 다르다(가죽·고서재는 더 널찍하다). 높이를 안
// 넘기면 운영체제가 그리는 단추만 옛 높이에 남아 띠 밖으로 삐져나온다.
ipcMain.on('lightnote:titlebar-colors', (e, { color, symbolColor, height }:
  { color: string; symbolColor: string; height?: number }) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win || win.isDestroyed()) return
  const h = Number.isFinite(height) && height! >= 28 && height! <= 90
    ? Math.round(height!) : LIGHTNOTE_HEADER_H
  try {
    win.setTitleBarOverlay({ color, symbolColor, height: h })
  } catch { /* 이 플랫폼에 오버레이가 없으면 그냥 둔다 */ }
})

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
    icon: join(__dirname, '../../resources/lightnote.ico'),
    show: false,
    // 창 제목 표시줄을 앱 헤더와 합친다. 제목만 적힌 줄이 하나 더 있을
    // 이유가 없다 — 그 줄에 검색칸이 들어간다. 창 조작 단추는 운영체제가
    // 그려 주는 것을 그대로 쓴다(직접 만들면 호버·스냅 동작이 어긋난다).
    ...LIGHTNOTE_TITLEBAR,
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
  // 최대화 단추 모양(□ / ❐)을 창 상태에 맞춘다 — 두 번 눌러 키우기·스냅으로 바뀌어도 따라간다
  const sendWinState = () => lightNoteWindow?.webContents.send('lightnote:win-state', { maximized: !!lightNoteWindow?.isMaximized() })
  lightNoteWindow.on('maximize', sendWinState)
  lightNoteWindow.on('unmaximize', sendWinState)

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

// MS 오피스 앱들처럼 노트를 별도 창으로 열어서, 여러 노트를 나란히 띄워두고
// 편집할 수 있게 한다. 기본(단일) LightNote 창은 그대로 두고, 매번 완전히
// 새로운 창을 하나 더 만든다 — 탭·트리·목차·업무 패널 등 화면 안쪽은 전부
// 기존 LightnoteApp을 그대로 재사용하고(같은 #lightnote 렌더러), 이 창만의
// 시작 페이지만 별도로 넘긴다.
function openLightNoteInNewWindow(target?: { pageId: string; notebookId: string; sectionId: string }): void {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 960, minHeight: 600,
    title: 'LightNote', icon: join(__dirname, '../../resources/lightnote.ico'),
    show: false,
    ...LIGHTNOTE_TITLEBAR,
    webPreferences: {
      preload: join(__dirname, '../preload/lightnote.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  })
  secondaryLightNoteWindows.push(win)
  win.setMenuBarVisibility(false)
  win.once('ready-to-show', () => win.show())
  // Captured now, while webContents is still alive — reading win.webContents
  // INSIDE the 'closed' handler below can throw "Object has been destroyed"
  // (webContents may already be torn down by the time 'closed' fires).
  const webContentsId = win.webContents.id
  win.on('closed', () => {
    pendingOpenByWebContentsId.delete(webContentsId)
    const i = secondaryLightNoteWindows.indexOf(win)
    if (i >= 0) secondaryLightNoteWindows.splice(i, 1)
  })
  if (target) pendingOpenByWebContentsId.set(webContentsId, target)

  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#lightnote')
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'lightnote' })
  }
}

ipcMain.on('lightnote:open-new-window', (_e, target) => openLightNoteInNewWindow(target))

// Resolve a deep link's pageId to its notebook/section, then open it.
async function openLightNotePageById(pageId: string): Promise<boolean> {
  try {
    const loc = await noteStorage.findPageLocation(pageId)
    if (!loc) return false
    openLightNoteToPage({ pageId: loc.pageId, notebookId: loc.notebookId, sectionId: loc.sectionId })
    return true
  } catch { return false }
}

// ── Action Items popup ───────────────────────────────────────────────────
// 특정 단축키(Ctrl+Shift+A)로 화면 우측 상단에 여는 작은 창 — 모든 업무의
// 미완료 할일을 기한순으로 모아 보여준다. LightNote 전체를 열지 않고도
// "오늘 뭐부터 해야 하나"를 훑어볼 수 있게. 기본은 항상 위 고정(핀)이고,
// 창 안의 📌 버튼으로 끌 수 있다 — 다른 앱 작업 중에도 눈에 띄어야 쓸모가
// 있는 팝업이라 기본을 켜둔다.
let actionItemsWindow: BrowserWindow | null = null

function actionItemsBounds() {
  const { workArea } = screen.getPrimaryDisplay()
  const W = 360, H = 460, MARGIN = 12
  return { x: workArea.x + workArea.width - W - MARGIN, y: workArea.y + MARGIN, width: W, height: H }
}

// ── 기록장 빠른 입력 ──────────────────────────────────────────────────────
// 전역 단축키로 뜨는 한 줄 입력창. 채팅방에 적던 속도를 유지하려는 것이라,
// 화면 가운데 위쪽에 작게 띄우고 적자마자 오늘 날짜에 쌓는다.
let journalCaptureWindow: BrowserWindow | null = null

function openJournalCapture(): void {
  if (journalCaptureWindow && !journalCaptureWindow.isDestroyed()) {
    journalCaptureWindow.show()
    journalCaptureWindow.focus()
    return
  }
  const { workArea } = screen.getPrimaryDisplay()
  const saved = loadSettings().journalBounds
  const width = saved?.width ?? 400
  const height = saved?.height ?? 520
  journalCaptureWindow = new BrowserWindow({
    x: saved?.x ?? Math.round(workArea.x + workArea.width - width - 40),
    y: saved?.y ?? Math.round(workArea.y + 80),
    width, height, minWidth: 300, minHeight: 300,
    frame: false, transparent: true, resizable: true, hasShadow: true, show: false,
    // 띄워놓고 쓰는 창이라 작업표시줄에도 남겨, 가려지면 거기서 다시 부른다.
    skipTaskbar: false, title: '기록장',
    webPreferences: {
      preload: join(__dirname, '../preload/lightnote.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  })
  journalCaptureWindow.once('ready-to-show', () => journalCaptureWindow?.show())
  // 켜둔 상태와 위치·크기를 기억한다 — 앱을 다시 켜면 그대로 떠 있게.
  const remember = () => {
    if (!journalCaptureWindow || journalCaptureWindow.isDestroyed()) return
    const b = journalCaptureWindow.getBounds()
    saveSettings({ journalBounds: { x: b.x, y: b.y, width: b.width, height: b.height } })
  }
  journalCaptureWindow.on('moved', remember)
  journalCaptureWindow.on('resized', remember)
  journalCaptureWindow.on('closed', () => {
    journalCaptureWindow = null
    saveSettings({ journalOpen: false })
  })
  saveSettings({ journalOpen: true })

  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    journalCaptureWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#journalcapture')
  } else {
    journalCaptureWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'journalcapture' })
  }
}

// ── 공유 노트 폴더 (OneDrive 등) ─────────────────────────────────────────
// 노트를 로컬(%APPDATA%) 대신 동기화 폴더에서 읽고 쓴다. 회사 PC와 집 PC가
// 같은 노트를 보게 하려는 것. 경로는 PC마다 다르므로 PC별 설정이다.
//
// 폴더가 없거나 비어 있으면 **그냥 켜지 않는다.** 빈 데이터 루트로 열리면
// "노트가 전부 사라졌다"로 보이고, 그 상태로 적으면 유령 폴더에 쌓인다.

/** 실제로 쓰는 노트 폴더. 공유 폴더가 성하지 않으면 undefined(=로컬). */
let activeDataDir: string | undefined
/** 공유 폴더를 지정했는데 못 쓰는 상태일 때의 사유. 화면이 이걸 보고 막는다. */
let dataDirProblem: { path: string; reason: 'MISSING' | 'EMPTY' | 'BROKEN' } | null = null

function localDataDir(): string {
  return join(app.getPath('appData'), 'lightnote', 'lightnote-data')
}

function resolveDataDir(): void {
  activeDataDir = undefined
  dataDirProblem = null
  const want = (loadSettings().sharedDataDir || '').trim()
  if (!want) return
  if (!existsSync(want)) { dataDirProblem = { path: want, reason: 'MISSING' }; return }
  // notebooks.json이 없으면 아직 동기화 중이거나 엉뚱한 폴더다. 둘 다 위험해서
  // 그대로 열지 않는다 — 여기에 적으면 저쪽 노트와 갈라진다.
  const list = join(want, 'notebooks.json')
  if (!existsSync(list)) { dataDirProblem = { path: want, reason: 'EMPTY' }; return }
  // 있다고 끝이 아니다. 동기화가 반쯤 내려오면 파일이 깨진 채로 놓여 있는데,
  // 읽는 쪽이 조용히 []를 돌려줘 **노트가 전부 사라진 것처럼** 보인다.
  // 그 상태로 적으면 저쪽 노트와 갈라지므로, 읽히는지까지 보고 연다.
  try {
    if (!Array.isArray(JSON.parse(readFileSync(list, 'utf-8')))) throw new Error('not an array')
  } catch {
    dataDirProblem = { path: want, reason: 'BROKEN' }
    return
  }
  activeDataDir = want
}

/** 폴더 하나를 통째로 복사한다(덮어쓰지 않고 없는 것만). 마이그레이션용. */
function copyTree(src: string, dst: string, skip: (name: string) => boolean = () => false): number {
  let n = 0
  mkdirSync(dst, { recursive: true })
  for (const name of readdirSync(src)) {
    if (skip(name)) continue
    const s = join(src, name)
    const d = join(dst, name)
    if (statSync(s).isDirectory()) n += copyTree(s, d, skip)
    else if (!existsSync(d)) { copyFileSync(s, d); n++ }
  }
  return n
}

ipcMain.handle('lightnote:data-dir:status', () => ({
  configured: (loadSettings().sharedDataDir || '') || null,
  active: activeDataDir || localDataDir(),
  shared: !!activeDataDir,
  problem: dataDirProblem,
}))

/** 지금 노트 폴더를 고른 폴더로 **복사**하고, 그 폴더를 쓰도록 바꾼다.
 *  원본은 지우지 않는다 — 확인은 사용자가 직접 하고 직접 지운다. */
ipcMain.handle('lightnote:data-dir:migrate', async () => {
  const picked = await dialog.showOpenDialog({
    title: '공유 노트 폴더 고르기 (OneDrive 안 폴더를 권장)',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (picked.canceled || !picked.filePaths[0]) return { canceled: true }
  const dst = picked.filePaths[0]
  const src = activeDataDir || localDataDir()
  if (resolve(dst) === resolve(src)) return { error: 'SAME' }
  if (existsSync(join(dst, 'notebooks.json'))) return { error: 'NOT_EMPTY', path: dst }
  try {
    // versions/(페이지 기록)는 로컬에 남기므로 가져가지 않는다.
    const copied = copyTree(src, dst, (name) => name === 'versions')
    if (!existsSync(join(dst, 'notebooks.json'))) return { error: 'VERIFY_FAILED', path: dst }
    saveSettings({ sharedDataDir: dst })
    return { success: true, path: dst, copied }
  } catch (e) {
    return { error: 'COPY_FAILED', message: (e as Error).message }
  }
})

/** 이미 노트가 들어 있는 공유 폴더에 **연결만** 한다(복사하지 않는다).
 *  두 번째 PC가 쓰는 길이다 — 거긴 첫 PC가 올려둔 노트가 이미 있으므로
 *  migrate는 "비어 있지 않다"고 거절한다. */
ipcMain.handle('lightnote:data-dir:attach', async () => {
  const picked = await dialog.showOpenDialog({
    title: '이미 쓰던 공유 노트 폴더에 연결',
    properties: ['openDirectory'],
  })
  if (picked.canceled || !picked.filePaths[0]) return { canceled: true }
  const dir = picked.filePaths[0]
  // 노트 폴더가 맞는지 확인하고 붙인다. 엉뚱한 폴더에 붙이면 "노트가 전부
  // 사라졌다"로 보이고, 거기 적으면 저쪽과 갈라진다.
  if (!existsSync(join(dir, 'notebooks.json'))) return { error: 'NOT_A_NOTE_DIR', path: dir }
  saveSettings({ sharedDataDir: dir })
  return { success: true, path: dir }
})

/** 공유를 그만두고 로컬로 돌아간다(복사해 둔 파일은 그대로 남는다). */
ipcMain.handle('lightnote:data-dir:use-local', () => {
  saveSettings({ sharedDataDir: '' })
  return { success: true }
})

/** 설정을 바꾼 뒤에는 저장소를 다시 열어야 해서 앱을 다시 띄운다. */
ipcMain.handle('lightnote:data-dir:relaunch', () => {
  app.relaunch()
  app.exit(0)
})

// ── 노트 폴더 감시 ────────────────────────────────────────────────────────
// 저쪽 PC가 동기화로 파일을 바꿔도 지금은 아무도 알려주지 않는다. 폴더를
// 지켜보다가 열려 있는 페이지가 바뀌면 **창끼리 쓰던 그 알림을 그대로** 쏜다
// (렌더러에 이미 "다른 창에서 저장됨" 배너가 있다).
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const PAGE_RE = new RegExp(
  `notebooks[\\\\/](${UUID})[\\\\/]sections[\\\\/](${UUID})[\\\\/]pages[\\\\/](${UUID})\\.json$`, 'i')

/** 우리가 방금 쓴 판. 되돌아온 메아리를 "저쪽이 바꿨다"로 오해하지 않으려는 것.
 *
 *  "몇 초 안이면 내 것"처럼 시간으로 재지 않는다. 윈도우의 폴더 감시는 변경을
 *  모아서 늦게 주기도 해서, 창을 짧게 잡으면 제 저장이 새어 나오고 길게 잡으면
 *  그 직후 도착한 저쪽 변경을 놓친다. 대신 **우리가 쓴 시각 값 자체**를
 *  기억해 두고, 파일에 적힌 값과 같으면 내 것으로 본다. */
const selfWrites = new Map<string, number>()

function noteSelfWrite(pageId: string, updatedAt: number): void {
  selfWrites.set(pageId, updatedAt)
  if (selfWrites.size > 500) {
    // 오래된 것부터 흘려보낸다(삽입 순서대로 들어 있다).
    for (const k of selfWrites.keys()) {
      selfWrites.delete(k)
      if (selfWrites.size <= 400) break
    }
  }
}

/** 섹션 목록에서 그 페이지의 현재 시각만 싸게 읽는다(본문은 안 읽는다). */
function pageStampOnDisk(root: string, nb: string, sec: string, pageId: string): number | null {
  try {
    const rows = JSON.parse(readFileSync(join(root, 'notebooks', nb, 'sections', sec, 'pages.json'), 'utf-8'))
    const p = (rows || []).find((x: { id: string }) => x.id === pageId)
    return p && typeof p.updatedAt === 'number' ? p.updatedAt : null
  } catch {
    return null
  }
}

let dataWatcher: { close: () => void } | null = null
const watchDebounce = new Map<string, ReturnType<typeof setTimeout>>()

function startDataWatch(): void {
  const root = activeDataDir || localDataDir()
  try { dataWatcher?.close() } catch { /* ignore */ }
  dataWatcher = null
  // 폴더는 첫 저장 때 생긴다. 없다고 그냥 돌아가면 새 프로필에서는 그 세션
  // 내내 감시가 죽어 있다 — 미리 만들어 두고 건다.
  try { mkdirSync(root, { recursive: true }) } catch { /* 공유 폴더가 없으면 아래에서 포기 */ }
  if (!existsSync(root)) return
  try {
    dataWatcher = watch(root, { recursive: true }, (_evt, file) => {
      if (!file) return
      const rel = String(file)
      if (rel.endsWith('.tmp')) return
      const m = PAGE_RE.exec(rel)
      if (!m) return
      const [, notebookId, sectionId, pageId] = m
      // 동기화는 한 파일을 여러 번 톡톡 치기도 해서 잠깐 묶는다. 내 것인지는
      // 묶음이 끝난 뒤 파일에 적힌 값으로 한 번만 가린다.
      clearTimeout(watchDebounce.get(pageId))
      watchDebounce.set(pageId, setTimeout(() => {
        watchDebounce.delete(pageId)
        const onDisk = pageStampOnDisk(activeDataDir || localDataDir(), notebookId, sectionId, pageId)
        if (onDisk !== null && selfWrites.get(pageId) === onDisk) return   // 내가 쓴 그 판이다
        for (const win of BrowserWindow.getAllWindows()) {
          if (win.isDestroyed()) continue
          win.webContents.send('lightnote:page-changed', { notebookId, sectionId, pageId })
        }
      }, 600))
    })
  } catch (e) {
    console.error('data watch:', e)   // 감시 실패해도 앱은 그대로 쓴다
  }
}

// ── OneDrive 충돌 사본 찾기 ──────────────────────────────────────────────
// 동기화가 늦게 도착하면 OneDrive가 `notebooks-DESKTOP-A.json` 같은 사본을
// 남기는데, 앱이 그냥 무시해서 **날아간 줄도 모른다.** 찾아서 알려만 준다
// (지우거나 합치지 않는다 — 사용자가 보고 정한다).
const conflictMerge = require('./lightnote/conflict-merge')
const ROOT_BASES: string[] = conflictMerge.ROOT_BASES
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i

function findConflictCopies(root: string, out: string[] = [], depth = 0): string[] {
  if (out.length >= 30 || depth > 6 || !existsSync(root)) return out
  let names: string[] = []
  try { names = readdirSync(root) } catch { return out }
  for (const name of names) {
    const full = join(root, name)
    let dir = false
    try { dir = statSync(full).isDirectory() } catch { continue }
    if (dir) {
      if (name === 'versions' || name === '_conflict-backup') continue
      findConflictCopies(full, out, depth + 1)
      continue
    }
    if (!name.toLowerCase().endsWith('.json') || name.endsWith('.tmp')) continue
    const parent = root.split(/[\\/]/).pop()
    if (parent === 'pages') {
      // 페이지 파일은 이름이 UUID다. 아니면 사본이다.
      if (!UUID_RE.test(name)) out.push(full)
    } else if (ROOT_BASES.some((b) => name.toLowerCase().startsWith(b + '-'))) {
      out.push(full)
    }
  }
  return out
}

ipcMain.handle('lightnote:conflict-copies', () => {
  const root = activeDataDir || localDataDir()
  return findConflictCopies(root).map((p) => ({ path: p, name: p.split(/[\\/]/).pop() || p }))
})

// 충돌 사본을 원본에 합친다(목록·맵 파일) / 페이지 본문 사본은 사본으로 바꾼다 — 원본은 버전 기록과
// `_conflict-backup` 에 남기고, 사본도 지우지 않고 그리로 옮긴다. 열린 창에는 바뀐 페이지를 알린다.
ipcMain.handle('lightnote:conflict-resolve', async (_e, { paths, force }: { paths: string[]; force?: boolean }) => {
  const root = activeDataDir || localDataDir()
  const pageVersions = require('./lightnote/page-versions')
  const results: unknown[] = []
  for (const p of paths || []) {
    try {
      const r = await conflictMerge.resolve(root, p, { force: !!force, snapshotPage: (pid: string, prev: unknown) => pageVersions.snapshot(pid, prev, true) })
      results.push({ path: p, ...r })
      if (r.ok && r.kind === 'page') {
        const m = /notebooks[\\/]([^\\/]+)[\\/]sections[\\/]([^\\/]+)[\\/]pages[\\/]/.exec(p)
        if (m) for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('lightnote:page-changed', { notebookId: m[1], sectionId: m[2], pageId: r.pageId })
      }
    } catch (e) { results.push({ path: p, ok: false, reason: String((e as Error)?.message || e) }) }
  }
  return results
})

ipcMain.handle('lightnote:reveal-path', (_e, { path: p }: { path: string }) => {
  try { shell.showItemInFolder(p) } catch { /* ignore */ }
})

// ── 스티커 메모 ───────────────────────────────────────────────────────────
// 바탕화면에 붙여두는 작은 창. 창 하나가 노트 하나다 — 같은 노트를 다시
// 띄우면 새 창을 만들지 않고 이미 떠 있는 창을 앞으로 가져온다. 내용은
// "메모" 노트북의 보통 페이지라, LightNote에서도 그대로 열어 쓸 수 있다.
type StickyTarget = { pageId: string; notebookId: string; sectionId: string }

const stickyWindows = new Map<string, BrowserWindow>()      // pageId → 창
const stickyTargetByWc = new Map<number, StickyTarget>()    // webContents.id → 어느 노트인지
// 종료 중인지 — 그때 닫히는 건 "뗀 것"이 아니라서 목록에서 빼지 않는다.
let quitting = false

function stickyEntry(pageId: string) {
  return (loadSettings().stickies || []).find((s) => s.pageId === pageId)
}

/** 열려 있는 스티커 목록을 통째로 다시 쓴다(닫힌 건 빠진다). */
function writeStickies(next: import('./settings').StickyNote[]): void {
  saveSettings({ stickies: next })
}

function rememberSticky(pageId: string, patch: Partial<import('./settings').StickyNote>): void {
  const list = (loadSettings().stickies || []).slice()
  const i = list.findIndex((s) => s.pageId === pageId)
  if (i < 0) return
  list[i] = { ...list[i], ...patch }
  writeStickies(list)
}

/** 새 창을 겹쳐 쌓지 않도록 조금씩 어긋나게 둔다. */
function stickySpawnPoint(): { x: number; y: number } {
  const { workArea } = screen.getPrimaryDisplay()
  const step = 26 * (stickyWindows.size % 6)
  return { x: Math.round(workArea.x + workArea.width - 320 - 56 - step), y: Math.round(workArea.y + 120 + step) }
}

function openSticky(target: StickyTarget): void {
  const existing = stickyWindows.get(target.pageId)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    return
  }
  const saved = stickyEntry(target.pageId)
  const spawn = stickySpawnPoint()
  const width = saved?.width ?? 300
  const height = saved?.height ?? 340
  // 스티커는 "위에 붙여두는" 물건이라 항상 위 고정이 기본이다.
  const pinned = saved?.pinned ?? true

  const win = new BrowserWindow({
    x: saved?.x ?? spawn.x,
    y: saved?.y ?? spawn.y,
    width, height, minWidth: 200, minHeight: 160,
    frame: false, transparent: true, resizable: true, hasShadow: true, show: false,
    alwaysOnTop: pinned, skipTaskbar: false, title: '스티커 메모',
    webPreferences: {
      preload: join(__dirname, '../preload/lightnote.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  })
  stickyWindows.set(target.pageId, win)
  stickyTargetByWc.set(win.webContents.id, target)

  const list = (loadSettings().stickies || []).filter((s) => s.pageId !== target.pageId)
  writeStickies([...list, { ...target, x: saved?.x ?? spawn.x, y: saved?.y ?? spawn.y, width, height, pinned }])

  win.once('ready-to-show', () => win.show())
  const remember = (): void => {
    if (win.isDestroyed()) return
    const b = win.getBounds()
    rememberSticky(target.pageId, { x: b.x, y: b.y, width: b.width, height: b.height })
  }
  win.on('moved', remember)
  win.on('resized', remember)
  // webContents는 'closed' 시점엔 이미 정리돼 있을 수 있어 지금 붙잡아 둔다.
  const wcId = win.webContents.id
  win.on('closed', () => {
    stickyWindows.delete(target.pageId)
    stickyTargetByWc.delete(wcId)
    if (!quitting) writeStickies((loadSettings().stickies || []).filter((s) => s.pageId !== target.pageId))
  })

  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#sticky')
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'sticky' })
  }
}

/** 빈 메모 한 장을 만들어 바로 띄운다 — 트레이·단축키·사이드바의 "새 메모". */
async function newSticky(): Promise<StickyTarget | null> {
  try {
    const made = await stickyStore.newNote()
    openSticky(made)
    return made
  } catch {
    return null
  }
}

ipcMain.handle('sticky:new', () => newSticky())
ipcMain.handle('sticky:open', (_e, target: StickyTarget) => { openSticky(target); return true })
// 창이 뜬 뒤 renderer가 "나는 어느 노트냐"를 직접 물어 간다 — 한 번 쏘는
// 방식은 renderer가 아직 듣기 전에 지나가 버릴 수 있다.
ipcMain.handle('sticky:which', (e) => stickyTargetByWc.get(e.sender.id) || null)
ipcMain.handle('sticky:pinned', (e) => {
  const t = stickyTargetByWc.get(e.sender.id)
  return t ? stickyEntry(t.pageId)?.pinned ?? true : true
})
ipcMain.on('sticky:set-pinned', (e, on: boolean) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  const t = stickyTargetByWc.get(e.sender.id)
  if (!win || win.isDestroyed() || !t) return
  win.setAlwaysOnTop(!!on)
  rememberSticky(t.pageId, { pinned: !!on })
})
ipcMain.on('sticky:close', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (win && !win.isDestroyed()) win.close()
})

/** 앱을 다시 켜면 붙여뒀던 스티커를 그대로 다시 띄운다. */
function restoreStickies(): void {
  for (const s of loadSettings().stickies || []) {
    openSticky({ pageId: s.pageId, notebookId: s.notebookId, sectionId: s.sectionId })
  }
}

/** 단축키는 켜고 끄는 토글로 둔다 — 띄워놓고 쓰는 창이라 "부르는" 키가 아니다. */
function toggleJournalCapture(): void {
  if (journalCaptureWindow && !journalCaptureWindow.isDestroyed()) journalCaptureWindow.close()
  else openJournalCapture()
}

ipcMain.on('journal:capture-open', () => openJournalCapture())
ipcMain.on('journal:capture-close', () => {
  if (journalCaptureWindow && !journalCaptureWindow.isDestroyed()) journalCaptureWindow.close()
})

function openActionItemsWindow(): void {
  if (actionItemsWindow && !actionItemsWindow.isDestroyed()) {
    actionItemsWindow.show()
    actionItemsWindow.focus()
    actionItemsWindow.webContents.send('action-items:refresh')
    return
  }
  const pinned = loadSettings().actionItemsPinned !== false
  actionItemsWindow = new BrowserWindow({
    ...actionItemsBounds(),
    frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true,
    resizable: false, hasShadow: true, show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/lightnote.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  })
  if (pinned) actionItemsWindow.setAlwaysOnTop(true, 'screen-saver')
  actionItemsWindow.once('ready-to-show', () => actionItemsWindow?.show())
  actionItemsWindow.on('closed', () => { actionItemsWindow = null })
  // 고정을 꺼둔 상태로 다른 창에 포커스를 뺏기면 조용히 사라진다(캡처/
  // 팔레트 창과 같은 습관). 테스트 환경(E2E)엔 실제 OS 포커스 이동이
  // 없으니 그대로 둔다.
  actionItemsWindow.on('blur', () => {
    if (!process.env.DSP_TEST_DATA_DIR && !(loadSettings().actionItemsPinned !== false)) {
      actionItemsWindow?.close()
    }
  })

  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    actionItemsWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#actionitems')
  } else {
    actionItemsWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'actionitems' })
  }
}

function closeActionItemsWindow(): void {
  if (actionItemsWindow && !actionItemsWindow.isDestroyed()) actionItemsWindow.close()
  actionItemsWindow = null
}

function toggleActionItemsWindow(): void {
  if (actionItemsWindow && !actionItemsWindow.isDestroyed()) closeActionItemsWindow()
  else openActionItemsWindow()
}

ipcMain.on('action-items:open', openActionItemsWindow)
ipcMain.on('action-items:close', closeActionItemsWindow)
ipcMain.on('action-items:open-page', (_e, target) => openLightNoteToPage(target))
ipcMain.handle('action-items:get-pinned', () => loadSettings().actionItemsPinned !== false)
ipcMain.handle('action-items:set-pinned', (_e, pinned: boolean) => {
  saveSettings({ actionItemsPinned: pinned })
  if (actionItemsWindow && !actionItemsWindow.isDestroyed()) {
    actionItemsWindow.setAlwaysOnTop(pinned, 'screen-saver')
  }
  return pinned
})

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
// 이 창이 "새 창에서 열기"로 만든 창이면 그 창 전용 슬롯을 먼저 보고,
// 없으면(=기본 LightNote 창) 예전부터 쓰던 단일 슬롯으로 그대로 동작한다.
ipcMain.handle('lightnote:consume-pending-open', (event) => {
  const perWindow = pendingOpenByWebContentsId.get(event.sender.id)
  if (perWindow) {
    pendingOpenByWebContentsId.delete(event.sender.id)
    return perWindow
  }
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
  resolveDataDir()
  startDataWatch()
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
    // 우리가 방금 쓴 파일이라고 감시기에 알려 준다 — 그래야 제 저장이
    // 되돌아와 "다른 창에서 바뀜" 배너를 헛되이 띄우지 않는다.
    onPageSaved: (pageId: string, updatedAt: number) => noteSelfWrite(pageId, updatedAt),
    getItem: (kind: 'event' | 'task', id: string) => {
      if (kind === 'event') {
        const e = getEventById(id)
        return e ? { title: e.title, start_at: e.start_at, end_at: e.end_at, location: e.location ?? undefined } : null
      }
      const t = getTaskById(id)
      return t ? { title: t.title, due_at: t.due_at ?? undefined } : null
    }
  }, activeDataDir)
  createWindow()
  createTray()
  scheduleNextReminder()
  scheduleEventReminders()
  scheduleOutlookSync()
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

  // "사이드바는 안 쓰고 LightNote만 트레이/단축키로" 피드백 — 사이드바가
  // 숨겨져 있어도(또는 다른 창에 가려 있어도) 단축키 하나로 바로 뜬다.
  // 실제로 이 PC에서 Ctrl+Shift+L이 다른 앱에 선점돼 아무 일도 일어나지
  // 않았다. 선점된 경우 다음 후보로 넘어가고, 최종적으로 어떤 키가 잡혔는지
  // 트레이 메뉴에 적어 준다(무엇을 눌러야 하는지 추측하지 않도록).
  lightNoteHotkey = registerFirstAvailable(
    ['CommandOrControl+Shift+L', 'CommandOrControl+Alt+L', 'CommandOrControl+Shift+N'],
    () => openLightNoteWindow(),
  )
  // 기한순 할일 팝업 토글. 화면 우측 상단에 뜬다.
  actionItemsHotkey = registerFirstAvailable(
    ['CommandOrControl+Shift+A', 'CommandOrControl+Alt+A'],
    () => toggleActionItemsWindow(),
  )
  // 기록장 빠른 입력 — 채팅방에 적던 속도를 유지하려면 어디서든 떠야 한다.
  journalHotkey = registerFirstAvailable(
    ['CommandOrControl+Shift+J', 'CommandOrControl+Alt+J', 'CommandOrControl+Shift+D'],
    () => toggleJournalCapture(),
  )
  // 지난번에 띄워둔 채로 껐으면 이번에도 그대로 띄운다 — "그냥 띄워놓고
  // 채팅하듯 쓴다"가 이 창의 사용 방식이라, 매번 다시 부르게 하지 않는다.
  if (loadSettings().journalOpen) openJournalCapture()
  // 붙여뒀던 스티커도 그대로 — 바탕화면에 붙여두는 물건이라 매번 다시
  // 찾아 띄우게 하면 쓰지 않게 된다.
  restoreStickies()
  stickyHotkey = registerFirstAvailable(
    ['CommandOrControl+Shift+Q', 'CommandOrControl+Alt+Q', 'CommandOrControl+Shift+M'],
    () => { newSticky() },
  )
  tray?.setContextMenu(buildTrayMenu())   // 라벨에 실제로 잡힌 키를 반영

  // If the app was cold-launched via a lightnote:// deep link, the URL is in argv.
  handleDeepLink(deepLinkFromArgv(process.argv))
})
app.on('window-all-closed', () => { /* keep alive in tray */ })
app.on('second-instance', (_e, argv) => {
  showMainWindow()
  // Windows/Linux deliver the deep link to the already-running instance here.
  handleDeepLink(deepLinkFromArgv(argv))
})
// macOS delivers the deep link via this event.
app.on('open-url', (e, url) => { e.preventDefault(); handleDeepLink(url) })
app.on('before-quit',       () => {
  // 앱을 끄면 스티커 창들도 닫히는데, 그걸 "사용자가 뗐다"로 보면 붙여둔
  // 목록이 종료할 때마다 비워져 다음 실행에 아무것도 안 뜬다.
  quitting = true
  if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null }
  clearEventReminders()
  tray?.destroy(); tray = null
})
app.on('will-quit', () => { globalShortcut.unregisterAll() })
