import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('lightnote', {
  // 노트북
  getNotebooks: () => ipcRenderer.invoke('lightnote:get-notebooks'),
  createNotebook: (name, color) => ipcRenderer.invoke('lightnote:create-notebook', { name, color }),
  renameNotebook: (id, name) => ipcRenderer.invoke('lightnote:rename-notebook', { id, name }),
  deleteNotebook: (id) => ipcRenderer.invoke('lightnote:delete-notebook', { id }),

  // 섹션
  getSections: (notebookId) => ipcRenderer.invoke('lightnote:get-sections', { notebookId }),
  createSection: (notebookId, name, parentId) => ipcRenderer.invoke('lightnote:create-section', { notebookId, name, parentId }),
  renameSection: (notebookId, id, name) => ipcRenderer.invoke('lightnote:rename-section', { notebookId, id, name }),
  deleteSection: (notebookId, id) => ipcRenderer.invoke('lightnote:delete-section', { notebookId, id }),

  // 페이지
  getPages: (notebookId, sectionId) => ipcRenderer.invoke('lightnote:get-pages', { notebookId, sectionId }),
  createPage: (notebookId, sectionId, title) => ipcRenderer.invoke('lightnote:create-page', { notebookId, sectionId, title }),
  loadPage: (notebookId, sectionId, pageId) => ipcRenderer.invoke('lightnote:load-page', { notebookId, sectionId, pageId }),
  savePage: (data) => ipcRenderer.invoke('lightnote:save-page', data),
  renamePage: (notebookId, sectionId, id, title) => ipcRenderer.invoke('lightnote:rename-page', { notebookId, sectionId, id, title }),
  deletePage: (notebookId, sectionId, id) => ipcRenderer.invoke('lightnote:delete-page', { notebookId, sectionId, id }),

  // 이미지
  saveImage: (data) => ipcRenderer.invoke('lightnote:save-image', data),

  // AI Assistant
  search: (question, useWebSearch) => ipcRenderer.invoke('lightnote:search', { question, useWebSearch }),
  onSearchChunk: (cb) => ipcRenderer.on('lightnote:search-chunk', (_, d) => cb(d)),
  onSearchRefs: (cb) => ipcRenderer.on('lightnote:search-refs', (_, d) => cb(d)),
  onSearchWebRefs: (cb) => ipcRenderer.on('lightnote:search-web-refs', (_, d) => cb(d)),
  openExternal: (url) => ipcRenderer.invoke('lightnote:open-external', { url }),

  // 페이지 정리
  organizePage: (title, text) => ipcRenderer.invoke('lightnote:organize-page', { title, text }),
  onOrganizeChunk: (cb) => ipcRenderer.on('lightnote:organize-chunk', (_, d) => cb(d)),

  // API 키
  saveApiKey: (key) => ipcRenderer.invoke('lightnote:save-api-key', { key }),
  checkApiKey: () => ipcRenderer.invoke('lightnote:check-api-key'),

  // 설정
  getLastOpened: () => ipcRenderer.invoke('lightnote:get-last-opened'),

  // 에러
  onError: (cb) => ipcRenderer.on('lightnote:error', (_, d) => cb(d)),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
})
