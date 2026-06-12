import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Window
  expandWindow:   () => ipcRenderer.send('window:expand'),
  collapseWindow: () => ipcRenderer.send('window:collapse'),
  openDashboard:  () => ipcRenderer.send('window:open-dashboard'),
  openPalette:    () => ipcRenderer.send('palette:open'),
  closePalette:   () => ipcRenderer.send('palette:close'),
  openEditor:     (payload: unknown) => ipcRenderer.send('editor:open', payload),
  closeEditor:    () => ipcRenderer.send('editor:close'),
  getEditorPayload: () => ipcRenderer.invoke('editor:get-pending'),
  notifyEditorSaved: () => ipcRenderer.send('editor:saved'),
  paletteAction:  (action: { kind: string; payload?: unknown }) => ipcRenderer.send('palette:action', action),
  paletteRefresh: () => ipcRenderer.send('palette:refresh'),
  onPaletteAction:  (cb: (a: { kind: string; payload?: unknown }) => void) => {
    const h = (_: unknown, a: { kind: string; payload?: unknown }) => cb(a)
    ipcRenderer.on('palette:action', h)
    return () => ipcRenderer.removeListener('palette:action', h)
  },
  onPaletteRefresh: (cb: () => void) => {
    const h = () => cb()
    ipcRenderer.on('palette:refresh', h)
    return () => ipcRenderer.removeListener('palette:refresh', h)
  },
  navigateToDate: (ts: number) => ipcRenderer.send('navigate-date', { ts }),

  onDisplayChanged:   (cb: () => void) => { const h = () => cb(); ipcRenderer.on('display:changed', h); return () => ipcRenderer.removeListener('display:changed', h) },
  onDisplaysUpdated:  (cb: () => void) => { const h = () => cb(); ipcRenderer.on('displays:updated', h); return () => ipcRenderer.removeListener('displays:updated', h) },
  onNavigateToDate:   (cb: (ts: number) => void) => { const h = (_: unknown, { ts }: { ts: number }) => cb(ts); ipcRenderer.on('navigate-to-date', h); return () => ipcRenderer.removeListener('navigate-to-date', h) },
  onSettingsChanged:  (cb: (next: unknown) => void) => { const h = (_: unknown, next: unknown) => cb(next); ipcRenderer.on('settings:changed', h); return () => ipcRenderer.removeListener('settings:changed', h) },

  // Window settings
  getSettings:  () => ipcRenderer.invoke('settings:get'),
  setSettings:  (patch: unknown) => ipcRenderer.invoke('settings:set', patch),
  listDisplays: () => ipcRenderer.invoke('displays:list'),

  // Events
  listEvents:            (p: { start: number; end: number }) => ipcRenderer.invoke('db:events:list', p),
  createEvent:           (data: unknown) => ipcRenderer.invoke('db:events:create', data),
  updateEvent:           (data: unknown) => ipcRenderer.invoke('db:events:update', data),
  moveEvent:             (id: string, start_at: number, end_at: number) => ipcRenderer.invoke('db:events:move', { id, start_at, end_at }),
  updateEventInstance:   (data: unknown) => ipcRenderer.invoke('db:events:update-instance', data),
  deleteEvent:           (id: string) => ipcRenderer.invoke('db:events:delete', { id }),
  deleteEventInstance:   (data: unknown) => ipcRenderer.invoke('db:events:delete-instance', data),

  // Tasks
  listTasks:              (p: { end: number }) => ipcRenderer.invoke('db:tasks:list', p),
  listAllIncompleteTasks: () => ipcRenderer.invoke('db:tasks:list-all-incomplete'),
  listAllTasks:           () => ipcRenderer.invoke('db:tasks:list-all'),
  createTask:             (data: unknown) => ipcRenderer.invoke('db:tasks:create', data),
  updateTask:             (data: unknown) => ipcRenderer.invoke('db:tasks:update', data),
  toggleTask:             (id: string) => ipcRenderer.invoke('db:tasks:toggle', { id }),
  snoozeTask:             (id: string, due_at: number | null) => ipcRenderer.invoke('db:tasks:snooze', { id, due_at }),
  deleteTask:             (id: string) => ipcRenderer.invoke('db:tasks:delete', { id }),

  // Search
  search: (query: string) => ipcRenderer.invoke('db:search', { query }),

  // Projects
  listProjects: () => ipcRenderer.invoke('db:projects:list'),

  // Focus Areas
  listFocusAreas:   () => ipcRenderer.invoke('db:focus-areas:list'),
  createFocusArea:  (data: unknown) => ipcRenderer.invoke('db:focus-areas:create', data),
  updateFocusArea:  (data: unknown) => ipcRenderer.invoke('db:focus-areas:update', data),
  deleteFocusArea:  (id: string) => ipcRenderer.invoke('db:focus-areas:delete', { id }),

  // Workload
  getWorkload: () => ipcRenderer.invoke('workload:get'),

  // App settings
  getAutoStart: () => ipcRenderer.invoke('app:get-login-item'),
  setAutoStart: (value: boolean) => ipcRenderer.invoke('app:set-login-item', { value }),

  // LightNote (embedded — opens a BrowserWindow managed by DSP's main process)
  lightnoteOpen: () => ipcRenderer.send('lightnote:launch'),
  lightnoteOpenPage: (pageId: string, notebookId: string, sectionId: string) =>
    ipcRenderer.send('lightnote:open-page', { pageId, notebookId, sectionId }),

  // Note Editor window
  openNoteEditor: (payload: unknown) => ipcRenderer.send('note-editor:open', payload),
  closeNoteEditor: () => ipcRenderer.send('note-editor:close'),
  getNoteEditorPayload: () => ipcRenderer.invoke('note-editor:get-pending'),
  notifyNoteEditorSaved: () => ipcRenderer.send('note-editor:saved'),
  onNoteEditorPayload: (cb: (p: unknown) => void) => {
    const h = (_: unknown, p: unknown) => cb(p)
    ipcRenderer.on('note-editor:payload', h)
    return () => ipcRenderer.removeListener('note-editor:payload', h)
  },

  // Notes CRUD
  listNotesByItem: (kind: string, itemId: string) => ipcRenderer.invoke('db:notes:by-item', { kind, itemId }),
  listAllNotes:    () => ipcRenderer.invoke('db:notes:all'),
  getNoteById:     (id: string) => ipcRenderer.invoke('db:notes:get', { id }),
  createNote:      (data: unknown) => ipcRenderer.invoke('db:notes:create', data),
  updateNote:      (data: unknown) => ipcRenderer.invoke('db:notes:update', data),
  deleteNote:      (id: string) => ipcRenderer.invoke('db:notes:delete', { id }),
  linkNote:        (noteId: string, kind: string, itemId: string) => ipcRenderer.invoke('db:notes:link', { noteId, kind, itemId }),
  unlinkNote:      (noteId: string, kind: string, itemId: string) => ipcRenderer.invoke('db:notes:unlink', { noteId, kind, itemId }),
})
