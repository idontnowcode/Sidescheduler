const noteStorage = require('./note-storage');
const imageHandler = require('./image-handler');
const noteIndexer = require('./note-indexer');
const geminiService = require('./gemini-service');
const storage = require('./storage');
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
function registerIpcHandlers(ipcMain, getWindow, safeStorage, dialog, app) {
  // Data root: use appData so it matches the standalone LightNote install location
  const DATA_ROOT = path.join(app.getPath('appData'), 'lightnote', 'lightnote-data');

  noteStorage.init(DATA_ROOT);
  imageHandler.init(DATA_ROOT);
  storage.init(safeStorage);

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
    return { success: true };
  });

  // === 이미지 ===
  ipcMain.handle('lightnote:save-image', async (_, data) =>
    imageHandler.saveImage(data));

  // === AI Assistant ===
  ipcMain.handle('lightnote:search', async (_, { question, useWebSearch }) => {
    const apiKey = storage.loadApiKey();
    if (!apiKey) return { error: 'NO_API_KEY', message: 'API 키를 먼저 설정해주세요.' };

    try {
      const refPages = await noteIndexer.getRelevantPages(question);

      if (!useWebSearch && refPages.length === 0) {
        getWindow()?.webContents.send('lightnote:search-chunk', {
          text: '노트에서 관련 내용을 찾지 못했습니다. 🌐 웹 검색을 켜거나, 더 많은 노트를 작성한 뒤 다시 시도해보세요.',
          done: true,
        });
        getWindow()?.webContents.send('lightnote:search-refs', { pages: [] });
        return { success: true };
      }

      const filesForGemini = refPages.map((p, idx) => ({
        name: `출처 [${idx + 1}] - ${p.notebookName}/${p.sectionName}/${p.pageName}`,
        content: p.text,
        path: p.path,
        isVirtual: true,
      }));

      let citedPages = [];

      if (useWebSearch) {
        const webResult = await geminiService.queryWithWebSearch(question, filesForGemini, (chunk) => {
          getWindow()?.webContents.send('lightnote:search-chunk', chunk);
        });
        if (webResult?.webSources?.length > 0) {
          getWindow()?.webContents.send('lightnote:search-web-refs', { sources: webResult.webSources });
        }
        citedPages = [];
      } else {
        const noteResult = await geminiService.queryWithFiles(question, filesForGemini, (chunk) => {
          getWindow()?.webContents.send('lightnote:search-chunk', chunk);
        });
        const resultText = noteResult?.fullText || '';
        const citedNums = new Set();
        for (const m of resultText.matchAll(/\[(\d+)\]/g)) {
          citedNums.add(parseInt(m[1], 10));
        }
        citedPages = refPages.filter((_, idx) => citedNums.has(idx + 1));
      }

      getWindow()?.webContents.send('lightnote:search-refs', { pages: citedPages });
      return { success: true };
    } catch (err) {
      const messages = {
        RATE_LIMIT: '요청이 너무 빠릅니다. 잠시 후 다시 시도해주세요.',
        INVALID_API_KEY: 'API 키가 올바르지 않습니다. 설정을 확인해주세요.',
        API_NOT_INITIALIZED: 'API 키를 먼저 설정해주세요.',
      };
      getWindow()?.webContents.send('lightnote:search-chunk', {
        text: messages[err.message] || '오류가 발생했습니다: ' + err.message,
        done: true,
      });
      getWindow()?.webContents.send('lightnote:search-refs', { pages: [] });
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
    const isValid = await geminiService.testApiKey(key);
    if (!isValid) return { success: false, error: 'INVALID_KEY' };
    storage.saveApiKey(key);
    geminiService.init(key);
    return { success: true };
  });

  ipcMain.handle('lightnote:check-api-key', async () => ({ exists: storage.hasApiKey() }));

  // === 설정 ===
  ipcMain.handle('lightnote:get-last-opened', async () => noteStorage.getLastOpened());
}

module.exports = { registerIpcHandlers };
