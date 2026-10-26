import { contextBridge, ipcRenderer, webUtils } from 'electron'
// 일정 쪽(빠른 추가·오늘·대시보드)을 LightNote 창 **안에서** 그리려면 그
// 화면들이 쓰는 window.electronAPI 가 이 창에도 있어야 한다. 같은 앱·같은
// 렌더러 묶음이라 한 줄 import 로 그대로 얹는다(여기서 다시 나열하면
// 두 벌을 따로 고쳐야 하고, 한쪽만 고치는 날 조용히 어긋난다).
import './index'

contextBridge.exposeInMainWorld('lightnote', {
  // 테스트 격리(DSP_TEST_DATA_DIR)로 띄웠는지. 화면 기본값 중 테스트가
  // 건드리기 곤란한 것(접힌 툴바 등)을 펴 두는 데만 쓴다.
  isTestRun: !!process.env.DSP_TEST_DATA_DIR,
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
  createPage: (notebookId, sectionId, title, parentId) => ipcRenderer.invoke('lightnote:create-page', { notebookId, sectionId, title, parentId }),
  loadPage: (notebookId, sectionId, pageId) => ipcRenderer.invoke('lightnote:load-page', { notebookId, sectionId, pageId }),
  // 본문을 읽지 않고 "그 사이 바뀌었나"만 확인한다 (창 포커스 시 사용)
  pageStamp: (notebookId, sectionId, pageId) => ipcRenderer.invoke('lightnote:page-stamp', { notebookId, sectionId, pageId }),
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
  importBundleApply: (mode) => ipcRenderer.invoke('lightnote:import-bundle-apply', { mode }),

  // 업무 진행 현황 보고서 내보내기 (선택한 업무들 → 개조식 평문 .md)
  exportReport: (pageIds) => ipcRenderer.invoke('lightnote:export-report', { pageIds }),
  // 주간 업무 현황 보고 — 업무 페이지 전체에서 자동(본문 소제목 그대로). week: 'this' | 'last'
  exportWeeklyReport: (week) => ipcRenderer.invoke('lightnote:export-weekly-report', { week }),

  // 페이지 템플릿 (실제로는 숨김 노트북 안의 일반 페이지 — templateStoreLocation으로 열기)
  templateStoreLocation: () => ipcRenderer.invoke('lightnote:templates:store-location'),
  listTemplates: () => ipcRenderer.invoke('lightnote:templates:list'),
  getTemplate: (id) => ipcRenderer.invoke('lightnote:templates:get', { id }),
  saveTemplate: (name, delta) => ipcRenderer.invoke('lightnote:templates:save', { name, delta }),
  removeTemplate: (id) => ipcRenderer.invoke('lightnote:templates:remove', { id }),
  renameTemplate: (id, name) => ipcRenderer.invoke('lightnote:templates:rename', { id, name }),

  // PDF 내보내기
  exportPdf: (title, html, pageId) => ipcRenderer.invoke('lightnote:export-pdf', { title, html, pageId }),

  // 파일 첨부
  attachPick: (pageId) => ipcRenderer.invoke('lightnote:attach:pick', { pageId }),
  attachOpen: (pageId, stored) => ipcRenderer.invoke('lightnote:attach:open', { pageId, stored }),
  attachReveal: (pageId, stored) => ipcRenderer.invoke('lightnote:attach:reveal', { pageId, stored }),

  // 참조 (논문식 [1] 각주)
  refsList: (pageId) => ipcRenderer.invoke('lightnote:refs:list', { pageId }),
  refsAddText: (pageId, text, caption) => ipcRenderer.invoke('lightnote:refs:add-text', { pageId, text, caption }),
  refsAddResource: (pageId, resId, caption) => ipcRenderer.invoke('lightnote:refs:add-resource', { pageId, resId, caption }),
  // 자료 (웹·파일·폴더 링크 — LinkMap 을 옮긴 것)
  resList: () => ipcRenderer.invoke('lightnote:res:list'),
  resAdd: (items) => ipcRenderer.invoke('lightnote:res:add', { items }),
  resUpdate: (id, patch) => ipcRenderer.invoke('lightnote:res:update', { id, patch }),
  resRemove: (ids) => ipcRenderer.invoke('lightnote:res:remove', { ids }),
  resRestore: (ids) => ipcRenderer.invoke('lightnote:res:restore', { ids }),
  resTagCreate: (name) => ipcRenderer.invoke('lightnote:res:tag-create', { name }),
  resTagUpdate: (id, patch) => ipcRenderer.invoke('lightnote:res:tag-update', { id, patch }),
  resTagDelete: (id) => ipcRenderer.invoke('lightnote:res:tag-delete', { id }),
  resTagMerge: (from, into) => ipcRenderer.invoke('lightnote:res:tag-merge', { from, into }),
  resOpen: (id) => ipcRenderer.invoke('lightnote:res:open', { id }),
  resReveal: (id) => ipcRenderer.invoke('lightnote:res:reveal', { id }),
  resRead: (id) => ipcRenderer.invoke('lightnote:res:read', { id }),
  resPick: (mode) => ipcRenderer.invoke('lightnote:res:pick', { mode }),
  resPickJson: () => ipcRenderer.invoke('lightnote:res:pick-json'),
  resFetchTitle: (url) => ipcRenderer.invoke('lightnote:res:fetch-title', { url }),
  resFolderList: (path) => ipcRenderer.invoke('lightnote:res:folder-list', { path }),
  resFolderImport: (root, rels, extTags) => ipcRenderer.invoke('lightnote:res:folder-import', { root, rels, extTags }),
  resFolderPreview: (tagId) => ipcRenderer.invoke('lightnote:res:folder-preview', { tagId }),
  resFolderSync: (tagId) => ipcRenderer.invoke('lightnote:res:folder-sync', { tagId }),
  resExclusions: (tagId) => ipcRenderer.invoke('lightnote:res:exclusions', { tagId }),
  resSetExclusions: (tagId, rels) => ipcRenderer.invoke('lightnote:res:set-exclusions', { tagId, rels }),
  resRemap: (id, actual) => ipcRenderer.invoke('lightnote:res:remap', { id, actual }),
  resSetContent: (id, content) => ipcRenderer.invoke('lightnote:res:content', { id, content }),
  resUsedBy: (id) => ipcRenderer.invoke('lightnote:res:used-by', { id }),
  resImportLinkMap: (path) => ipcRenderer.invoke('lightnote:res:import-linkmap', { path }),
  // 끌어다 놓은 파일의 실제 경로 (Electron 32+ 는 File.path 가 없다)
  pathForFile: (file) => { try { return webUtils.getPathForFile(file) } catch { return '' } },
  refsAddImageData: (pageId, dataUrl, caption) => ipcRenderer.invoke('lightnote:refs:add-image-data', { pageId, dataUrl, caption }),
  refsAddImageFile: (pageId) => ipcRenderer.invoke('lightnote:refs:add-image-file', { pageId }),
  refsUpdate: (pageId, id, patch) => ipcRenderer.invoke('lightnote:refs:update', { pageId, id, patch }),
  refsRemove: (pageId, id) => ipcRenderer.invoke('lightnote:refs:remove', { pageId, id }),
  refsImage: (pageId, file) => ipcRenderer.invoke('lightnote:refs:image', { pageId, file }),

  // 기록장
  journalAppend: (text, at) => ipcRenderer.invoke('lightnote:journal:append', { text, at }),
  journalAppendImage: (dataUrl, text, at) => ipcRenderer.invoke('lightnote:journal:append-image', { dataUrl, text, at }),
  // 공유 노트 폴더 (OneDrive 등)
  dataDirStatus: () => ipcRenderer.invoke('lightnote:data-dir:status'),
  dataDirMigrate: () => ipcRenderer.invoke('lightnote:data-dir:migrate'),
  dataDirAttach: () => ipcRenderer.invoke('lightnote:data-dir:attach'),
  dataDirUseLocal: () => ipcRenderer.invoke('lightnote:data-dir:use-local'),
  dataDirRelaunch: () => ipcRenderer.invoke('lightnote:data-dir:relaunch'),
  // OneDrive가 남긴 충돌 사본 찾기 (알려만 준다 — 지우거나 합치지 않는다)
  conflictCopies: () => ipcRenderer.invoke('lightnote:conflict-copies'),
  revealPath: (p) => ipcRenderer.invoke('lightnote:reveal-path', { path: p }),

  // 스티커 메모 — 창 하나가 노트 하나
  stickyNew: () => ipcRenderer.invoke('sticky:new'),
  stickyOpen: (target) => ipcRenderer.invoke('sticky:open', target),
  stickyWhich: () => ipcRenderer.invoke('sticky:which'),
  stickyPinned: () => ipcRenderer.invoke('sticky:pinned'),
  stickySetPinned: (on) => ipcRenderer.send('sticky:set-pinned', on),
  stickyClose: () => ipcRenderer.send('sticky:close'),
  // 작은 창(스티커·액션 아이템)에서 본 페이지를 LightNote 본창으로 넘겨 연다.
  openPageInMain: (notebookId, sectionId, pageId) =>
    ipcRenderer.send('action-items:open-page', { notebookId, sectionId, pageId }),

  journalEdit: (date, index, text) => ipcRenderer.invoke('lightnote:journal:edit', { date, index, text }),
  journalDelete: (date, index) => ipcRenderer.invoke('lightnote:journal:delete', { date, index }),
  journalDays: (days, withRecords) => ipcRenderer.invoke('lightnote:journal:days', { days, withRecords }),
  journalDay: (date) => ipcRenderer.invoke('lightnote:journal:day', { date }),
  journalTodayPage: () => ipcRenderer.invoke('lightnote:journal:today-page'),
  journalCaptureOpen: () => ipcRenderer.send('journal:capture-open'),
  journalCaptureClose: () => ipcRenderer.send('journal:capture-close'),

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
  // 창 제목 표시줄을 앱 헤더와 합쳤다. 창 조작 단추(최소화·최대화·닫기)는
  // 운영체제가 그 줄 위에 그려 주므로, 테마가 바뀌면 색만 맞춰 주면 된다.
  setTitleBarColors: (color, symbolColor, height) =>
    ipcRenderer.send('lightnote:titlebar-colors', { color, symbolColor, height }),
  // 앱이 그리는 창 조작 단추
  winControl: (act) => ipcRenderer.send('lightnote:win', act),
  winIsMaximized: () => ipcRenderer.invoke('lightnote:win-is-max'),
  onWinState: (cb) => {
    const h = (_e, s) => cb(s)
    ipcRenderer.on('lightnote:win-state', h)
    return () => ipcRenderer.removeListener('lightnote:win-state', h)
  },

  // 옆 앱들(플래너) 열기. LightNote는 늘 DSP 안에서 도는 창이라
  // ("독립 실행"은 사이드바만 숨긴 것) 이 길은 항상 열려 있다.
  planner: {
    openPalette: () => ipcRenderer.send('palette:open'),
    openDashboard: () => ipcRenderer.send('window:open-dashboard'),
    openDashboardView: (view) => ipcRenderer.send('window:open-dashboard-view', view),
  },

  // 본문에 체크박스로 적어둔 줄도 할 일로 센다
  bodyTasksList: () => ipcRenderer.invoke('lightnote:body-tasks:list'),
  bodyTaskToggle: (notebookId, sectionId, pageId, line, text) =>
    ipcRenderer.invoke('lightnote:body-tasks:toggle', { notebookId, sectionId, pageId, line, text }),
  // 오늘까지 마감인 미완료 액션 수 (맨 왼쪽 "액션" 단추의 숫자)
  workObjectDueCount: () => ipcRenderer.invoke('lightnote:work-object:due-count'),
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
  getOpenTabs: () => ipcRenderer.invoke('lightnote:get-open-tabs'),
  saveOpenTabs: (tabs) => ipcRenderer.invoke('lightnote:save-open-tabs', { tabs }),

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
  // MS 오피스처럼 노트를 별도 창으로 열기 (여러 노트 나란히 편집)
  openInNewWindow: (notebookId, sectionId, pageId) =>
    ipcRenderer.send('lightnote:open-new-window', { notebookId, sectionId, pageId }),

  // 액션 아이템 팝업(Ctrl+Shift+A) 전용 — 같은 preload를 쓴다.
  actionItemsClose: () => ipcRenderer.send('action-items:close'),
  actionItemsGetPinned: () => ipcRenderer.invoke('action-items:get-pinned'),
  actionItemsSetPinned: (pinned) => ipcRenderer.invoke('action-items:set-pinned', pinned),
  actionItemsOpenPage: (notebookId, sectionId, pageId) =>
    ipcRenderer.send('action-items:open-page', { notebookId, sectionId, pageId }),
  onActionItemsRefresh: (cb) => { const h = () => cb(); ipcRenderer.on('action-items:refresh', h); return () => ipcRenderer.removeListener('action-items:refresh', h) },

  // 페이지 리스트 칸 — 즐겨찾기 · 최근 편집 · 인박스
  pageList: (mode, limit, scope) => ipcRenderer.invoke('lightnote:page-list', { mode, limit, scope }),
  pageListCounts: () => ipcRenderer.invoke('lightnote:page-list-counts'),
  favoriteIds: () => ipcRenderer.invoke('lightnote:favorite-ids'),
  favoriteToggle: (pageId) => ipcRenderer.invoke('lightnote:favorite-toggle', { pageId }),
  inboxNew: (title) => ipcRenderer.invoke('lightnote:inbox-new', { title }),

  // 다른 창에서 같은 페이지가 저장되면 알림 (자동 덮어쓰기 없음 — 배너로 새로고침 안내)
  onPageChangedElsewhere: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('lightnote:page-changed', h)
    return () => ipcRenderer.removeListener('lightnote:page-changed', h)
  },
})
