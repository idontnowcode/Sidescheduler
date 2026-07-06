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

async function createNotebook(name, color = '#5b5fc7', builtin = false) {
  const notebooks = await getNotebooks();
  const id = crypto.randomUUID();
  const now = Date.now();
  const notebook = { id, name, color, createdAt: now, updatedAt: now, order: notebooks.length };
  if (builtin) notebook.builtin = true;
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
  if (nb.builtin) return nb; // fixed default PARA notebook — not renamable
  nb.name = name;
  nb.updatedAt = Date.now();
  await writeJson(notebooksPath(), notebooks);
  return nb;
}

/** Pin/unpin a user notebook so it sorts to the top of the user group. */
async function setNotebookPinned(id, pinned) {
  const notebooks = await getNotebooks();
  const nb = notebooks.find(n => n.id === id);
  if (!nb || nb.builtin) return nb || null; // built-ins are already pinned to top
  if (pinned) nb.pinned = true; else delete nb.pinned;
  nb.updatedAt = Date.now();
  await writeJson(notebooksPath(), notebooks);
  return nb;
}

/** Apply a new display order to user notebooks (ids in desired order). */
async function reorderNotebooks(ids) {
  const notebooks = await getNotebooks();
  const orderMap = new Map(ids.map((id, i) => [id, i]));
  for (const nb of notebooks) if (orderMap.has(nb.id)) nb.order = orderMap.get(nb.id);
  await writeJson(notebooksPath(), notebooks);
  return { success: true };
}

async function deleteNotebook(id) {
  const notebooks = await getNotebooks();
  const nb = notebooks.find(n => n.id === id);
  if (nb && nb.builtin) return; // fixed default PARA notebook — not deletable
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

/**
 * Reorder a folder within a sibling list: place `secId` right before/after
 * `refSecId` at the same level (ref's parent), and renumber that group's order.
 * Same notebook only. Refuses if ref is a descendant of the moving folder.
 */
async function reorderSection(nbId, secId, refSecId, placeAfter) {
  const secs = await getSections(nbId);
  const moving = secs.find(s => s.id === secId);
  const ref = secs.find(s => s.id === refSecId);
  if (!moving || !ref || secId === refSecId) return null;
  if (collectSubtree(secs, secId).has(refSecId)) return { error: 'CYCLE' };
  const parentId = ref.parentId || null;
  moving.parentId = parentId;
  moving.updatedAt = Date.now();
  // Rebuild the sibling order for this level.
  const siblings = secs.filter(s => (s.parentId || null) === parentId && s.id !== secId);
  const idx = siblings.findIndex(s => s.id === refSecId);
  siblings.splice(placeAfter ? idx + 1 : idx, 0, moving);
  siblings.forEach((s, i) => { s.order = i; });
  await writeJson(sectionsPath(nbId), secs);
  return { success: true };
}

/** Collect a section id + all its descendant section ids. */
function collectSubtree(sections, rootId) {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of sections) {
      if (s.parentId && ids.has(s.parentId) && !ids.has(s.id)) { ids.add(s.id); changed = true; }
    }
  }
  return ids;
}

/**
 * Move a folder (section) — with all its subfolders and pages — to a new home:
 * another notebook's root (dstParentId = null) or under another section.
 * Same-notebook moves just re-parent; cross-notebook moves also relocate the
 * section directories. Refuses to move a folder into itself or a descendant.
 */
