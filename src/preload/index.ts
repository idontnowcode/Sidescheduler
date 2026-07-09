import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Window
  expandWindow:   () => ipcRenderer.send('window:expand'),
  collapseWindow: () => ipcRenderer.send('window:collapse'),
  openDashboard:  () => ipcRenderer.send('window:open-dashboard'),
  openDashboardView: (view: string) => ipcRenderer.send('window:open-dashboard-view', view),
  consumePendingDashboardView: () => ipcRenderer.invoke('dashboard:consume-pending-view'),
  onDashboardSetView: (cb: (view: string) => void) => {
    const h = (_: unknown, v: string) => cb(v)
    ipcRenderer.on('dashboard:set-view', h)
    return () => ipcRenderer.removeListener('dashboard:set-view', h)
  },
  openPalette:    () => ipcRenderer.send('palette:open'),
  closePalette:   () => ipcRenderer.send('palette:close'),
  openCapture:    () => ipcRenderer.send('capture:open'),
  closeCapture:   () => ipcRenderer.send('capture:close'),
  setSidebarHeight: (height: number) => ipcRenderer.send('sidebar:set-height', height),
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
  onSidebarAnchor:    (cb: (a: 'top' | 'bottom') => void) => { const h = (_: unknown, a: 'top' | 'bottom') => cb(a); ipcRenderer.on('sidebar:anchor', h); return () => ipcRenderer.removeListener('sidebar:anchor', h) },
  onSidebarPeek:      (cb: (s: { enabled: boolean; active: boolean }) => void) => { const h = (_: unknown, s: { enabled: boolean; active: boolean }) => cb(s); ipcRenderer.on('sidebar:peek', h); return () => ipcRenderer.removeListener('sidebar:peek', h) },

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
  rolloverTasks:          () => ipcRenderer.invoke('db:tasks:rollover'),
  addActualMinutes:       (id: string, minutes: number) => ipcRenderer.invoke('db:tasks:add-actual', { id, minutes }),

  // Insights
  getInsights:            (days?: number) => ipcRenderer.invoke('db:insights:get', { days }),

  // Habits
  listHabits:   () => ipcRenderer.invoke('db:habits:list'),
  createHabit:  (data: { title: string; color?: string }) => ipcRenderer.invoke('db:habits:create', data),
  deleteHabit:  (id: string) => ipcRenderer.invoke('db:habits:delete', { id }),
  toggleHabit:  (id: string, dayTs?: number) => ipcRenderer.invoke('db:habits:toggle', { id, dayTs }),

  // ICS import/export
  icsExportString: () => ipcRenderer.invoke('ics:export-string'),
  icsImportString: (text: string) => ipcRenderer.invoke('ics:import-string', { text }),
  icsExportFile:   () => ipcRenderer.invoke('ics:export-file'),
  icsImportFile:   () => ipcRenderer.invoke('ics:import-file'),

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

  // LightNote page ↔ event/task linking (used by the planner's note section)
  lightnoteListAllPages: () => ipcRenderer.invoke('lightnote:links:list-pages'),
  lightnoteLinkedPages: (kind: string, itemId: string) =>
    ipcRenderer.invoke('lightnote:links:by-item', { kind, itemId }),
  lightnoteLinkPage: (pageId: string, notebookId: string, sectionId: string, kind: string, itemId: string) =>
    ipcRenderer.invoke('lightnote:links:add', { pageId, notebookId, sectionId, kind, itemId }),
  lightnoteUnlinkPage: (pageId: string, kind: string, itemId: string) =>
    ipcRenderer.invoke('lightnote:links:remove', { pageId, kind, itemId }),
  lightnoteCreateLinkedPage: (kind: string, itemId: string, title: string, meta?: string) =>
    ipcRenderer.invoke('lightnote:links:create-page', { kind, itemId, title, meta }),
  aiBrief: (kind: string, itemId: string) => ipcRenderer.invoke('lightnote:brief', { kind, itemId }),

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

  // Single-item lookups (used by NoteEditorApp linked-items panel)
  getEventById: (id: string) => ipcRenderer.invoke('db:events:get', { id }),
  getTaskById:  (id: string) => ipcRenderer.invoke('db:tasks:get',  { id }),

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
