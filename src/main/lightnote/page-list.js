// 페이지 리스트 칸이 읽는 세 가지 목록 — 즐겨찾기 · 최근 편집 · 인박스.
//
// 트리(노트북 › 섹션 › 페이지)는 "어디에 뒀는지 알 때" 쓰는 것이다. 이 세
// 목록은 모를 때 쓴다: 늘 보는 것(즐겨찾기), 방금까지 보던 것(최근 편집),
// 아직 어디 둘지 못 정한 것(인박스).
//
// 셋 다 **보통 페이지**를 가리킨다. 따로 저장소를 만들지 않아서 검색·
// 내보내기·업무 속성·휴지통에 전부 그대로 걸린다. AI-free.
const path = require('path');
const fs = require('fs').promises;
const noteStorage = require('./note-storage');
const journal = require('./journal');

// 인박스도 노트북 하나다(스티커의 "메모"와 같은 방식). 그래야 분류가
// "노트북 사이 이동"이라는 이미 있는 동작 하나로 끝난다.
const INBOX_NOTEBOOK = '인박스';
const INBOX_COLOR = '#845ef7';
const INBOX_SECTION = '분류 전';
const UNTITLED = '새 메모';

let DATA_ROOT = '';

function init(dataRoot) {
  DATA_ROOT = dataRoot;
}

function favPath() { return path.join(DATA_ROOT, 'favorites.json'); }

/** 늘 디스크에서 다시 읽는다 — work-objects.json과 같은 이유로, 메모리에
 *  들고 있으면 다른 PC에서 더한 즐겨찾기를 통째로 덮어쓴다. */
