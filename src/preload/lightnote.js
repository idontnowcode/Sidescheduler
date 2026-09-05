import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('lightnote', {
  // 노트북
  getNotebooks: () => ipcRenderer.invoke('lightnote:get-notebooks'),
  createNotebook: (name, color) => ipcRenderer.invoke('lightnote:create-notebook', { name, color }),
  renameNotebook: (id, name) => ipcRenderer.invoke('lightnote:rename-notebook', { id, name }),
  pinNotebook: (id, pinned) => ipcRenderer.invoke('lightnote:pin-notebook', { id, pinned }),
  reorderNotebooks: (ids) => ipcRenderer.invoke('lightnote:reorder-notebooks', { ids }),
  deleteNotebook: (id) => ipcRenderer.invoke('lightnote:delete-notebook', { id }),

  // 섹션
  getSections: (notebookId) => ipcRenderer.invoke('lightnote:get-sections', { notebookId }),
  createSection: (notebookId, name, parentId) => ipcRenderer.invoke('lightnote:create-section', { notebookId, name, parentId }),
  renameSection: (notebookId, id, name) => ipcRenderer.invoke('lightnote:rename-section', { notebookId, id, name }),
  moveSection: (srcNbId, secId, dstNbId, dstParentId) => ipcRenderer.invoke('lightnote:move-section', { srcNbId, secId, dstNbId, dstParentId }),
  reorderSection: (nbId, secId, refSecId, placeAfter) => ipcRenderer.invoke('lightnote:reorder-section', { nbId, secId, refSecId, placeAfter }),
  deleteSection: (notebookId, id) => ipcRenderer.invoke('lightnote:delete-section', { notebookId, id }),

  // 페이지
  getPages: (notebookId, sectionId) => ipcRenderer.invoke('lightnote:get-pages', { notebookId, sectionId }),
  createPage: (notebookId, sectionId, title) => ipcRenderer.invoke('lightnote:create-page', { notebookId, sectionId, title }),
  loadPage: (notebookId, sectionId, pageId) => ipcRenderer.invoke('lightnote:load-page', { notebookId, sectionId, pageId }),
  savePage: (data) => ipcRenderer.invoke('lightnote:save-page', data),
  renamePage: (notebookId, sectionId, id, title) => ipcRenderer.invoke('lightnote:rename-page', { notebookId, sectionId, id, title }),
  deletePage: (notebookId, sectionId, id) => ipcRenderer.invoke('lightnote:delete-page', { notebookId, sectionId, id }),
  duplicatePage: (notebookId, sectionId, id) => ipcRenderer.invoke('lightnote:duplicate-page', { notebookId, sectionId, id }),
  movePage: (srcNbId, srcSecId, pageId, dstNbId, dstSecId) => ipcRenderer.invoke('lightnote:move-page', { srcNbId, srcSecId, pageId, dstNbId, dstSecId }),
  reorderPage: (nbId, secId, pageId, refPageId, placeAfter) => ipcRenderer.invoke('lightnote:reorder-page', { nbId, secId, pageId, refPageId, placeAfter }),
  listAllPages: () => ipcRenderer.invoke('lightnote:links:list-pages'),

  // Deep link: copy lightnote://page/<id> for a page to the clipboard
  copyPageLink: (pageId) => ipcRenderer.invoke('lightnote:copy-page-link', { pageId }),

  // Maintenance: de-duplicate pages that share the same id (old move bug)
  dedupPages: () => ipcRenderer.invoke('lightnote:dedup-pages'),

  // 내보내기/가져오기 (페이지 · 섹션 · 노트북 → 단일 .json 번들)
  exportNode: (payload) => ipcRenderer.invoke('lightnote:export-node', payload),
  importBundle: () => ipcRenderer.invoke('lightnote:import-bundle'),

  // 업무 진행 현황 보고서 내보내기 (선택한 업무들 → 개조식 평문 .md)
  exportReport: (pageIds) => ipcRenderer.invoke('lightnote:export-report', { pageIds }),

  // PDF 내보내기
  exportPdf: (title, html) => ipcRenderer.invoke('lightnote:export-pdf', { title, html }),

  // 파일 첨부
  attachPick: (pageId) => ipcRenderer.invoke('lightnote:attach:pick', { pageId }),
  attachOpen: (pageId, stored) => ipcRenderer.invoke('lightnote:attach:open', { pageId, stored }),
  attachReveal: (pageId, stored) => ipcRenderer.invoke('lightnote:attach:reveal', { pageId, stored }),

  // 페이지 버전 기록
  listVersions: (pageId) => ipcRenderer.invoke('lightnote:versions:list', { pageId }),
  getVersion: (pageId, versionId) => ipcRenderer.invoke('lightnote:versions:get', { pageId, versionId }),
  restoreVersion: (notebookId, sectionId, pageId, versionId) =>
    ipcRenderer.invoke('lightnote:versions:restore', { notebookId, sectionId, pageId, versionId }),

  // 사용자 폰트 폴더 (%APPDATA%/lightnote/fonts)
  listCustomFonts: () => ipcRenderer.invoke('lightnote:fonts:list'),
  openFontsFolder: () => ipcRenderer.invoke('lightnote:fonts:open-folder'),

  // Trash (soft delete): list, restore, permanently purge, empty, retention
  trashList: () => ipcRenderer.invoke('lightnote:trash:list'),
  trashRestore: (node) => ipcRenderer.invoke('lightnote:trash:restore', node),
  trashPurge: (node) => ipcRenderer.invoke('lightnote:trash:purge', node),
  trashEmpty: () => ipcRenderer.invoke('lightnote:trash:empty'),
  trashGetRetention: () => ipcRenderer.invoke('lightnote:trash:get-retention'),
  trashSetRetention: (days) => ipcRenderer.invoke('lightnote:trash:set-retention', { days }),

  // Full-text search (title + body), AND across terms
  searchNotes: (query) => ipcRenderer.invoke('lightnote:search-notes', { query }),

  // Work object (업무 객체) — structured per-page metadata
  workObjectGet: (pageId) => ipcRenderer.invoke('lightnote:work-object:get', { pageId }),
  workObjectSet: (pageId, patch) => ipcRenderer.invoke('lightnote:work-object:set', { pageId, patch }),
  workObjectRemove: (pageId) => ipcRenderer.invoke('lightnote:work-object:remove', { pageId }),
  workObjectList: () => ipcRenderer.invoke('lightnote:work-object:list'),
  workObjectSchedulerAvailable: () => ipcRenderer.invoke('lightnote:work-object:scheduler-available'),
  workObjectCreateTask: (payload) => ipcRenderer.invoke('lightnote:work-object:create-task', payload),
  workObjectCompleteTask: (taskId) => ipcRenderer.invoke('lightnote:work-object:complete-task', { taskId }),
  workObjectTaskStatus: (taskId) => ipcRenderer.invoke('lightnote:work-object:task-status', { taskId }),

  // Page ↔ page links
  getPageRefs: (pageId) => ipcRenderer.invoke('lightnote:page-refs:get', { pageId }),
  addPageRef: (a, b) => ipcRenderer.invoke('lightnote:page-refs:add', { a, b }),
  removePageRef: (a, b) => ipcRenderer.invoke('lightnote:page-refs:remove', { a, b }),

  // 이미지
  saveImage: (data) => ipcRenderer.invoke('lightnote:save-image', data),

  // AI Assistant
  search: (question, useWebSearch) => ipcRenderer.invoke('lightnote:search', { question, useWebSearch }),
  onSearchChunk: (cb) => ipcRenderer.on('lightnote:search-chunk', (_, d) => cb(d)),
  onSearchRefs: (cb) => ipcRenderer.on('lightnote:search-refs', (_, d) => cb(d)),
  onSearchWebRefs: (cb) => ipcRenderer.on('lightnote:search-web-refs', (_, d) => cb(d)),
  openExternal: (url) => ipcRenderer.invoke('lightnote:open-external', { url }),

  // AI: extract action items from a note (returns proposals; apply writes them)
  extractActions: (text) => ipcRenderer.invoke('lightnote:extract-actions', { text }),
  applyActions: (payload) => ipcRenderer.invoke('lightnote:apply-actions', payload),

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

  // 노트 링크
  getLinksByPage:   (pageId) => ipcRenderer.invoke('lightnote:links:by-page', { pageId }),
  getLinkedItems:   (pageId) => ipcRenderer.invoke('lightnote:links:items-for-page', { pageId }),
  addLink:          (pageId, notebookId, sectionId, kind, itemId) =>
    ipcRenderer.invoke('lightnote:links:add', { pageId, notebookId, sectionId, kind, itemId }),
  removeLink:       (pageId, kind, itemId) =>
    ipcRenderer.invoke('lightnote:links:remove', { pageId, kind, itemId }),

  // 페이지 탐색 (다른 창에서 open-page 시그널 수신)
  onOpenPageById: (cb) => ipcRenderer.on('lightnote:open-page', (_, d) => cb(d)),
  consumePendingOpen: () => ipcRenderer.invoke('lightnote:consume-pending-open'),
})
