const noteStorage = require('./note-storage');
const imageHandler = require('./image-handler');
const noteIndexer = require('./note-indexer');
const geminiService = require('./gemini-service');
const storage = require('./storage');
const linkStorage = require('./link-storage');
const path = require('path');
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
  const DATA_ROOT = path.join(app.getPath('appData'), 'lightnote', 'lightnote-data');

  noteStorage.init(DATA_ROOT);
  imageHandler.init(DATA_ROOT);
  linkStorage.init(DATA_ROOT);
  storage.init(safeStorage);
  // Seed the fixed PARA notebooks if they don't exist yet (built-in defaults).
  noteStorage.ensureDefaultNotebooks().catch((e) => console.error('ensureDefaultNotebooks:', e));

  const existingKey = storage.loadApiKey();
  if (existingKey) geminiService.init(existingKey);

  // === 노트북 ===
  ipcMain.handle('lightnote:get-notebooks', async () => noteStorage.getNotebooks());

  ipcMain.handle('lightnote:create-notebook', async (_, { name, color }) =>
    noteStorage.createNotebook(name, color));

  ipcMain.handle('lightnote:rename-notebook', async (_, { id, name }) =>
    noteStorage.renameNotebook(id, name));

  ipcMain.handle('lightnote:delete-notebook', async (_, { id }) => {
    await noteStorage.deleteNotebook(id);
    noteIndexer.clearCache();
    return { success: true };
  });

  // One-off cleanup for pages duplicated by the old move bug (shared ids).
  ipcMain.handle('lightnote:dedup-pages', async () => {
    const r = await noteStorage.deduplicatePages();
    noteIndexer.clearCache();
    return r;
  });

  // === 섹션 ===
  ipcMain.handle('lightnote:get-sections', async (_, { notebookId }) =>
    noteStorage.getSections(notebookId));

  ipcMain.handle('lightnote:create-section', async (_, { notebookId, name, parentId }) =>
    noteStorage.createSection(notebookId, name, parentId || null));

  ipcMain.handle('lightnote:rename-section', async (_, { notebookId, id, name }) =>
    noteStorage.renameSection(notebookId, id, name));

  ipcMain.handle('lightnote:delete-section', async (_, { notebookId, id }) => {
    await noteStorage.deleteSection(notebookId, id);
    noteIndexer.clearCache();
    return { success: true };
  });

  // === 페이지 ===
  ipcMain.handle('lightnote:get-pages', async (_, { notebookId, sectionId }) =>
    noteStorage.getPages(notebookId, sectionId));

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
    await noteStorage.deletePage(notebookId, sectionId, id);
    noteIndexer.invalidateCache(id);
    linkStorage.removePageLinks(id); // drop event/task links pointing at the deleted page
    return { success: true };
  });

  ipcMain.handle('lightnote:duplicate-page', async (_, { notebookId, sectionId, id }) =>
    noteStorage.duplicatePage(notebookId, sectionId, id));

  ipcMain.handle('lightnote:move-page', async (_, { srcNbId, srcSecId, pageId, dstNbId, dstSecId }) => {
    const r = await noteStorage.movePage(srcNbId, srcSecId, pageId, dstNbId, dstSecId);
    if (r) noteIndexer.invalidateCache(pageId);
    return r || { error: 'MOVE_FAILED' };
  });

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
        const pages = await noteStorage.getPages(ref.notebookId, ref.sectionId);
        const page = pages.find(p => p.id === ref.pageId);
        if (!page) continue;
        const notebooks = await noteStorage.getNotebooks();
        const nb = notebooks.find(n => n.id === ref.notebookId);
        const sections = await noteStorage.getSections(ref.notebookId);
        const sec = sections.find(s => s.id === ref.sectionId);
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
      const notebooks = await noteStorage.getNotebooks();
      for (const nb of notebooks) {
        const sections = await noteStorage.getSections(nb.id);
        for (const sec of sections) {
          const pages = await noteStorage.getPages(nb.id, sec.id);
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
