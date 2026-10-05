// Export/import a page, section (+ subtree), or notebook as a single portable
// JSON bundle — for moving work between independent installs (e.g. home PC →
// company PC) with no shared backend. Images are already embedded as base64
// data URLs inside each page's delta (see Editor.tsx insertImageFile), so
// bundles are fully self-contained; no separate asset files to carry along.
//
// 가져오기는 두 가지 방식이 있다:
//  • 'copy'  — 예전부터의 기본 동작. 전부 새 id로 새 노트북을 만든다. 같은
//              파일을 두 번 가져오면 독립된 복사본이 둘 생긴다.
//  • 'update' — 번들에 실린 pageId가 이미 내 라이브러리에 있으면 그 페이지를
//              제자리에서 갱신한다(원래 노트북/섹션 위치를 그대로 둔다).
// 페이지 id는 만들 때부터 UUID로 붙고 이동·이름변경에도 안 바뀌므로, 집↔회사
// 처럼 백엔드를 공유하지 않는 설치본 사이에서도 "같은 문서"를 식별할 수 있다.
// 덮어쓰기 전에는 항상 버전 스냅샷을 남겨 되돌릴 수 있게 한다.
const noteStorage = require('./note-storage');
const workObjectStorage = require('./work-object-storage');
const pageVersions = require('./page-versions');

// v2에서 페이지마다 updatedAt을 싣기 시작했다(어느 쪽이 최신인지 보여주려고).
// v1 번들에는 그 값이 없을 뿐, 그대로 읽을 수 있다.
const FORMAT_VERSION = 2;
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
  return {
    id: pageId, title: content.title, delta: content.delta,
    updatedAt: content.updatedAt || null,
    workObject: sanitizeWorkObject(wo),
  };
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

function assertBundle(bundle) {
  if (!bundle || bundle.kind !== 'lightnote-export' || !Array.isArray(bundle.pages)) {
    throw new Error('INVALID_FORMAT');
  }
}

/** 번들에 실린 페이지 중 이미 내 라이브러리에 있는 것(= 같은 pageId)을 찾아
 *  둔다. 가져오기 전에 "업데이트할지 새 복사본으로 둘지"를 물어보기 위한 것. */
async function inspectBundle(bundle) {
  assertBundle(bundle);
  const conflicts = [];
  for (const p of bundle.pages) {
    if (!p.id) continue;
    const loc = await noteStorage.findPageLocation(p.id);
    if (!loc) continue;
    const content = await noteStorage.loadPage(loc.notebookId, loc.sectionId, loc.pageId).catch(() => null);
    conflicts.push({
      pageId: p.id,
      incomingTitle: p.title || '제목 없음',
      incomingUpdatedAt: p.updatedAt || null,
      existingTitle: loc.title,
      existingUpdatedAt: (content && content.updatedAt) || null,
      notebookName: loc.notebookName,
      sectionName: loc.sectionName,
    });
  }
  return { total: bundle.pages.length, conflicts };
}

/** 겹치는 페이지를 제자리에서 갱신한다. 덮어쓰기 전에 스냅샷을 남겨
 *  페이지 기록에서 되돌릴 수 있게 한다. */
async function updateExistingPage(loc, p) {
  const prev = await noteStorage.loadPage(loc.notebookId, loc.sectionId, loc.pageId).catch(() => null);
  if (prev) {
    try { await pageVersions.snapshot(loc.pageId, prev, true); } catch { /* 스냅샷 실패가 갱신을 막진 않는다 */ }
  }
  const title = p.title || loc.title || '제목 없음';
  const delta = p.delta || { ops: [{ insert: '\n' }] };
  await noteStorage.savePage(loc.notebookId, loc.sectionId, loc.pageId, delta, title);
  if (p.workObject) await workObjectStorage.set(loc.pageId, p.workObject);
}

/**
 * Import a bundle.
 *  mode 'copy'   — 전부 새 id로 새 노트북을 만든다(예전 기본 동작).
 *  mode 'update' — 이미 있는 pageId는 제자리 갱신하고, 처음 보는 페이지만
 *                  새 노트북에 모아 넣는다. 겹치는 게 하나도 없으면 'copy'와
 *                  같은 결과가 된다.
 */
async function importBundle(bundle, mode = 'copy') {
  assertBundle(bundle);

  if (mode === 'update') {
    const fresh = [];
    let updated = 0;
    for (const p of bundle.pages) {
      const loc = p.id ? await noteStorage.findPageLocation(p.id) : null;
      if (loc) { await updateExistingPage(loc, p); updated++; }
      else fresh.push(p);
    }
    if (fresh.length === 0) return { mode, updated, pageCount: 0, notebookId: null, notebookName: null };
    // 처음 보는 페이지만 따로 담아 평소대로 새 노트북을 만든다.
    const rest = await importBundle({ ...bundle, pages: fresh }, 'copy');
    return { ...rest, mode, updated };
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

  return { mode: 'copy', updated: 0, notebookId: nb.id, notebookName, pageCount, sectionCount: idMap.size || 1 };
}

module.exports = { exportPage, exportSection, exportNotebook, inspectBundle, importBundle };