async function readFavorites() {
  try {
    const raw = JSON.parse(await fs.readFile(favPath(), 'utf-8'));
    if (Array.isArray(raw)) {
      // 옛 모양(배열)도 읽어 준다 — 순서는 있는 그대로.
      const map = {};
      raw.forEach((id, i) => { map[id] = i + 1; });
      return map;
    }
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

async function writeFavorites(map) {
  const p = favPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(map, null, 2));
  try {
    await fs.rename(tmp, p);
  } catch {
    await fs.copyFile(tmp, p);
    try { await fs.unlink(tmp); } catch { /* ignore */ }
  }
}

async function favoriteIds() {
  return Object.keys(await readFavorites());
}

async function setFavorite(pageId, on) {
  if (!pageId) return { favorite: false };
  const map = await readFavorites();
  if (on) map[pageId] = Date.now();
  else delete map[pageId];
  await writeFavorites(map);
  return { favorite: !!on };
}

async function toggleFavorite(pageId) {
  const map = await readFavorites();
  return setFavorite(pageId, !(pageId in map));
}

/** 페이지가 영영 사라질 때(휴지통 비우기 등) 같이 지운다. */
async function removeMany(pageIds) {
  if (!pageIds || !pageIds.length) return;
  const map = await readFavorites();
  let hit = false;
  for (const id of pageIds) if (id in map) { delete map[id]; hit = true; }
  if (hit) await writeFavorites(map);
}

/** 보이는 페이지를 전부 훑는다. 본문은 읽지 않는다(목록에 쓸 정보만). */
async function walkPages({ skipJournal = false } = {}) {
  const out = [];
  for (const nb of await noteStorage.getVisibleNotebooks()) {
    if (skipJournal && nb.name === journal.NOTEBOOK_NAME) continue;
    for (const sec of await noteStorage.getVisibleSections(nb.id)) {
      for (const pg of await noteStorage.getVisiblePages(nb.id, sec.id)) {
        out.push({
          pageId: pg.id, notebookId: nb.id, sectionId: sec.id,
          title: pg.title, notebookName: nb.name, sectionName: sec.name,
          updatedAt: pg.updatedAt || pg.createdAt || 0,
          createdAt: pg.createdAt || 0,
        });
      }
    }
  }
  return out;
}

async function inboxNotebookId() {
  const nbs = await noteStorage.getVisibleNotebooks();
  const nb = nbs.find((n) => n.name === INBOX_NOTEBOOK);
  return nb ? nb.id : null;
}

/**
 * @param {'fav'|'recent'|'inbox'|'folder'} mode
 * @param {number} [limit]
 * @param {{notebookId: string, sectionId: string}} [scope]  mode==='folder'일 때
 * @returns {Promise<Array>} 화면에 그대로 그릴 수 있는 행들
 */
async function list(mode, limit, scope) {
  const cap = Math.max(1, Math.min(500, limit || 60));

  // 지금 보고 있는 페이지가 든 폴더 — 원노트처럼 "옆에 뭐가 있는지"를 보여
  // 준다. 줄 세우는 순서는 **트리와 같아야** 한다(직접 끌어 옮겨 둔 순서다).
  // 같은 폴더가 두 군데서 다른 순서로 보이면 둘 다 못 믿게 된다.
  if (mode === 'folder') {
    if (!scope || !scope.notebookId || !scope.sectionId) return [];
    const nbs = await noteStorage.getVisibleNotebooks();
    const nb = nbs.find((n) => n.id === scope.notebookId);
    if (!nb) return [];
    const secs = await noteStorage.getVisibleSections(nb.id);
    const sec = secs.find((x) => x.id === scope.sectionId);
    if (!sec) return [];
    const map = await readFavorites();
    const pages = await noteStorage.getVisiblePages(nb.id, sec.id);
    return pages.slice(0, cap).map((pg) => ({
      pageId: pg.id, notebookId: nb.id, sectionId: sec.id,
      title: pg.title, notebookName: nb.name, sectionName: sec.name,
      updatedAt: pg.updatedAt || pg.createdAt || 0,
      createdAt: pg.createdAt || 0,
      favorite: pg.id in map,
    }));
  }

  if (mode === 'fav') {
    const map = await readFavorites();
    const ids = Object.keys(map);
    if (!ids.length) return [];
    // 즐겨찾기는 기록장 페이지라도 뺄 이유가 없다 — 직접 별을 단 것이니까.
    const rows = (await walkPages()).filter((r) => r.pageId in map);
    rows.sort((a, b) => (map[b.pageId] || 0) - (map[a.pageId] || 0));
    // 사라진 페이지의 별은 조용히 정리한다(목록에 유령이 남지 않게).
    if (rows.length !== ids.length) {
      const alive = new Set(rows.map((r) => r.pageId));
      const next = {};
      for (const id of ids) if (alive.has(id)) next[id] = map[id];
      await writeFavorites(next);
    }
    return rows.slice(0, cap).map((r) => ({ ...r, favorite: true }));
  }

  if (mode === 'inbox') {
    const nbId = await inboxNotebookId();
    if (!nbId) return [];
    const map = await readFavorites();
    const rows = (await walkPages()).filter((r) => r.notebookId === nbId);
    // 인박스는 **들어온 순서**가 중요하다(오래 묵은 게 위로 올라와야 치운다).
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows.slice(0, cap).map((r) => ({ ...r, favorite: r.pageId in map }));
  }

  // recent — 기록장은 뺀다. 날짜 페이지는 매일 쓰여서, 넣어두면 목록이
  // 날짜로만 채워지고 정작 찾던 노트가 밀려난다.
  const map = await readFavorites();
  const rows = await walkPages({ skipJournal: true });
  rows.sort((a, b) => b.updatedAt - a.updatedAt);
  return rows.slice(0, cap).map((r) => ({ ...r, favorite: r.pageId in map }));
}

/** 왼쪽 맨 위 목록에 달아 둘 숫자. 인박스는 "쌓이면 치워야 한다"는 걸
 *  숫자로 알려야 쌓인 줄 안다. */
async function counts() {
  const map = await readFavorites();
  const nbId = await inboxNotebookId();
  let all = 0, inbox = 0, fav = 0;
  for (const r of await walkPages()) {
    all += 1;
    if (r.pageId in map) fav += 1;
    if (nbId && r.notebookId === nbId) inbox += 1;
  }
  return { all, fav, inbox };
}

async function ensureInbox() {
  const nbs = await noteStorage.getNotebooks();
  const found = nbs.find((n) => n.name === INBOX_NOTEBOOK && !n.deletedAt);
  const nb = found || await noteStorage.createNotebook(INBOX_NOTEBOOK, INBOX_COLOR);
  const secs = await noteStorage.getSections(nb.id);
  const sec = secs.find((s) => s.name === INBOX_SECTION && !s.deletedAt)
    || secs.find((s) => !s.deletedAt)
    || await noteStorage.createSection(nb.id, INBOX_SECTION, null);
  return { notebookId: nb.id, sectionId: sec.id };
}

/** 인박스에 한 장 만든다. 제목이 비면 "새 메모" — 본문 첫 줄로 곧 바뀐다. */
async function inboxNew(title) {
  const { notebookId, sectionId } = await ensureInbox();
  const name = String(title || '').trim().slice(0, 100) || UNTITLED;
  const page = await noteStorage.createPage(notebookId, sectionId, name);
  return { notebookId, sectionId, pageId: page.id, title: name };
}

module.exports = {
  INBOX_NOTEBOOK, INBOX_SECTION, UNTITLED,
  init, favoriteIds, setFavorite, toggleFavorite, removeMany,
  list, counts, ensureInbox, inboxNew,
};