async function moveSection(srcNbId, secId, dstNbId, dstParentId) {
  const srcSecs = await getSections(srcNbId);
  const root = srcSecs.find(s => s.id === secId);
  if (!root) return null;

  if (srcNbId === dstNbId) {
    const subIds = collectSubtree(srcSecs, secId);
    if (dstParentId && subIds.has(dstParentId)) return { error: 'CYCLE' };
    if ((root.parentId || null) === (dstParentId || null)) return { success: true };
    root.parentId = dstParentId || null;
    root.updatedAt = Date.now();
    await writeJson(sectionsPath(srcNbId), srcSecs);
    return { success: true };
  }

  // Cross-notebook: move the whole subtree's meta + directories.
  const subIds = collectSubtree(srcSecs, secId);
  const dstSecs = await getSections(dstNbId);
  const moving = srcSecs.filter(s => subIds.has(s.id));
  const remaining = srcSecs.filter(s => !subIds.has(s.id));
  moving.forEach(s => { if (s.id === secId) { s.parentId = dstParentId || null; s.updatedAt = Date.now(); } });
  await writeJson(sectionsPath(srcNbId), remaining);
  await writeJson(sectionsPath(dstNbId), [...dstSecs, ...moving]);
  for (const s of moving) {
    const from = sectionDir(srcNbId, s.id);
    const to = sectionDir(dstNbId, s.id);
    try {
      await fs.mkdir(path.dirname(to), { recursive: true });
      try { await fs.rename(from, to); }
      catch { await fs.cp(from, to, { recursive: true }); await fs.rm(from, { recursive: true, force: true }); }
    } catch { /* best effort */ }
  }
  return { success: true };
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

async function duplicatePage(notebookId, sectionId, pageId) {
  const src = await loadPage(notebookId, sectionId, pageId);
  const pages = await getPages(notebookId, sectionId);
  const id = crypto.randomUUID();
  const now = Date.now();
  const title = `${src.title || '제목 없음'} (copy)`;
  const meta = { id, title, createdAt: now, updatedAt: now, order: pages.length };
  pages.push(meta);
  await writeJson(pagesPath(notebookId, sectionId), pages);
  await writeJson(pageJsonPath(notebookId, sectionId, id), { id, title, delta: src.delta, updatedAt: now });
  await fs.mkdir(pageImagesDir(notebookId, sectionId, id), { recursive: true });
  return meta;
}

/** Move a page to another section (and/or notebook). */
async function movePage(srcNbId, srcSecId, pageId, dstNbId, dstSecId) {
  if (srcNbId === dstNbId && srcSecId === dstSecId) return null;
  const data = await readJson(pageJsonPath(srcNbId, srcSecId, pageId));
  const srcPages = await getPages(srcNbId, srcSecId);
  const meta = srcPages.find(p => p.id === pageId);
  if (!data || !meta) return null;
  const dstPages = await getPages(dstNbId, dstSecId);
  await fs.mkdir(path.dirname(pageJsonPath(dstNbId, dstSecId, pageId)), { recursive: true });
  await writeJson(pageJsonPath(dstNbId, dstSecId, pageId), data);
  dstPages.push({ ...meta, order: dstPages.length, updatedAt: Date.now() });
  await writeJson(pagesPath(dstNbId, dstSecId), dstPages);
  await writeJson(pagesPath(srcNbId, srcSecId), srcPages.filter(p => p.id !== pageId));
  try { await fs.unlink(pageJsonPath(srcNbId, srcSecId, pageId)); } catch {}
  // Move the page's images directory. rename() needs the destination PARENT
  // (dstSec/pages/<pageId>) to already exist, otherwise it ENOENTs and the
  // image is silently lost (and left orphaned at the source). Create the
  // parent first, and fall back to recursive copy+remove for the cases where
  // rename fails (cross-device, AV lock, etc.).
  const srcImg = pageImagesDir(srcNbId, srcSecId, pageId);
  const dstImg = pageImagesDir(dstNbId, dstSecId, pageId);
  try {
    await fs.access(srcImg);                                   // has an images dir?
    await fs.mkdir(path.dirname(dstImg), { recursive: true }); // dstSec/pages/<pageId>
    try {
      await fs.rename(srcImg, dstImg);
    } catch {
      await fs.cp(srcImg, dstImg, { recursive: true });
      await fs.rm(srcImg, { recursive: true, force: true });
    }
  } catch { /* page has no images — nothing to move */ }
  return { id: pageId };
}

/** Locate a page by id (scans all notebooks/sections). */
async function findPageLocation(pageId) {
  const nbs = await getNotebooks();
  for (const nb of nbs) {
    const secs = await getSections(nb.id);
    for (const sec of secs) {
      const pages = await getPages(nb.id, sec.id);
      const pg = pages.find(p => p.id === pageId);
      if (pg) return { notebookId: nb.id, sectionId: sec.id, pageId, title: pg.title, notebookName: nb.name, sectionName: sec.name };
    }
  }
  return null;
}

// === PAGE ↔ PAGE LINKS (bidirectional, kept separate from event/task links) ===
function pageRefsPath() { return path.join(DATA_ROOT, 'page-refs.json'); }
async function loadPageRefs() { return (await readJson(pageRefsPath())) || {}; }
async function getPageRefs(pageId) { const m = await loadPageRefs(); return m[pageId] || []; }
async function addPageRef(a, b) {
  if (!a || !b || a === b) return;
  const m = await loadPageRefs();
  m[a] = [...new Set([...(m[a] || []), b])];
  m[b] = [...new Set([...(m[b] || []), a])];
  await writeJson(pageRefsPath(), m);
}
async function removePageRef(a, b) {
  const m = await loadPageRefs();
  if (m[a]) m[a] = m[a].filter(x => x !== b);
  if (m[b]) m[b] = m[b].filter(x => x !== a);
  await writeJson(pageRefsPath(), m);
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

// === DEFAULT (PARA) NOTEBOOKS =============================================
// The PARA method notebooks are fixed built-ins: seeded once, not renamable or
// deletable. They give every user a consistent top-level structure.
const PARA_DEFAULTS = [
  { name: 'Projects',  color: '#e8590c', intro: '# Projects\n\n지금 진행 중이고 마감이 있는 목표.\n- 명확한 결과와 기한이 있는 활동\n- 완료되면 Archives로 이동\n\n예: 앱 출시, 보고서 작성, 여행 준비' },
  { name: 'Areas',     color: '#5b5fc7', intro: '# Areas\n\n지속적으로 관리하는 책임 영역 (마감 없음).\n- 꾸준히 유지해야 하는 기준이 있는 영역\n\n예: 건강, 재무, 커리어, 가족' },
  { name: 'Resources', color: '#2f9e44', intro: '# Resources\n\n관심 주제·참고 자료 모음.\n- 나중에 쓸 수 있는 정보/템플릿/노하우\n\n예: 디자인 레퍼런스, 코드 스니펫, 아이디어' },
  { name: 'Archives',  color: '#868e96', intro: '# Archives\n\n완료·비활성 항목 보관소.\n- 위 세 곳에서 더 이상 활성이 아닌 것들\n\n예: 끝난 프로젝트, 예전 관심사' },
];

function introToDelta(intro) {
  return { ops: intro.split('\n').map(line => {
    const h = line.match(/^# (.+)/);
    if (h) return [{ insert: h[1] }, { insert: '\n', attributes: { header: 1 } }];
    const b = line.match(/^- (.+)/);
    if (b) return [{ insert: b[1] }, { insert: '\n', attributes: { list: 'bullet' } }];
    return [{ insert: line + '\n' }];
  }).flat() };
}

/** Ensure the PARA notebooks exist AND are flagged as fixed built-ins.
 *  Safe to call on every launch. Also upgrades legacy PARA notebooks that were
 *  created before the built-in flag existed, so they become non-deletable too. */
async function ensureDefaultNotebooks() {
  // 1) Create any missing PARA notebooks (with intro pages).
  const names = new Set((await getNotebooks()).map(n => n.name));
  for (const p of PARA_DEFAULTS) {
    if (names.has(p.name)) continue;
    const nb = await createNotebook(p.name, p.color, true);
    const sec = await createSection(nb.id, 'Overview', null);
    const page = await createPage(nb.id, sec.id, `About ${p.name}`);
    await savePage(nb.id, sec.id, page.id, introToDelta(p.intro), `About ${p.name}`);
  }
  // 2) Upgrade any PARA-named notebook (incl. pre-existing ones) to built-in.
  const paraNames = new Set(PARA_DEFAULTS.map(p => p.name));
  const all = await getNotebooks();
  let mutated = false;
  for (const nb of all) {
    if (paraNames.has(nb.name) && !nb.builtin) { nb.builtin = true; mutated = true; }
  }
  if (mutated) await writeJson(notebooksPath(), all);
}

// === CLEANUP: de-duplicate pages that share the same id ====================
// A past move bug could write the same page id into several sections. The tree
// keys selection by page id, so clicking one highlighted them all. This scans
// for ids present in more than one place and resolves them: identical copies
// are removed (keep the first); copies whose content differs are given a fresh
// id so they become independent pages (non-destructive).
async function deduplicatePages() {
  const nbs = await getNotebooks();
  const seen = new Map(); // id -> [{ nbId, secId }]
  for (const nb of nbs) {
    for (const sec of await getSections(nb.id)) {
      const pages = await getPages(nb.id, sec.id);
      // Collapse duplicate id entries WITHIN this section's meta first.
      const uniq = []; const local = new Set();
      for (const p of pages) { if (local.has(p.id)) continue; local.add(p.id); uniq.push(p); }
      if (uniq.length !== pages.length) await writeJson(pagesPath(nb.id, sec.id), uniq);
      for (const p of uniq) {
        if (!seen.has(p.id)) seen.set(p.id, []);
        seen.get(p.id).push({ nbId: nb.id, secId: sec.id });
      }
    }
  }
  let removed = 0, separated = 0;
  for (const [id, locs] of seen) {
    if (locs.length <= 1) continue;
    const keep = locs[0];
    const keepData = await readJson(pageJsonPath(keep.nbId, keep.secId, id));
    for (let i = 1; i < locs.length; i++) {
      const { nbId, secId } = locs[i];
      const data = await readJson(pageJsonPath(nbId, secId, id));
      const identical = JSON.stringify(data?.delta) === JSON.stringify(keepData?.delta);
      if (identical) {
        await deletePage(nbId, secId, id);
        removed++;
      } else {
        // Re-id this copy so it stands on its own.
        const pages = await getPages(nbId, secId);
        const meta = pages.find(p => p.id === id);
        if (data && meta) {
          const newId = crypto.randomUUID();
          meta.id = newId;
          await writeJson(pagesPath(nbId, secId), pages);
          await writeJson(pageJsonPath(nbId, secId, newId), { ...data, id: newId });
          try { await fs.unlink(pageJsonPath(nbId, secId, id)); } catch {}
          try { await fs.rename(pageImagesDir(nbId, secId, id), pageImagesDir(nbId, secId, newId)); } catch {}
          separated++;
        }
      }
    }
  }
  return { removed, separated };
}

module.exports = {
  init, ensureDefaultNotebooks, deduplicatePages, getNotebooks, createNotebook, renameNotebook, deleteNotebook,
  setNotebookPinned, reorderNotebooks,
  getSections, createSection, renameSection, deleteSection, moveSection, reorderSection,
  getPages, createPage, loadPage, savePage, renamePage, deletePage,
  duplicatePage, movePage, findPageLocation,
  getPageRefs, addPageRef, removePageRef,
  getLastOpened, saveLastOpened,
};
