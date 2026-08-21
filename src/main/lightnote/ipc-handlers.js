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
const path = require('path');
const fs = require('fs').promises;
const { shell } = require('electron');

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
  storage.init(safeStorage);
  // Seed the fixed PARA notebooks if they don't exist yet (built-in defaults).
  noteStorage.ensureDefaultNotebooks().catch((e) => console.error('ensureDefaultNotebooks:', e));

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

  ipcMain.handle('lightnote:create-page', async (_, { notebookId, sectionId, title }) =>
    noteStorage.createPage(notebookId, sectionId, title || '제목 없음'));

  ipcMain.handle('lightnote:load-page', async (_, { notebookId, sectionId, pageId }) => {
    await noteStorage.saveLastOpened(notebookId, sectionId, pageId);
    return noteStorage.loadPage(notebookId, sectionId, pageId);
  });

  ipcMain.handle('lightnote:save-page', async (_, { notebookId, sectionId, pageId, delta, title }) => {
    const result = await noteStorage.savePage(notebookId, sectionId, pageId, delta, title);
    noteIndexer.invalidateCache(pageId);
    return result;
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
