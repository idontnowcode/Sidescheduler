import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Window control ──────────────────────────────────────────────────────
  expandWindow: () => ipcRenderer.send('window:expand'),
  collapseWindow: () => ipcRenderer.send('window:collapse'),
  onDisplayChanged: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('display:changed', handler)
    return () => ipcRenderer.removeListener('display:changed', handler)
  },

  // ── Events ──────────────────────────────────────────────────────────────
  listEvents: (params: { start: number; end: number }) =>
    ipcRenderer.invoke('db:events:list', params),
  createEvent: (data: unknown) => ipcRenderer.invoke('db:events:create', data),
  updateEvent: (data: unknown) => ipcRenderer.invoke('db:events:update', data),
  deleteEvent: (id: string) => ipcRenderer.invoke('db:events:delete', { id }),

  // ── Tasks ────────────────────────────────────────────────────────────────
  listTasks: (params: { end: number }) => ipcRenderer.invoke('db:tasks:list', params),
  createTask: (data: unknown) => ipcRenderer.invoke('db:tasks:create', data),
  toggleTask: (id: string) => ipcRenderer.invoke('db:tasks:toggle', { id }),
  deleteTask: (id: string) => ipcRenderer.invoke('db:tasks:delete', { id })
})
