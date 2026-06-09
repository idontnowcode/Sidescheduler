const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

let DATA_ROOT = '';

/**
 * Initialize with an explicit data root path.
 * @param {string} dataRoot  absolute path to the lightnote-data directory
 */
function init(dataRoot) {
  DATA_ROOT = dataRoot;
}

async function readJson(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  try {
    await fs.rename(tmp, filePath);
  } catch {
    await fs.copyFile(tmp, filePath);
    try { await fs.unlink(tmp); } catch {}
  }
}

// === NOTEBOOKS ===
function notebooksPath() { return path.join(DATA_ROOT, 'notebooks.json'); }
function notebookDir(id) { return path.join(DATA_ROOT, 'notebooks', id); }

async function getNotebooks() {
  return (await readJson(notebooksPath())) || [];
}

async function createNotebook(name, color = '#5b5fc7') {
  const notebooks = await getNotebooks();
  const id = crypto.randomUUID();
  const now = Date.now();
  const notebook = { id, name, color, createdAt: now, updatedAt: now, order: notebooks.length };
  notebooks.push(notebook);
  await writeJson(notebooksPath(), notebooks);
  await fs.mkdir(path.join(notebookDir(id), 'sections'), { recursive: true });
  await writeJson(path.join(notebookDir(id), 'sections.json'), []);
  return notebook;
}

async function renameNotebook(id, name) {
  const notebooks = await getNotebooks();
  const nb = notebooks.find(n => n.id === id);
  if (!nb) return null;
  nb.name = name;
  nb.updatedAt = Date.now();
  await writeJson(notebooksPath(), notebooks);
  return nb;
}

async function deleteNotebook(id) {
  const notebooks = await getNotebooks();
  await writeJson(notebooksPath(), notebooks.filter(n => n.id !== id));
  try { await fs.rm(notebookDir(id), { recursive: true, force: true }); } catch {}
}

// === SECTIONS ===
function sectionsPath(notebookId) { return path.join(notebookDir(notebookId), 'sections.json'); }
function sectionDir(notebookId, id) { return path.join(notebookDir(notebookId), 'sections', id); }

async function getSections(notebookId) {
  return (await readJson(sectionsPath(notebookId))) || [];
}

async function createSection(notebookId, name, parentId = null) {
  const sections = await getSections(notebookId);
  const id = crypto.randomUUID();
  const now = Date.now();
  const section = {
    id, name,
    parentId: parentId || null,
    createdAt: now, updatedAt: now,
    order: sections.length,
  };
  sections.push(section);
  await writeJson(sectionsPath(notebookId), sections);
  await fs.mkdir(path.join(sectionDir(notebookId, id), 'pages'), { recursive: true });
  await writeJson(path.join(sectionDir(notebookId, id), 'pages.json'), []);
  return section;
}

async function renameSection(notebookId, id, name) {
  const sections = await getSections(notebookId);
  const sec = sections.find(s => s.id === id);
  if (!sec) return null;
  sec.name = name;
  sec.updatedAt = Date.now();
  await writeJson(sectionsPath(notebookId), sections);
  return sec;
}

async function deleteSection(notebookId, id) {
  const sections = await getSections(notebookId);
  const toDelete = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of sections) {
      if (s.parentId && toDelete.has(s.parentId) && !toDelete.has(s.id)) {
        toDelete.add(s.id);
        changed = true;
      }
    }
  }
  await writeJson(sectionsPath(notebookId), sections.filter(s => !toDelete.has(s.id)));
  for (const secId of toDelete) {
    try { await fs.rm(sectionDir(notebookId, secId), { recursive: true, force: true }); } catch {}
  }
}

// === PAGES ===
function pagesPath(notebookId, sectionId) { return path.join(sectionDir(notebookId, sectionId), 'pages.json'); }
function pageJsonPath(notebookId, sectionId, pageId) { return path.join(sectionDir(notebookId, sectionId), 'pages', pageId + '.json'); }
function pageImagesDir(notebookId, sectionId, pageId) { return path.join(sectionDir(notebookId, sectionId), 'pages', pageId, 'images'); }

async function getPages(notebookId, sectionId) {
  return (await readJson(pagesPath(notebookId, sectionId))) || [];
}

async function createPage(notebookId, sectionId, title = '제목 없음') {
  const pages = await getPages(notebookId, sectionId);
  const id = crypto.randomUUID();
  const now = Date.now();
  const pageMeta = { id, title, createdAt: now, updatedAt: now, order: pages.length };
  pages.push(pageMeta);
  await writeJson(pagesPath(notebookId, sectionId), pages);
  await writeJson(pageJsonPath(notebookId, sectionId, id), {
    id, title, delta: { ops: [{ insert: '\n' }] }, updatedAt: now,
  });
  await fs.mkdir(pageImagesDir(notebookId, sectionId, id), { recursive: true });
  return pageMeta;
}

async function loadPage(notebookId, sectionId, pageId) {
  const data = await readJson(pageJsonPath(notebookId, sectionId, pageId));
  return data || { id: pageId, title: '제목 없음', delta: { ops: [{ insert: '\n' }] }, updatedAt: Date.now() };
}

async function savePage(notebookId, sectionId, pageId, delta, title) {
  const now = Date.now();
  const pagePath = pageJsonPath(notebookId, sectionId, pageId);
  await fs.mkdir(path.dirname(pagePath), { recursive: true });
  const tmp = pagePath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify({ id: pageId, title, delta, updatedAt: now }, null, 2));
  try {
    await fs.rename(tmp, pagePath);
  } catch {
    await fs.copyFile(tmp, pagePath);
    try { await fs.unlink(tmp); } catch {}
  }
  const pages = await getPages(notebookId, sectionId);
  const page = pages.find(p => p.id === pageId);
  if (page) {
    page.title = title;
    page.updatedAt = now;
    await writeJson(pagesPath(notebookId, sectionId), pages);
  }
  return { success: true };
}

async function renamePage(notebookId, sectionId, pageId, title) {
  const pages = await getPages(notebookId, sectionId);
  const page = pages.find(p => p.id === pageId);
  if (!page) return null;
  page.title = title;
  page.updatedAt = Date.now();
  await writeJson(pagesPath(notebookId, sectionId), pages);
  const content = await loadPage(notebookId, sectionId, pageId);
  content.title = title;
  content.updatedAt = page.updatedAt;
  await writeJson(pageJsonPath(notebookId, sectionId, pageId), content);
  return page;
}

async function deletePage(notebookId, sectionId, pageId) {
  const pages = await getPages(notebookId, sectionId);
  await writeJson(pagesPath(notebookId, sectionId), pages.filter(p => p.id !== pageId));
  try { await fs.unlink(pageJsonPath(notebookId, sectionId, pageId)); } catch {}
  try { await fs.rm(pageImagesDir(notebookId, sectionId, pageId), { recursive: true, force: true }); } catch {}
}

// === SETTINGS ===
function settingsPath() { return path.join(DATA_ROOT, 'settings.json'); }

async function getLastOpened() {
  const data = await readJson(settingsPath());
  return data?.lastOpened || null;
}

async function saveLastOpened(notebookId, sectionId, pageId) {
  const data = (await readJson(settingsPath())) || {};
  data.lastOpened = { notebookId, sectionId, pageId };
  await writeJson(settingsPath(), data);
}

module.exports = {
  init, getNotebooks, createNotebook, renameNotebook, deleteNotebook,
  getSections, createSection, renameSection, deleteSection,
  getPages, createPage, loadPage, savePage, renamePage, deletePage,
  getLastOpened, saveLastOpened,
};
