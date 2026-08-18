// Export/import a page, section (+ subtree), or notebook as a single portable
// JSON bundle — for moving work between independent installs (e.g. home PC →
// company PC) with no shared backend. Images are already embedded as base64
// data URLs inside each page's delta (see Editor.tsx insertImageFile), so
// bundles are fully self-contained; no separate asset files to carry along.
//
// Import always creates a BRAND-NEW notebook with fresh ids for everything —
// never merges into or overwrites existing content, so re-importing the same
// file twice just yields two independent copies (spec: "항상 새 복사본으로 추가").
const noteStorage = require('./note-storage');
const workObjectStorage = require('./work-object-storage');

const FORMAT_VERSION = 1;
const COLORS = ['#4dabf7', '#69db7c', '#ffa94d', '#da77f2', '#f783ac', '#a9e34b', '#66d9e8', '#ffd43b'];

/** Collect a section id + all its descendant section ids (local helper —
 *  mirrors note-storage's private collectSubtree, kept independent so this
 *  module doesn't reach into another module's internals). */
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

// Strip cross-machine references that would dangle on the destination install:
// linked planner tasks (calendarLink / per-action taskId — those ids belong to
// the SOURCE machine's planner.json) and doc-links that point at other
// LightNote pages (pageId there is only meaningful within the source library).
// External URL doc-links and everything else (status, dates, decisions…) are
// portable as-is.
function sanitizeWorkObject(wo) {
  if (!wo) return null;
  const { calendarLink, nextActions, docLinks, relatedPages, ...rest } = wo;
  return {
    ...rest,
    calendarLink: null,
    nextActions: (nextActions || []).map((a) => ({ ...a, taskId: null })),
    docLinks: (docLinks || []).filter((l) => l.kind === 'url'),
    relatedPages: [],
  };
}

async function pagePayload(notebookId, sectionId, pageId) {
  const content = await noteStorage.loadPage(notebookId, sectionId, pageId);
  const wo = await workObjectStorage.get(pageId);
  return { id: pageId, title: content.title, delta: content.delta, workObject: sanitizeWorkObject(wo) };
}

async function exportPage(notebookId, sectionId, pageId) {
  const p = await pagePayload(notebookId, sectionId, pageId);
  return {
    kind: 'lightnote-export', version: FORMAT_VERSION, scope: 'page', exportedAt: Date.now(),
    name: p.title, color: null, sections: [], pages: [{ ...p, sectionId: null }],
  };
}

async function exportSection(notebookId, sectionId) {
  const allSecs = await noteStorage.getVisibleSections(notebookId);
  const subtreeIds = collectSubtree(allSecs, sectionId);
  const secs = allSecs.filter((s) => subtreeIds.has(s.id));
  const root = secs.find((s) => s.id === sectionId);
  const sections = secs.map((s) => ({ id: s.id, name: s.name, parentId: s.id === sectionId ? null : s.parentId }));
  const pages = [];
  for (const s of secs) {
    for (const p of await noteStorage.getVisiblePages(notebookId, s.id)) {
      pages.push({ ...(await pagePayload(notebookId, s.id, p.id)), sectionId: s.id });
    }
  }
  return {
    kind: 'lightnote-export', version: FORMAT_VERSION, scope: 'section', exportedAt: Date.now(),
    name: root ? root.name : 'Untitled', color: null, sections, pages,
  };
}

async function exportNotebook(notebookId) {
  const nb = (await noteStorage.getVisibleNotebooks()).find((n) => n.id === notebookId);
  const secs = await noteStorage.getVisibleSections(notebookId);
  const sections = secs.map((s) => ({ id: s.id, name: s.name, parentId: s.parentId || null }));
  const pages = [];
  for (const s of secs) {
    for (const p of await noteStorage.getVisiblePages(notebookId, s.id)) {
      pages.push({ ...(await pagePayload(notebookId, s.id, p.id)), sectionId: s.id });
    }
  }
  return {
    kind: 'lightnote-export', version: FORMAT_VERSION, scope: 'notebook', exportedAt: Date.now(),
    name: nb ? nb.name : 'Untitled', color: (nb && nb.color) || null, sections, pages,
  };
}

/**
 * Import a bundle: always creates a brand-new top-level notebook (fresh ids
 * throughout), recreates its section tree (parent-first), then its pages +
 * work objects. A pure page-scope bundle (no sections) gets one auto-created
 * holder section.
 */
async function importBundle(bundle) {
  if (!bundle || bundle.kind !== 'lightnote-export' || !Array.isArray(bundle.pages)) {
    throw new Error('INVALID_FORMAT');
  }
  const existing = await noteStorage.getNotebooks();
  const color = bundle.color || COLORS[existing.length % COLORS.length];
  const notebookName = bundle.scope === 'notebook' ? (bundle.name || 'Imported') : `가져옴: ${bundle.name || 'Untitled'}`;
  const nb = await noteStorage.createNotebook(notebookName, color);

  const idMap = new Map(); // bundle-local section id -> newly created section id
  let holderSectionId = null;
  const sections = Array.isArray(bundle.sections) ? bundle.sections : [];
  if (sections.length === 0) {
    const sec = await noteStorage.createSection(nb.id, '가져온 페이지', null);
    holderSectionId = sec.id;
  } else {
    const pending = [...sections];
    let guard = 0;
    while (pending.length && guard++ < 10000) {
      for (let i = pending.length - 1; i >= 0; i--) {
        const s = pending[i];
        if (s.parentId != null && !idMap.has(s.parentId)) continue; // parent not created yet
        const parentId = s.parentId != null ? idMap.get(s.parentId) : null;
        const created = await noteStorage.createSection(nb.id, s.name || 'Untitled', parentId);
        idMap.set(s.id, created.id);
        pending.splice(i, 1);
      }
    }
    if (pending.length) throw new Error('MALFORMED_SECTION_TREE'); // cyclic/dangling parentId — refuse rather than silently drop
  }

  let pageCount = 0;
  for (const p of bundle.pages) {
    const destSectionId = p.sectionId != null ? idMap.get(p.sectionId) : holderSectionId;
    if (!destSectionId) continue;
    const title = p.title || '제목 없음';
    const delta = p.delta || { ops: [{ insert: '\n' }] };
    const meta = await noteStorage.createPage(nb.id, destSectionId, title);
    await noteStorage.savePage(nb.id, destSectionId, meta.id, delta, title);
    if (p.workObject) await workObjectStorage.set(meta.id, p.workObject);
    pageCount++;
  }

  return { notebookId: nb.id, notebookName, pageCount, sectionCount: idMap.size || 1 };
}

module.exports = { exportPage, exportSection, exportNotebook, importBundle };
