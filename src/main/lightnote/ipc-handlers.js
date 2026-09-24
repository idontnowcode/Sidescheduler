const noteStorage = require('./note-storage');
const imageHandler = require('./image-handler');
const noteIndexer = require('./note-indexer');
const geminiService = require('./gemini-service');
const storage = require('./storage');
const linkStorage = require('./link-storage');
const workObjectStorage = require('./work-object-storage');
const exportImport = require('./export-import');
const reportExport = require('./report-export');
const customFonts = require('./custom-fonts');
const pageVersions = require('./page-versions');
const attachments = require('./attachments');
const referenceStorage = require('./reference-storage');
const path = require('path');
const fs = require('fs').promises;
const { shell, BrowserWindow } = require('electron');

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * Register all LightNote IPC handlers.
 * @param {Electron.IpcMain} ipcMain
 * @param {() => Electron.BrowserWindow | null} getWindow  getter for the LightNote window
 * @param {Electron.SafeStorage} safeStorage
 * @param {Electron.Dialog} dialog
 * @param {Electron.App} app
 */
function registerIpcHandlers(ipcMain, getWindow, safeStorage, dialog, app, scheduler) {
  // Data root: use appData so it matches the standalone LightNote install location
  const APP_ROOT = path.join(app.getPath('appData'), 'lightnote');
  const DATA_ROOT = path.join(APP_ROOT, 'lightnote-data');

  noteStorage.init(DATA_ROOT);
  imageHandler.init(DATA_ROOT);
  linkStorage.init(DATA_ROOT);
  workObjectStorage.init(DATA_ROOT);
  customFonts.init(APP_ROOT);
  pageVersions.init(DATA_ROOT);
  attachments.init(DATA_ROOT);
  referenceStorage.init(DATA_ROOT);
  storage.init(safeStorage);
  // PARA(Projects/Areas/Resources/Archives) 기본 노트북은 더 이상 만들지
  // 않는다 — 안내 페이지만 든 채 트리 맨 위를 차지했고, 실제 정리는 각자
  // 주제별 노트북(회사·제품 등)으로 하고 있었다. 노트북은 이제 전부 동등하다.
  // Ensure the hidden template-store notebook/section exist (see note-storage.js).
  noteStorage.ensureTemplateStore().catch((e) => console.error('ensureTemplateStore:', e));

  const existingKey = storage.loadApiKey();
  if (existingKey) geminiService.init(existingKey);

  // Purge trash items past their retention window on launch (fire-and-forget).
  (async () => {
    try {
      const days = await noteStorage.getTrashRetentionDays();
      const r = await noteStorage.purgeExpired(days);
      for (const pid of r.pageIds) { linkStorage.removePageLinks(pid); noteIndexer.invalidateCache(pid); }
      await workObjectStorage.removeMany(r.pageIds);
      if (r.count > 0) noteIndexer.clearCache();
    } catch (e) { console.error('purgeExpired:', e); }
  })();

  // === 노트북 ===
  ipcMain.handle('lightnote:get-notebooks', async () => noteStorage.getVisibleNotebooks());

  ipcMain.handle('lightnote:create-notebook', async (_, { name, color }) =>
    noteStorage.createNotebook(name, color));

  ipcMain.handle('lightnote:rename-notebook', async (_, { id, name }) =>
    noteStorage.renameNotebook(id, name));

  ipcMain.handle('lightnote:pin-notebook', async (_, { id, pinned }) =>
    noteStorage.setNotebookPinned(id, pinned));

  ipcMain.handle('lightnote:reorder-notebooks', async (_, { ids }) =>
    noteStorage.reorderNotebooks(ids));

  ipcMain.handle('lightnote:delete-notebook', async (_, { id }) => {
    const r = await noteStorage.softDeleteNotebook(id); // → Trash, not gone
    noteIndexer.clearCache();
    return r;
  });

  // One-off cleanup for pages duplicated by the old move bug (shared ids).
  ipcMain.handle('lightnote:dedup-pages', async () => {
    const r = await noteStorage.deduplicatePages();
    noteIndexer.clearCache();
    return r;
  });

  // === 섹션 ===
  ipcMain.handle('lightnote:get-sections', async (_, { notebookId }) =>
    noteStorage.getVisibleSections(notebookId));

  ipcMain.handle('lightnote:create-section', async (_, { notebookId, name, parentId }) =>
    noteStorage.createSection(notebookId, name, parentId || null));

  ipcMain.handle('lightnote:rename-section', async (_, { notebookId, id, name }) =>
    noteStorage.renameSection(notebookId, id, name));

  ipcMain.handle('lightnote:delete-section', async (_, { notebookId, id }) => {
    const r = await noteStorage.softDeleteSection(notebookId, id); // → Trash
    noteIndexer.clearCache();
    return r;
  });

  // === 페이지 ===
  ipcMain.handle('lightnote:get-pages', async (_, { notebookId, sectionId }) =>
    noteStorage.getVisiblePages(notebookId, sectionId));

  ipcMain.handle('lightnote:create-page', async (_, { notebookId, sectionId, title, parentId }) =>
    noteStorage.createPage(notebookId, sectionId, title || '제목 없음', parentId || null));

  ipcMain.handle('lightnote:load-page', async (_, { notebookId, sectionId, pageId }) => {
    await noteStorage.saveLastOpened(notebookId, sectionId, pageId);
    return noteStorage.loadPage(notebookId, sectionId, pageId);
  });

  ipcMain.handle('lightnote:save-page', async (event, { notebookId, sectionId, pageId, delta, title, snapshot }) => {
    // Snapshot what's being replaced BEFORE overwriting (throttled inside;
    // `snapshot: true` forces one, used before AI Organize rewrites).
    try {
      const prev = await noteStorage.loadPage(notebookId, sectionId, pageId);
      await pageVersions.snapshot(pageId, prev, !!snapshot);
    } catch (e) { console.error('page snapshot:', e); }
    const result = await noteStorage.savePage(notebookId, sectionId, pageId, delta, title);
    noteIndexer.invalidateCache(pageId);
    // Multiple windows (the main LightNote window, "open in new window"
    // copies) can have the same page open at once with no shared memory —
    // let every OTHER window know this page just changed on disk, so it can
    // offer a refresh instead of silently drifting out of sync.
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed() || win.webContents.id === event.sender.id) continue;
      win.webContents.send('lightnote:page-changed', { notebookId, sectionId, pageId });
    }
    return result;
  });

  // === 페이지 버전 기록 ===
  ipcMain.handle('lightnote:versions:list', async (_, { pageId }) => pageVersions.list(pageId));
  ipcMain.handle('lightnote:versions:get', async (_, { pageId, versionId }) => pageVersions.get(pageId, versionId));
  // Restore = write the old content back as the current one; the version this
  // replaces is itself snapshotted first (forced), so a restore is undoable.
  ipcMain.handle('lightnote:versions:restore', async (_, { notebookId, sectionId, pageId, versionId }) => {
    const v = await pageVersions.get(pageId, versionId);
    if (!v) return { error: 'NOT_FOUND' };
    try {
      const prev = await noteStorage.loadPage(notebookId, sectionId, pageId);
      await pageVersions.snapshot(pageId, prev, true);
    } catch (e) { console.error('pre-restore snapshot:', e); }
    await noteStorage.savePage(notebookId, sectionId, pageId, v.delta, v.title || 'Untitled');
    noteIndexer.invalidateCache(pageId);
    return { success: true, title: v.title, delta: v.delta };
  });

  ipcMain.handle('lightnote:rename-page', async (_, { notebookId, sectionId, id, title }) =>
    noteStorage.renamePage(notebookId, sectionId, id, title));

  ipcMain.handle('lightnote:delete-page', async (_, { notebookId, sectionId, id }) => {
    const r = await noteStorage.softDeletePage(notebookId, sectionId, id); // → Trash
    noteIndexer.invalidateCache(id);
    // Links stay put while trashed (so restore re-attaches them); they simply
    // won't resolve in link lists until restored, and are dropped on purge.
    return r;
  });

  // === 휴지통 (Trash) ===
  ipcMain.handle('lightnote:trash:list', async () => noteStorage.listTrash());

  ipcMain.handle('lightnote:trash:restore', async (_, node) => {
    let r;
    if (node.type === 'page') r = await noteStorage.restorePage(node.notebookId, node.sectionId, node.pageId);
    else if (node.type === 'section') r = await noteStorage.restoreSection(node.notebookId, node.sectionId);
    else if (node.type === 'notebook') r = await noteStorage.restoreNotebook(node.notebookId);
    else r = { success: false };
    noteIndexer.clearCache();
    return r || { success: false };
  });

  const dropRefsAndIndex = (pageIds) => {
    for (const pid of pageIds) { linkStorage.removePageLinks(pid); noteIndexer.invalidateCache(pid); }
    // Permanently deleted pages lose their work-object metadata too (no orphans).
    workObjectStorage.removeMany(pageIds).catch((e) => console.error('workObject cleanup:', e));
    referenceStorage.removeMany(pageIds).catch((e) => console.error('reference cleanup:', e));
    pageVersions.removeAll(pageIds).catch((e) => console.error('version cleanup:', e));
    attachments.removeAll(pageIds).catch((e) => console.error('attachment cleanup:', e));
  };

  ipcMain.handle('lightnote:trash:purge', async (_, node) => {
    let res;
    if (node.type === 'page') res = await noteStorage.purgePage(node.notebookId, node.sectionId, node.pageId);
    else if (node.type === 'section') res = await noteStorage.purgeSection(node.notebookId, node.sectionId);
    else if (node.type === 'notebook') res = await noteStorage.purgeNotebook(node.notebookId);
    else res = { pageIds: [] };
    dropRefsAndIndex(res.pageIds || []);
    noteIndexer.clearCache();
    return { success: true };
  });

  ipcMain.handle('lightnote:trash:empty', async () => {
    const r = await noteStorage.emptyTrash();
    dropRefsAndIndex(r.pageIds || []);
    noteIndexer.clearCache();
    return { success: true, count: r.count };
  });

  // === 검색 (title + body, AND across whitespace/.,-separated terms) ===
  ipcMain.handle('lightnote:search-notes', async (_, { query }) => {
    const terms = String(query || '').toLowerCase().split(/[\s.,]+/).filter(Boolean);
    if (terms.length === 0) return [];
    const results = [];
    for (const nb of await noteStorage.getVisibleNotebooks()) {
      for (const sec of await noteStorage.getVisibleSections(nb.id)) {
        for (const pg of await noteStorage.getVisiblePages(nb.id, sec.id)) {
          let text = '';
          try {
            const content = await noteStorage.loadPage(nb.id, sec.id, pg.id);
            text = (content.delta?.ops || []).filter(o => typeof o.insert === 'string').map(o => o.insert).join('');
          } catch { /* skip unreadable page */ }
          // Search title + body + path (notebook / section names) so a term
          // like "Firmware" or "Begin" surfaces its pages too.
          const haystack = `${pg.title}\n${nb.name}\n${sec.name}\n${text}`.toLowerCase();
          if (!terms.every(t => haystack.includes(t))) continue;
          // Snippet around the first matching term found in the body.
          const lowBody = text.toLowerCase();
          let at = -1;
          for (const t of terms) { const i = lowBody.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; }
          const snippet = at >= 0
            ? (at > 25 ? '…' : '') + text.slice(Math.max(0, at - 25), at + 60).replace(/\s+/g, ' ').trim()
            : '';
          results.push({
            notebookId: nb.id, sectionId: sec.id, pageId: pg.id,
            title: pg.title, notebookName: nb.name, sectionName: sec.name, snippet,
          });
        }
      }
    }
    return results;
  });

  ipcMain.handle('lightnote:trash:get-retention', async () => ({ days: await noteStorage.getTrashRetentionDays() }));
  ipcMain.handle('lightnote:trash:set-retention', async (_, { days }) => noteStorage.setTrashRetentionDays(days));

  // === 업무 객체 (work object) — structured fields per page, AI-free ===
  ipcMain.handle('lightnote:work-object:get', async (_, { pageId }) => workObjectStorage.get(pageId));
  ipcMain.handle('lightnote:work-object:set', async (_, { pageId, patch }) => workObjectStorage.set(pageId, patch));
  ipcMain.handle('lightnote:work-object:remove', async (_, { pageId }) => workObjectStorage.remove(pageId));
  // Enriched list for the "업무 현황" dashboard: join each enabled work-object
  // with its (visible) page title + location in ONE pass over the tree. Pages in
  // the trash / deleted are excluded.
  ipcMain.handle('lightnote:work-object:list', async () => {
    const objs = await workObjectStorage.list();
    if (objs.length === 0) return [];
    const byId = new Map(objs.map(o => [o.pageId, o]));
    const out = [];
    for (const nb of await noteStorage.getVisibleNotebooks()) {
      for (const sec of await noteStorage.getVisibleSections(nb.id)) {
        for (const pg of await noteStorage.getVisiblePages(nb.id, sec.id)) {
          const o = byId.get(pg.id);
          if (o && o.enabled !== false) {
            out.push({ ...o, title: pg.title, notebookId: nb.id, sectionId: sec.id, notebookName: nb.name, sectionName: sec.name });
          }
        }
      }
    }
    return out;
  });

  // === 내보내기/가져오기 (page/section/notebook → single portable .json) ===
  // For moving work between independent installs (e.g. home PC → company PC)
  // with no shared backend — the user handles actual file transport (USB,
  // email, company file share…), the app only reads/writes the bundle file.
  ipcMain.handle('lightnote:export-node', async (_, { type, notebookId, sectionId, pageId, suggestedName }) => {
    if (!dialog) return { error: 'NO_DIALOG' };
    try {
      const bundle = type === 'page' ? await exportImport.exportPage(notebookId, sectionId, pageId)
        : type === 'section' ? await exportImport.exportSection(notebookId, sectionId)
        : type === 'notebook' ? await exportImport.exportNotebook(notebookId)
        : null;
      if (!bundle) return { error: 'INVALID_TYPE' };
      const win = getWindow();
      const res = await dialog.showSaveDialog(win || undefined, {
        title: '내보내기',
        defaultPath: `${(suggestedName || bundle.name || 'lightnote-export').replace(/[\\/:*?"<>|]/g, '_')}.lightnote.json`,
        filters: [{ name: 'LightNote Export', extensions: ['json'] }],
      });
      if (res.canceled || !res.filePath) return { canceled: true };
      await fs.writeFile(res.filePath, JSON.stringify(bundle, null, 2), 'utf-8');
      return { success: true, filePath: res.filePath };
    } catch (err) {
      return { error: err.message || 'EXPORT_FAILED' };
    }
  });

  ipcMain.handle('lightnote:import-bundle', async () => {
    if (!dialog) return { error: 'NO_DIALOG' };
    try {
      const win = getWindow();
      const res = await dialog.showOpenDialog(win || undefined, {
        title: '가져오기',
        properties: ['openFile'],
        filters: [{ name: 'LightNote Export', extensions: ['json'] }],
      });
      if (res.canceled || !res.filePaths?.length) return { canceled: true };
      const raw = await fs.readFile(res.filePaths[0], 'utf-8');
      let bundle;
      try { bundle = JSON.parse(raw); } catch { return { error: 'INVALID_JSON' }; }
      const result = await exportImport.importBundle(bundle);
      noteIndexer.clearCache();
      return { success: true, ...result };
    } catch (err) {
      return { error: err.message || 'IMPORT_FAILED' };
    }
  });

  // 업무 진행 현황 보고서 export (개조식 평문, .md) — selected pages from 업무 현황.
  ipcMain.handle('lightnote:export-report', async (_, { pageIds }) => {
    if (!dialog) return { error: 'NO_DIALOG' };
    if (!Array.isArray(pageIds) || pageIds.length === 0) return { error: 'NO_SELECTION' };
    try {
      const { text } = await reportExport.buildReport(pageIds);
      const win = getWindow();
      const today = new Date().toISOString().slice(0, 10);
      const res = await dialog.showSaveDialog(win || undefined, {
        title: '업무 진행 현황 보고서 내보내기',
        defaultPath: `업무진행현황_${today}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }, { name: 'Text', extensions: ['txt'] }],
      });
      if (res.canceled || !res.filePath) return { canceled: true };
      await fs.writeFile(res.filePath, text, 'utf-8');
      return { success: true, filePath: res.filePath };
    } catch (err) {
      return { error: err.message || 'EXPORT_FAILED' };
    }
  });

  // === 페이지 템플릿 ===
  // Templates are real pages living in a hidden notebook/section (see
  // noteStorage.ensureTemplateStore) — opening one for editing is therefore
  // an ordinary page-open (full TOC/work-object/reference parity), while
  // these handlers just adapt list/create/rename/delete to the old
  // {id, name, delta, at}-shaped template API the renderer already used.
  ipcMain.handle('lightnote:templates:store-location', async () => noteStorage.ensureTemplateStore());
  ipcMain.handle('lightnote:templates:list', async () => {
    const { notebookId, sectionId } = await noteStorage.ensureTemplateStore();
    const pages = await noteStorage.getVisiblePages(notebookId, sectionId);
    return pages.map((p) => ({ id: p.id, name: p.title, at: p.updatedAt }));
  });
  ipcMain.handle('lightnote:templates:get', async (_, { id }) => {
    const { notebookId, sectionId } = await noteStorage.ensureTemplateStore();
    const page = await noteStorage.loadPage(notebookId, sectionId, id);
    return page ? { id: page.id, name: page.title, delta: page.delta } : null;
  });
  ipcMain.handle('lightnote:templates:save', async (_, { name, delta }) => {
    const { notebookId, sectionId } = await noteStorage.ensureTemplateStore();
    const title = name || '템플릿';
    const meta = await noteStorage.createPage(notebookId, sectionId, title);
    await noteStorage.savePage(notebookId, sectionId, meta.id, delta, title);
    return { id: meta.id, name: title, at: meta.updatedAt };
  });
  ipcMain.handle('lightnote:templates:remove', async (_, { id }) => {
    const { notebookId, sectionId } = await noteStorage.ensureTemplateStore();
    await noteStorage.deletePage(notebookId, sectionId, id);
    return { success: true };
  });
  ipcMain.handle('lightnote:templates:rename', async (_, { id, name }) => {
    const { notebookId, sectionId } = await noteStorage.ensureTemplateStore();
    const page = await noteStorage.renamePage(notebookId, sectionId, id, name);
    return page ? { id: page.id, name: page.title, at: page.updatedAt } : null;
  });

  // 업무 속성의 필드 섹션(배경/목적/진행 현황/Action Item/의사결정 필요 사항)을
  // PDF 맨 위 "업무 요약" 블록으로 그린다. buildFieldSections이 어떤 필드를
  // 거를지(미완료만/미해결만/시간순 등) 이미 정해두므로 여기선 HTML로 옮기기만
  // 한다 — "업무 진행 현황 보고서" export와 규칙이 어긋날 일이 없다.
  function workObjectSectionsHtml(sections) {
    if (!sections.length) return '';
    let out = '<div class="ln-pdf-wo"><h2 class="ln-pdf-wo-title">업무 요약</h2>';
    for (const s of sections) {
      if (s.lines === null) {
        out += `<p class="ln-pdf-wo-line">${escapeHtml(s.label)}</p>`;
        continue;
      }
      out += `<div class="ln-pdf-wo-field"><div class="ln-pdf-wo-label">${escapeHtml(s.label)}</div><ul>`;
      for (const line of s.lines) out += `<li>${escapeHtml(line.replace(/^- /, ''))}</li>`;
      out += '</ul></div>';
    }
    out += '</div><hr class="ln-pdf-wo-sep">';
    return out;
  }

  // === PDF 내보내기 ===
  // 편집기 본문 HTML을 그대로 넘겨받아, 화면 UI가 섞이지 않도록 보이지 않는
  // 창에 인쇄용 스타일로 렌더한 뒤 printToPDF 한다.
  ipcMain.handle('lightnote:export-pdf', async (_, { title, html, pageId }) => {
    if (!dialog) return { error: 'NO_DIALOG' };
    let win = null;
    try {
      const parent = getWindow();
      const res = await dialog.showSaveDialog(parent || undefined, {
        title: 'PDF로 내보내기',
        defaultPath: `${String(title || 'note').replace(/[\\/:*?"<>|]/g, '_')}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (res.canceled || !res.filePath) return { canceled: true };

      // 업무 속성이 켜져 있는 페이지면 본문 앞에 요약을 붙인다. 예전엔 편집기
      // 본문 HTML만 넘겨받아서, 오른쪽 열에 적어둔 배경/목적/할일 등은
      // PDF에 아예 나오지 않았다.
      let woHtml = '';
      if (pageId) {
        const wo = await workObjectStorage.get(pageId);
        if (wo && wo.enabled) woHtml = workObjectSectionsHtml(reportExport.buildFieldSections(wo));
      }

      const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title || '')}</title>
<style>
  @page { margin: 18mm 16mm; }
  body { font-family: 'Malgun Gothic', 'Segoe UI', sans-serif; color: #111; font-size: 11pt; line-height: 1.6; }
  h1.ln-doc-title { font-size: 18pt; margin: 0 0 14px; border-bottom: 1px solid #ccc; padding-bottom: 8px; }
  img { max-width: 100%; }
  table { border-collapse: collapse; }
  table td, table th { border: 1px solid #999; padding: 4px 6px; }
  blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 12px; color: #444; }
  pre, .ql-code-block-container { background: #f4f4f4; padding: 8px; border-radius: 4px; white-space: pre-wrap; }
  a { color: #0b57d0; }
  ol, ul { padding-left: 22px; }
  .ln-pdf-wo { margin-bottom: 6px; }
  .ln-pdf-wo-title { font-size: 12pt; margin: 0 0 8px; color: #333; }
  .ln-pdf-wo-line { margin: 0 0 6px; font-weight: 600; }
  .ln-pdf-wo-field { margin: 0 0 8px; }
  .ln-pdf-wo-label { font-weight: 600; margin-bottom: 2px; }
  .ln-pdf-wo-field ul { margin: 0; padding-left: 20px; }
  .ln-pdf-wo-sep { border: none; border-top: 1px solid #ccc; margin: 14px 0; }
</style></head>
<body><h1 class="ln-doc-title">${escapeHtml(title || '')}</h1>${woHtml}${html || ''}</body></html>`;

      const { BrowserWindow } = require('electron');
      win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, javascript: false } });
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(doc));
      // Give embedded images a beat to decode before capturing.
      await new Promise((r) => setTimeout(r, 350));
      const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
      await fs.writeFile(res.filePath, pdf);
      return { success: true, filePath: res.filePath };
    } catch (err) {
      return { error: err.message || 'PDF_FAILED' };
    } finally {
      if (win && !win.isDestroyed()) win.destroy();
    }
  });

  // === 파일 첨부 (이미지 외 문서: PDF/xlsx/…) ===
  // 파일은 페이지 폴더로 복사하고, 델타에는 링크만 남긴다(노트 JSON 비대화 방지).
  ipcMain.handle('lightnote:attach:pick', async (_, { pageId }) => {
    if (!dialog) return { error: 'NO_DIALOG' };
    try {
      const win = getWindow();
      const res = await dialog.showOpenDialog(win || undefined, {
        title: '파일 첨부', properties: ['openFile', 'multiSelections'],
      });
      if (res.canceled || !res.filePaths?.length) return { canceled: true };
      const added = [];
      for (const p of res.filePaths) added.push(await attachments.add(pageId, p));
      return { success: true, files: added };
    } catch (err) {
      return { error: err.message || 'ATTACH_FAILED' };
    }
  });

  ipcMain.handle('lightnote:attach:open', async (_, { pageId, stored }) => {
    const full = attachments.resolve(pageId, stored);
    if (!full) return { error: 'BAD_PATH' };
    if (!(await attachments.exists(pageId, stored))) return { error: 'MISSING' };
    const err = await shell.openPath(full);
    return err ? { error: err } : { success: true };
  });

  ipcMain.handle('lightnote:attach:reveal', async (_, { pageId, stored }) => {
    const full = attachments.resolve(pageId, stored);
    if (!full) return { error: 'BAD_PATH' };
    shell.showItemInFolder(full);
    return { success: true };
  });

  // === 참조 (논문식 [1] 각주) ===
  // 본문 마커는 참조 id를 들고 있고, 화면에 보이는 번호는 본문 등장 순서로
  // 그때그때 계산한다 — 그래서 중간에 인용을 끼워 넣어도 저장값을 건드릴
  // 필요가 없다.
  ipcMain.handle('lightnote:refs:list', async (_, { pageId }) => referenceStorage.list(pageId));
  ipcMain.handle('lightnote:refs:add-text', async (_, { pageId, text, caption }) =>
    referenceStorage.add(pageId, { kind: 'text', text, caption }));
  ipcMain.handle('lightnote:refs:update', async (_, { pageId, id, patch }) =>
    referenceStorage.update(pageId, id, patch || {}));
  ipcMain.handle('lightnote:refs:remove', async (_, { pageId, id }) => referenceStorage.remove(pageId, id));
  ipcMain.handle('lightnote:refs:image', async (_, { pageId, file }) => referenceStorage.imageDataUrl(pageId, file));

  // 클립보드에서 바로 붙여넣은 이미지(캡처 등) — data URI로 받아 파일로 떨군다.
  ipcMain.handle('lightnote:refs:add-image-data', async (_, { pageId, dataUrl, caption }) => {
    const m = /^data:image\/([a-z0-9+.-]+);base64,(.+)$/i.exec(String(dataUrl || ''));
    if (!m) return { error: 'BAD_IMAGE' };
    const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
    return referenceStorage.addImage(pageId, Buffer.from(m[2], 'base64'), ext, caption);
  });

  // 이미지 파일을 골라 참조로 등록.
  ipcMain.handle('lightnote:refs:add-image-file', async (_, { pageId }) => {
    if (!dialog) return { error: 'NO_DIALOG' };
    try {
      const res = await dialog.showOpenDialog(getWindow() || undefined, {
        title: '참조 이미지 선택',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
      });
      if (res.canceled || !res.filePaths?.length) return { canceled: true };
      const added = [];
      for (const p of res.filePaths) {
        const { stored, name } = await attachments.add(pageId, p);
        added.push(await referenceStorage.add(pageId, { kind: 'image', file: stored, caption: name }));
      }
      return { success: true, refs: added };
    } catch (err) {
      return { error: err.message || 'REF_IMAGE_FAILED' };
    }
  });

  // 사용자 폰트 폴더 — %APPDATA%/lightnote/fonts 에 넣은 폰트 파일을 스캔해
  // data: URI로 돌려준다(파일 시스템 워처 없음: 다음 실행부터 반영).
  ipcMain.handle('lightnote:fonts:list', async () => customFonts.list());
  ipcMain.handle('lightnote:fonts:open-folder', async () => {
    await customFonts.ensureDir();
    const err = await shell.openPath(customFonts.folderPath());
    return err ? { error: err } : { success: true };
  });

  // Calendar bridge (only meaningful when embedded in the DSP planner). All local
  // IPC — no AI. Gated in the UI on scheduler availability.
  const priToTask = (p) => (p === '상' ? 'urgent' : p === '하' ? 'low' : 'normal');
  ipcMain.handle('lightnote:work-object:scheduler-available', async () => ({ available: !!(scheduler && scheduler.createTask) }));
  ipcMain.handle('lightnote:work-object:create-task', async (_, { title, due, priority }) => {
    if (!scheduler?.createTask) return { error: 'NO_SCHEDULER' };
    const task = scheduler.createTask({ title: String(title || 'Untitled').slice(0, 200), due_at: due ?? null, priority: priToTask(priority) });
    scheduler.refresh?.();
    return { taskId: task?.id ?? null };
  });
  ipcMain.handle('lightnote:work-object:complete-task', async (_, { taskId }) => {
    if (!scheduler?.completeTask) return { error: 'NO_SCHEDULER' };
    return scheduler.completeTask(taskId) || { done: false };
  });
  ipcMain.handle('lightnote:work-object:task-status', async (_, { taskId }) => {
    if (!scheduler?.getTask) return null;
    return scheduler.getTask(taskId);
  });

  ipcMain.handle('lightnote:duplicate-page', async (_, { notebookId, sectionId, id }) =>
    noteStorage.duplicatePage(notebookId, sectionId, id));

  ipcMain.handle('lightnote:move-section', async (_, { srcNbId, secId, dstNbId, dstParentId }) => {
    const r = await noteStorage.moveSection(srcNbId, secId, dstNbId, dstParentId);
    noteIndexer.clearCache();
    return r || { error: 'MOVE_FAILED' };
  });

  ipcMain.handle('lightnote:reorder-section', async (_, { nbId, secId, refSecId, placeAfter }) =>
    (await noteStorage.reorderSection(nbId, secId, refSecId, placeAfter)) || { error: 'REORDER_FAILED' });

  ipcMain.handle('lightnote:move-page', async (_, { srcNbId, srcSecId, pageId, dstNbId, dstSecId }) => {
    const r = await noteStorage.movePage(srcNbId, srcSecId, pageId, dstNbId, dstSecId);
    if (r) noteIndexer.invalidateCache(pageId);
    return r || { error: 'MOVE_FAILED' };
  });

  ipcMain.handle('lightnote:reorder-page', async (_, { nbId, secId, pageId, refPageId, placeAfter }) =>
    (await noteStorage.reorderPage(nbId, secId, pageId, refPageId, placeAfter)) || { error: 'REORDER_FAILED' });

  // Page ↔ page links (separate from event/task links)
  ipcMain.handle('lightnote:page-refs:get', async (_, { pageId }) => {
    const ids = await noteStorage.getPageRefs(pageId);
    const out = [];
    for (const id of ids) { const loc = await noteStorage.findPageLocation(id); if (loc) out.push(loc); }
    return out;
  });
  ipcMain.handle('lightnote:page-refs:add', async (_, { a, b }) => { await noteStorage.addPageRef(a, b); return { success: true }; });
  ipcMain.handle('lightnote:page-refs:remove', async (_, { a, b }) => { await noteStorage.removePageRef(a, b); return { success: true }; });

  // === 이미지 ===
  ipcMain.handle('lightnote:save-image', async (_, data) =>
    imageHandler.saveImage(data));

  // === AI Assistant ===
  ipcMain.handle('lightnote:search', async (_, { question, useWebSearch }) => {
    const apiKey = storage.loadApiKey();
    if (!apiKey) return { error: 'NO_API_KEY', message: 'Set your API key first.' };

    try {
      const refPages = await noteIndexer.getRelevantPages(question);

      if (!useWebSearch && refPages.length === 0) {
        getWindow()?.webContents.send('lightnote:search-chunk', {
          text: "I couldn't find related notes. Turn on 🌐 Web search, or write more notes and try again.",
          done: true,
        });
        getWindow()?.webContents.send('lightnote:search-refs', { pages: [] });
        return { success: true };
      }

      // Sources are numbered [1..n]; each carries its linked event/task context so
      // the AI understands which schedule item a note belongs to.
      const filesForGemini = refPages.map((p, idx) => {
        const linkCtx = scheduler?.pageLinks?.(p.pageId) || '';
        return {
          name: `[${idx + 1}] ${p.notebookName}/${p.sectionName}/${p.pageName}`,
          content: linkCtx ? `${p.text}\n${linkCtx}` : p.text,
          path: p.path,
          isVirtual: true,
        };
      });

      // Make the AI calendar-aware: today + upcoming events + open tasks.
      const digest = scheduler?.scheduleDigest?.() || '';
      const extraContext = digest ? `[Your schedule]\n${digest}` : '';

      if (useWebSearch) {
        const webResult = await geminiService.queryWithWebSearch(question, filesForGemini, (chunk) => {
          getWindow()?.webContents.send('lightnote:search-chunk', chunk);
        }, extraContext);
        if (webResult?.webSources?.length > 0) {
          getWindow()?.webContents.send('lightnote:search-web-refs', { sources: webResult.webSources });
        }
      } else {
        await geminiService.queryWithFiles(question, filesForGemini, (chunk) => {
          getWindow()?.webContents.send('lightnote:search-chunk', chunk);
        }, extraContext);
      }

      // Send ALL retrieved pages in order so a citation [n] always maps to refs[n-1].
      getWindow()?.webContents.send('lightnote:search-refs', {
        pages: refPages.map((p) => ({
          notebookId: p.notebookId, sectionId: p.sectionId, pageId: p.pageId,
          pageName: p.pageName, path: p.path, text: p.text,
        })),
      });
      return { success: true };
    } catch (err) {
      const messages = {
        RATE_LIMIT: 'Requests are too frequent. Please try again shortly.',
        INVALID_API_KEY: 'Your API key is invalid. Check Settings.',
        API_NOT_INITIALIZED: 'Set your API key first.',
      };
      getWindow()?.webContents.send('lightnote:search-chunk', {
        text: messages[err.message] || 'An error occurred: ' + err.message,
        done: true,
      });
      getWindow()?.webContents.send('lightnote:search-refs', { pages: [] });
      return { error: err.message };
    }
  });

  // === AI: extract action items (tasks/events) from a note — confirm before write ===
  ipcMain.handle('lightnote:extract-actions', async (_, { text }) => {
    const apiKey = storage.loadApiKey();
    if (!apiKey) return { error: 'NO_API_KEY' };
    if (!text || !text.trim()) return { tasks: [], events: [] };
    try {
      return await geminiService.extractActions(text);
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('lightnote:apply-actions', async (_, { tasks, events }) => {
    const endOfDay = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return new Date(y, m - 1, d, 23, 59, 59, 999).getTime(); };
    const dateTime = (ymd, hm) => { const [y, m, d] = String(ymd).split('-').map(Number); const [h, mi] = String(hm || '09:00').split(':').map(Number); return new Date(y, m - 1, d, h || 0, mi || 0).getTime(); };
    const validPri = (p) => (['urgent', 'normal', 'low'].includes(p) ? p : 'normal');
    let created = 0;
    try {
      for (const t of (tasks || [])) {
        if (!t?.title) continue;
        scheduler?.createTask?.({ title: String(t.title), due_at: t.dueDate ? endOfDay(t.dueDate) : null, priority: validPri(t.priority) });
        created++;
      }
      for (const e of (events || [])) {
        if (!e?.title || !e?.date) continue;
        const start = dateTime(e.date, e.start);
        const end = e.end ? dateTime(e.date, e.end) : start + 3600000;
        scheduler?.createEvent?.({ title: String(e.title), start_at: start, end_at: end });
        created++;
      }
      if (created > 0) scheduler?.refresh?.();
      return { created };
    } catch (err) {
      return { error: err.message, created };
    }
  });

  // === AI: brief / agenda for an event or task from its linked notes ===
  ipcMain.handle('lightnote:brief', async (_, { kind, itemId }) => {
    const apiKey = storage.loadApiKey();
    if (!apiKey) return { error: 'NO_API_KEY' };
    try {
      const item = scheduler?.getItem?.(kind, itemId);
      if (!item) return { error: 'NOT_FOUND' };
      const refs = linkStorage.getLinksByItem(kind, itemId) || [];
      const notes = [];
      for (const ref of refs) {
        try {
          const content = await noteStorage.loadPage(ref.notebookId, ref.sectionId, ref.pageId);
          const text = (content.delta?.ops || []).filter(o => typeof o.insert === 'string').map(o => o.insert).join('').trim();
          if (text) notes.push(`# ${content.title || 'Untitled'}\n${text}`);
        } catch { /* skip */ }
      }
      const when = kind === 'event'
        ? `scheduled for ${new Date(item.start_at).toLocaleString()}${item.location ? ` at ${item.location}` : ''}`
        : (item.due_at ? `due ${new Date(item.due_at).toLocaleDateString()}` : 'with no due date');
      const ctx = `${kind === 'event' ? 'Event' : 'Task'}: "${item.title}" (${when}).\n\n`
        + (notes.length ? `Linked notes:\n${notes.join('\n\n---\n\n')}` : 'No linked notes are attached.');
      const r = await geminiService.generateBrief(ctx);
      return { text: r.fullText };
    } catch (err) {
      return { error: err.message };
    }
  });

  // === 페이지 정리 ===
  ipcMain.handle('lightnote:organize-page', async (_, { title, text }) => {
    const apiKey = storage.loadApiKey();
    if (!apiKey) return { error: 'NO_API_KEY', message: 'API 키를 먼저 설정해주세요.' };

    try {
      await geminiService.organizeContent(title, text, (chunk) => {
        getWindow()?.webContents.send('lightnote:organize-chunk', chunk);
      });
      return { success: true };
    } catch (err) {
      const messages = {
        RATE_LIMIT: '요청이 너무 빠릅니다. 잠시 후 다시 시도해주세요.',
        INVALID_API_KEY: 'API 키가 올바르지 않습니다. 설정을 확인해주세요.',
        API_NOT_INITIALIZED: 'API 키를 먼저 설정해주세요.',
      };
      getWindow()?.webContents.send('lightnote:organize-chunk', {
        text: '',
        done: true,
        error: messages[err.message] || err.message,
      });
      return { error: err.message };
    }
  });

  // === 외부 링크 열기 ===
  ipcMain.handle('lightnote:open-external', async (_, { url }) => {
    shell.openExternal(url);
  });

  // === API 키 ===
  ipcMain.handle('lightnote:save-api-key', async (_, { key }) => {
    const res = await geminiService.testApiKey(key);
    // Only refuse when the key is genuinely rejected. If we just couldn't verify
    // (offline / region / quota), still save it — a real key must not be blocked.
    if (res.reason === 'INVALID_KEY') return { success: false, error: 'INVALID_KEY', message: res.message };
    storage.saveApiKey(key);
    geminiService.init(key);
    return { success: true, verified: !!res.ok, warning: res.ok ? undefined : res.message };
  });

  ipcMain.handle('lightnote:check-api-key', async () => ({ exists: storage.hasApiKey() }));

  // === 설정 ===
  ipcMain.handle('lightnote:get-last-opened', async () => noteStorage.getLastOpened());

  // 열려 있는 탭 목록 — 앱을 다시 켜도 같은 작업 세트로 돌아오게 한다.
  ipcMain.handle('lightnote:get-open-tabs', async () => noteStorage.getOpenTabs());
  ipcMain.handle('lightnote:save-open-tabs', async (_, { tabs }) => noteStorage.saveOpenTabs(tabs));

  // === 노트 링크 ===
  ipcMain.handle('lightnote:links:add', async (_, { pageId, notebookId, sectionId, kind, itemId }) => {
    linkStorage.addLink(pageId, notebookId, sectionId, kind, itemId);
    return { success: true };
  });

  ipcMain.handle('lightnote:links:remove', async (_, { pageId, kind, itemId }) => {
    linkStorage.removeLink(pageId, kind, itemId);
    return { success: true };
  });

  ipcMain.handle('lightnote:links:by-page', async (_, { pageId }) => {
    return linkStorage.getLinksByPage(pageId) || { pageId, linkedEvents: [], linkedTasks: [] };
  });

  ipcMain.handle('lightnote:links:by-item', async (_, { kind, itemId }) => {
    const refs = linkStorage.getLinksByItem(kind, itemId);
    const result = [];
    for (const ref of refs) {
      try {
        const pages = await noteStorage.getVisiblePages(ref.notebookId, ref.sectionId);
        const page = pages.find(p => p.id === ref.pageId);
        if (!page) continue; // skip trashed / missing pages
        const notebooks = await noteStorage.getVisibleNotebooks();
        const nb = notebooks.find(n => n.id === ref.notebookId);
        const sections = await noteStorage.getVisibleSections(ref.notebookId);
        const sec = sections.find(s => s.id === ref.sectionId);
        if (!nb || !sec) continue; // notebook/section is trashed
        result.push({
          pageId: ref.pageId, notebookId: ref.notebookId, sectionId: ref.sectionId,
          title: page.title,
          notebookName: nb?.name ?? '', sectionName: sec?.name ?? '',
        });
      } catch {}
    }
    return result;
  });

  ipcMain.handle('lightnote:links:list-pages', async () => {
    const result = [];
    try {
      const notebooks = await noteStorage.getVisibleNotebooks();
      for (const nb of notebooks) {
        const sections = await noteStorage.getVisibleSections(nb.id);
        for (const sec of sections) {
          const pages = await noteStorage.getVisiblePages(nb.id, sec.id);
          for (const page of pages) {
            result.push({
              pageId: page.id, notebookId: nb.id, sectionId: sec.id,
              title: page.title, notebookName: nb.name, sectionName: sec.name,
            });
          }
        }
      }
    } catch {}
    return result;
  });

  // Create a brand-new LightNote page and immediately link it to an event/task.
  // Used by the planner's "+ New" note button. Returns the new page's ids.
  ipcMain.handle('lightnote:links:create-page', async (_, { kind, itemId, title, meta }) => {
    const notebooks = await noteStorage.getNotebooks();
    let nb = notebooks.find(n => n.name === 'Schedule Notes' || n.name === '일정 노트') || notebooks[0];
    if (!nb) nb = await noteStorage.createNotebook('Schedule Notes', '#5b5fc7');
    const sections = await noteStorage.getSections(nb.id);
    let sec = sections[0];
    if (!sec) sec = await noteStorage.createSection(nb.id, 'Notes', null);
    const heading = (title && title.trim()) || 'Untitled';
    const page = await noteStorage.createPage(nb.id, sec.id, heading);
    // Seed the body with an origin header (title + assigned time / due date) so notes
    // created from an event/task are visually distinct from notes written in LightNote.
    const ops = [{ insert: heading }, { insert: '\n', attributes: { header: 2 } }];
    if (meta) ops.push({ insert: meta, attributes: { italic: true } }, { insert: '\n' });
    ops.push({ insert: '\n' });
    await noteStorage.savePage(nb.id, sec.id, page.id, { ops }, heading);
    linkStorage.addLink(page.id, nb.id, sec.id, kind, itemId);
    return { pageId: page.id, notebookId: nb.id, sectionId: sec.id, title: page.title };
  });
}

module.exports = { registerIpcHandlers };
