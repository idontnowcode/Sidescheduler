import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Window ──────────────────────────────────────────────────────────────
  expandWindow:   () => ipcRenderer.send('window:expand'),
  collapseWindow: () => ipcRenderer.send('window:collapse'),
  openDashboard:  () => ipcRenderer.send('window:open-dashboard'),
  navigateToDate: (ts: number) => ipcRenderer.send('navigate-date', { ts }),

  onDisplayChanged: (cb: () => void) => {
    const h = () => cb()
    ipcRenderer.on('display:changed', h)
    return () => ipcRenderer.removeListener('display:changed', h)
  },
  onDisplaysUpdated: (cb: () => void) => {
    const h = () => cb()
    ipcRenderer.on('displays:updated', h)
    return () => ipcRenderer.removeListener('displays:updated', h)
  },
  onNavigateToDate: (cb: (ts: number) => void) => {
    const h = (_: unknown, { ts }: { ts: number }) => cb(ts)
    ipcRenderer.on('navigate-to-date', h)
    return () => ipcRenderer.removeListener('navigate-to-date', h)
  },
  onSettingsChanged: (cb: (next: unknown) => void) => {
    const h = (_: unknown, next: unknown) => cb(next)
    ipcRenderer.on('settings:changed', h)
    return () => ipcRenderer.removeListener('settings:changed', h)
  },

  // ── Window settings + displays ──────────────────────────────────────────
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: unknown) => ipcRenderer.invoke('settings:set', patch),
  listDisplays: () => ipcRenderer.invoke('displays:list'),

  // ── Events ──────────────────────────────────────────────────────────────
  listEvents:            (p: { start: number; end: number }) => ipcRenderer.invoke('db:events:list', p),
  createEvent:           (data: unknown) => ipcRenderer.invoke('db:events:create', data),
  updateEvent:           (data: unknown) => ipcRenderer.invoke('db:events:update', data),
  moveEvent:             (id: string, start_at: number, end_at: number) => ipcRenderer.invoke('db:events:move', { id, start_at, end_at }),
  updateEventInstance:   (data: unknown) => ipcRenderer.invoke('db:events:update-instance', data),
  deleteEvent:           (id: string) => ipcRenderer.invoke('db:events:delete', { id }),
  deleteEventInstance:   (data: unknown) => ipcRenderer.invoke('db:events:delete-instance', data),

  // ── Tasks ────────────────────────────────────────────────────────────────
  listTasks:              (p: { end: number }) => ipcRenderer.invoke('db:tasks:list', p),
  listAllIncompleteTasks: () => ipcRenderer.invoke('db:tasks:list-all-incomplete'),
  createTask:             (data: unknown) => ipcRenderer.invoke('db:tasks:create', data),
  toggleTask:             (id: string) => ipcRenderer.invoke('db:tasks:toggle', { id }),
  deleteTask:             (id: string) => ipcRenderer.invoke('db:tasks:delete', { id }),

  // ── App settings ─────────────────────────────────────────────────────────
  getAutoStart: () => ipcRenderer.invoke('app:get-login-item'),
  setAutoStart: (value: boolean) => ipcRenderer.invoke('app:set-login-item', { value })
})
