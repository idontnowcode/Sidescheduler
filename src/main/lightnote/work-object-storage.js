// Work-object metadata ("업무 객체") for LightNote pages.
// Stored SEPARATELY from the page delta in a single file so it's easy to list,
// clean up, and back up: work-objects.json = { [pageId(UUID)]: WorkObject }.
// Keyed by the page's UUID so it survives note move/rename. AI-free.
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

let DATA_ROOT = '';

function init(dataRoot) {
  DATA_ROOT = dataRoot;
}

function filePath() { return path.join(DATA_ROOT, 'work-objects.json'); }

/** 늘 디스크에서 다시 읽는다 — 메모리에 들고 있으면 안 된다.
 *
 *  예전에는 한 번 읽은 맵을 캐시로 들고 있다가 통째로 다시 썼다. 그러면 이
 *  파일이 바깥에서 바뀐 걸 끝내 모른다. 아침에 회사에서 앱을 켜 두고 집에서
 *  하루치 업무 속성을 고친 뒤, 저녁에 회사 PC에서 속성 하나만 건드리면 아침
 *  스냅샷이 통째로 쓰여 하루치가 사라졌다. 맵이 작아(노트당 객체 하나) 매번
 *  읽어도 체감되지 않는다. */
async function readAll() {
  try {
    return JSON.parse(await fs.readFile(filePath(), 'utf-8')) || {};
  } catch {
    return {};
  }
}

async function writeAll(map) {
  const p = filePath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  // 같은 파일을 동시에 두 번 저장하면 임시 파일 이름이 겹쳐 한쪽이 ENOENT 로 실패했다 — 매번 다른 이름
  const tmp = p + '.' + process.pid + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(map, null, 2));
  try {
    await fs.rename(tmp, p);
  } catch {
    await fs.copyFile(tmp, p);
    try { await fs.unlink(tmp); } catch {}
  }
}

// A blank work object — only "status" has a default; every other field is
// empty so there's no input friction (spec: no required fields).
function blank() {
  return {
    enabled: true,          // is the property panel shown for this note
    status: '예정',          // 예정 / 진행중 / 대기 / 완료 / 보류
    priority: '',           // 상 / 중 / 하 / ''
    due: null,              // timestamp | null
    start: null,            // timestamp | null (UI defaults to note creation)
    doneAt: null,           // set when status → 완료; kept if reverted (spec)
    nextActions: [],        // [{ id, text, done, doneAt }]
    decisions: [],          // [{ id, at, text }]  (history log)
    depts: '',              // 관련 부서/담당 (free text)
    docs: '',               // 관련 문서 메모 (legacy free text, kept for migration)
    docLinks: [],           // 관련 문서 링크 [{ id, kind:'url'|'page', label, url?, pageId?, notebookId?, sectionId? }]
    relatedPages: [],       // [pageId] internal note links
    // 보고용 정리 (report export) — 자유 텍스트 2개 + 로그 2개. 전부 AI-free.
    background: '',         // 업무 배경
    purpose: '',            // 업무 목적
    progressLog: [],        // [{ id, at, text }] 진행 현황 — decisions와 동일 구조, export 시 전체 노출
    pendingDecisions: [],   // [{ id, text, raisedAt, resolved, resolvedAt }] 의사결정 필요사항 — export 시 미해결만
    calendarLink: null,     // linked planner task id (Phase 3)
    updatedAt: Date.now(),
  };
}

// Records created before a field existed (e.g. progressLog/pendingDecisions,
// added later) are missing that key entirely in the stored JSON — readAll()
// just returns whatever's on disk verbatim. Merge over blank() on every read
// so callers always get a fully-shaped object, regardless of when it was
// created; otherwise a renderer doing `wo.progressLog.map(...)` on an old
// record throws on undefined and blanks the whole panel.
function withDefaults(stored) { return { ...blank(), ...stored }; }

async function get(pageId) {
  const map = await readAll();
  return map[pageId] ? withDefaults(map[pageId]) : null;
}

// Merge a partial patch onto the stored object (creating it from blank() if new),
// always stamping updatedAt. Returns the saved object. Backfills any fields
// missing from an old pre-existing record (see withDefaults) so the record is
// fully-shaped on disk from this write onward — self-healing on next touch.
async function set(pageId, patch) {
  if (!pageId) throw new Error('pageId required');
  const map = await readAll();
  const base = withDefaults(map[pageId] || {});
  const next = { ...base, ...(patch || {}), updatedAt: Date.now() };
  map[pageId] = next;
  await writeAll(map);
  return next;
}

// Permanently remove a page's work object (used on page purge / explicit delete).
async function remove(pageId) {
  const map = await readAll();
  if (!(pageId in map)) return { success: true };
  delete map[pageId];
  await writeAll(map);
  return { success: true };
}

async function removeMany(pageIds) {
  const map = await readAll();
  let changed = false;
  for (const id of pageIds || []) { if (id in map) { delete map[id]; changed = true; } }
  if (changed) await writeAll(map);
  return { success: true };
}

// Full list as an array with pageId attached (for the Phase 4 list view).
async function list() {
  const map = await readAll();
  return Object.entries(map).map(([pageId, wo]) => ({ pageId, ...withDefaults(wo) }));
}

function newId() { return crypto.randomUUID(); }

module.exports = { init, blank, get, set, remove, removeMany, list, newId };
