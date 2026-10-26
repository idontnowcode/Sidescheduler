// 자료(웹·파일·폴더 링크) 저장소 — LinkMap 을 LightNote 로 옮긴 것.
// resources.json = { version, items[], tags[], exclusions[] } — 참조·업무 객체와 같은
// 사이드카 방식이다. 회사 PC·노트북이 같은 데이터 폴더를 쓰면 같이 보인다.
//
// 늘 디스크에서 다시 읽고(메모리에 들고 있지 않는다) 읽고→고치고→임시 파일→rename 으로 쓴다.
// 다른 기기가 더해 둔 자료를 이쪽의 다음 저장 한 번에 지우지 않게. AI-free.
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const fss = require('fs');
const paths = require('./resource-paths');

let DATA_ROOT = '';
function init(dataRoot) { DATA_ROOT = dataRoot; }
function filePath() { return path.join(DATA_ROOT, 'resources.json'); }

const EMPTY = () => ({ version: 1, items: [], tags: [], exclusions: [] });
const PALETTE = ['#4dabf7', '#e8590c', '#2fb344', '#ae3ec9', '#f59f00', '#1098ad', '#d6336c', '#5c7cfa', '#74b816', '#fd7e14']

async function readAll() {
  try {
    const d = JSON.parse(await fs.readFile(filePath(), 'utf-8')) || {};
    return { ...EMPTY(), ...d, items: d.items || [], tags: d.tags || [], exclusions: d.exclusions || [] };
  } catch {
    return EMPTY();
  }
}
async function writeAll(d) {
  const p = filePath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = p + '.' + process.pid + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(d, null, 2));
  try { await fs.rename(tmp, p); } catch { await fs.copyFile(tmp, p); try { await fs.unlink(tmp); } catch { /* 그만 */ } }
}
// 한 번에 하나씩 — 동시에 두 요청이 읽고 쓰면 앞의 것이 사라진다
let chain = Promise.resolve();
function mutate(fn) {
  const run = chain.then(async () => { const d = await readAll(); const r = await fn(d); await writeAll(d); return r; });
  chain = run.catch(() => {});
  return run;
}

const now = () => Date.now();
const key = (stored) => String(stored || '').toLowerCase();

function decorate(it) {
  if (it.kind === 'web') return { ...it, resolved: it.target, missing: false };
  const r = paths.resolve(it.target);
  return { ...it, resolved: r.path, missing: r.missing };
}

async function list() {
  const d = await readAll();
  return { items: d.items.map(decorate), tags: d.tags, exclusions: d.exclusions };
}

function guessKind(target) {
  if (paths.isWebLike(target)) return 'web';
  try { return fss.statSync(target).isDirectory() ? 'folder' : 'file'; } catch { return 'file'; }
}
function titleFor(kind, target) {
  if (kind === 'web') { try { return new URL(target).hostname; } catch { return target; } }
  return path.basename(String(target).replace(/[\\/]+$/, '')) || target;
}

/** items: [{ target(절대경로/주소), title?, kind?, tags?: tagId[] }] → 추가(같은 대상이면 되살려 재사용) */
async function add(items) {
  return mutate((d) => {
    const out = [];
    for (const raw of items || []) {
      const abs = String(raw.target || '').trim();
      if (!abs) continue;
      const stored = paths.toStored(abs);
      const kind = raw.kind || guessKind(abs);
      let it = d.items.find((x) => key(x.target) === key(stored));
      if (it) {
        if (it.deletedAt) { it.deletedAt = null; it.updatedAt = now(); }
      } else {
        it = { id: crypto.randomUUID(), kind, title: String(raw.title || titleFor(kind, abs)).slice(0, 300), target: stored,
          tags: [], note: '', favorite: false, content: '', contentAt: 0, createdAt: now(), updatedAt: now(), openedAt: 0, deletedAt: null };
        d.items.push(it);
      }
      for (const t of raw.tags || []) if (!it.tags.includes(t)) it.tags.push(t);
      out.push(decorate(it));
    }
    return out;
  });
}

async function update(id, patch) {
  return mutate((d) => {
    const it = d.items.find((x) => x.id === id);
    if (!it) return null;
    if (patch.title !== undefined) it.title = String(patch.title).slice(0, 300);
    if (patch.note !== undefined) it.note = String(patch.note).slice(0, 20000);
    if (patch.favorite !== undefined) it.favorite = !!patch.favorite;
    if (Array.isArray(patch.tags)) it.tags = [...new Set(patch.tags.filter((t) => d.tags.some((g) => g.id === t)))];
    if (patch.target !== undefined && patch.target) it.target = paths.toStored(patch.target);
    it.updatedAt = now();
    return decorate(it);
  });
}
async function remove(ids) {
  return mutate((d) => { for (const it of d.items) if (ids.includes(it.id)) { it.deletedAt = now(); it.updatedAt = now(); } return true; });
}
async function restore(ids) {
  return mutate((d) => { for (const it of d.items) if (ids.includes(it.id)) { it.deletedAt = null; it.updatedAt = now(); } return true; });
}
async function touchOpened(id) {
  return mutate((d) => { const it = d.items.find((x) => x.id === id); if (it) it.openedAt = now(); return !!it; });
}
async function setContent(id, content) {
  return mutate((d) => { const it = d.items.find((x) => x.id === id); if (it) { it.content = String(content || '').slice(0, 8000); it.contentAt = now(); } return !!it; });
}
async function get(id) {
  const d = await readAll();
  const it = d.items.find((x) => x.id === id);
  return it ? decorate(it) : null;
}

// ── 태그 ────────────────────────────────────────────────────────────────
function makeTag(d, name, source = null) {
  const t = { id: crypto.randomUUID(), name: String(name).slice(0, 120), color: PALETTE[d.tags.length % PALETTE.length], source };
  d.tags.push(t);
  return t;
}
async function createTag(name) {
  return mutate((d) => d.tags.find((t) => t.name === name && !t.source) || makeTag(d, name));
}
async function updateTag(id, patch) {
  return mutate((d) => {
    const t = d.tags.find((x) => x.id === id);
    if (!t) return null;
    if (patch.name) {
      // 계층 이름('부모/자식')이면 자식들의 앞부분도 같이 바꾼다
      const old = t.name, next = String(patch.name).slice(0, 120);
      for (const c of d.tags) if (c !== t && c.name.startsWith(old + '/')) c.name = next + c.name.slice(old.length);
      t.name = next;
    }
    if (patch.color) t.color = patch.color;
    return t;
  });
}
async function deleteTag(id) {
  return mutate((d) => {
    d.tags = d.tags.filter((t) => t.id !== id);
    for (const it of d.items) it.tags = it.tags.filter((t) => t !== id);
    d.exclusions = d.exclusions.filter((e) => e.tagId !== id);
    return true;
  });
}
async function mergeTags(fromId, intoId) {
  return mutate((d) => {
    if (fromId === intoId || !d.tags.some((t) => t.id === intoId)) return false;
    for (const it of d.items) if (it.tags.includes(fromId)) it.tags = [...new Set(it.tags.map((t) => (t === fromId ? intoId : t)))];
    d.tags = d.tags.filter((t) => t.id !== fromId);
    return true;
  });
}

// ── 폴더 가져오기 · 동기화 ───────────────────────────────────────────────
const MAX_ENTRIES = 3000;
const SKIP_DIRS = new Set(['.git', 'node_modules', '.svn', '.hg', '__pycache__']);
async function walk(root, dir, depth, out) {
  let items;
  try { items = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const it of items) {
    if (out.length >= MAX_ENTRIES) return;
    const abs = path.join(dir, it.name);
    if (it.isDirectory()) {
      if (it.name.startsWith('.') || SKIP_DIRS.has(it.name)) continue;
      out.push({ rel: path.relative(root, abs), abs, dir: true, depth });
      await walk(root, abs, depth + 1, out);
    } else if (it.isFile()) {
      if (it.name.startsWith('~$')) continue; // 오피스 임시 파일
      out.push({ rel: path.relative(root, abs), abs, dir: false, depth });
    }
  }
}
async function listFolder(root) {
  const out = [];
  await walk(root, root, 1, out);
  return { root, entries: out.slice(0, MAX_ENTRIES), truncated: out.length > MAX_ENTRIES };
}
const excluded = (rel, set) => { const r = rel.split(path.sep).join('/'); for (const e of set) if (r === e || r.startsWith(e + '/')) return true; return false; };

function ensureFolderTag(d, absDir, name) {
  const stored = paths.toStored(absDir);
  return d.tags.find((t) => t.source && key(t.source) === key(stored)) || makeTag(d, name, stored);
}
/** 파일 하나의 조상 폴더 전부(루트 포함)에 대한 태그 — 이름은 '루트/하위/…' */
function folderChain(d, rootAbs, rootTag, rel) {
  const segs = rel.split(/[\\/]/).filter(Boolean); segs.pop();
  const chain = [rootTag];
  let cur = '', parent = rootTag;
  for (const s of segs) {
    cur = cur ? path.join(cur, s) : s;
    const t = ensureFolderTag(d, path.join(rootAbs, cur), `${parent.name}/${s}`);
    chain.push(t); parent = t;
  }
  return chain;
}
function upsertFile(d, abs, tagIds, extTag) {
  const stored = paths.toStored(abs);
  let it = d.items.find((x) => key(x.target) === key(stored));
  let created = false;
  if (!it) {
    it = { id: crypto.randomUUID(), kind: 'file', title: path.basename(abs), target: stored, tags: [], note: '', favorite: false,
      content: '', contentAt: 0, createdAt: now(), updatedAt: now(), openedAt: 0, deletedAt: null };
    d.items.push(it); created = true;
  } else if (it.deletedAt) { it.deletedAt = null; created = true; }
  for (const t of tagIds) if (!it.tags.includes(t)) it.tags.push(t);
  if (extTag) {
    const ext = path.extname(abs).slice(1).toLowerCase();
    if (ext) {
      const t = d.tags.find((g) => !g.source && g.name === ext) || makeTag(d, ext);
      if (!it.tags.includes(t.id)) it.tags.push(t.id);
    }
  }
  return created;
}
async function importFolder(rootAbs, rels, extTag) {
  return mutate((d) => {
    const rootTag = ensureFolderTag(d, rootAbs, path.basename(rootAbs) || rootAbs);
    let created = 0, existed = 0;
    for (const rel of rels || []) {
      const chain = folderChain(d, rootAbs, rootTag, rel);
      if (upsertFile(d, path.join(rootAbs, rel), chain.map((t) => t.id), extTag)) created++; else existed++;
    }
    return { tag: rootTag, created, existed };
  });
}
async function syncDiff(d, tagId) {
  const tag = d.tags.find((t) => t.id === tagId);
  if (!tag || !tag.source) throw new Error('not_a_folder_tag');
  const rootAbs = paths.resolve(tag.source).path;
  const { entries } = await listFolder(rootAbs);
  const ex = new Set(d.exclusions.filter((e) => e.tagId === tagId).map((e) => e.rel));
  const files = entries.filter((e) => !e.dir && !excluded(e.rel, ex));
  const here = new Set(files.map((e) => key(paths.toStored(e.abs))));
  const tracked = d.items.filter((it) => !it.deletedAt && it.tags.includes(tagId));
  const trackedKeys = new Set(tracked.map((it) => key(it.target)));
  return {
    tag, rootAbs,
    added: files.filter((e) => !trackedKeys.has(key(paths.toStored(e.abs)))).map((e) => ({ rel: e.rel, abs: e.abs })),
    removed: tracked.filter((it) => !here.has(key(it.target))).map((it) => ({ id: it.id, title: it.title, target: it.target })),
    unchanged: tracked.length,
  };
}
async function previewSync(tagId) {
  const d = await readAll();
  const r = await syncDiff(d, tagId);
  return { tagId, added: r.added, removed: r.removed, unchanged: r.unchanged - r.removed.length, root: r.rootAbs };
}
async function applySync(tagId) {
  // 폴더 훑기는 잠금 밖에서 — 오래 걸려도 다른 저장을 막지 않게
  const pre = await readAll();
  await syncDiff(pre, tagId);
  return mutate(async (d) => {
    const r = await syncDiff(d, tagId);
    const chainRoot = r.tag;
    let added = 0;
    for (const a of r.added) if (upsertFile(d, a.abs, folderChain(d, r.rootAbs, chainRoot, a.rel).map((t) => t.id), false)) added++;
    const gone = new Set(r.removed.map((x) => x.id));
    for (const it of d.items) if (gone.has(it.id)) { it.deletedAt = now(); it.updatedAt = now(); }
    return { added, removed: gone.size };
  });
}
async function getExclusions(tagId) {
  const d = await readAll();
  return d.exclusions.filter((e) => e.tagId === tagId).map((e) => e.rel);
}
async function setExclusions(tagId, rels) {
  return mutate((d) => {
    d.exclusions = d.exclusions.filter((e) => e.tagId !== tagId).concat([...new Set(rels || [])].map((rel) => ({ tagId, rel: String(rel).split(path.sep).join('/') })));
    return true;
  });
}

// ── 이 자료를 쓴 페이지 ───────────────────────────────────────────────────
async function usedBy(resId) {
  const pages = new Set();
  try {
    const refs = JSON.parse(await fs.readFile(path.join(DATA_ROOT, 'references.json'), 'utf-8')) || {};
    for (const [pid, rows] of Object.entries(refs)) if ((rows || []).some((r) => r.kind === 'resource' && r.resId === resId)) pages.add(pid);
  } catch { /* 없으면 그만 */ }
  try {
    const wos = JSON.parse(await fs.readFile(path.join(DATA_ROOT, 'work-objects.json'), 'utf-8')) || {};
    for (const [pid, wo] of Object.entries(wos)) if ((wo?.docLinks || []).some((l) => l.kind === 'resource' && l.resId === resId)) pages.add(pid);
  } catch { /* 없으면 그만 */ }
  return [...pages];
}

// ── LinkMap 가져오기 (LinkMap 의 "JSON 전체 내보내기" 파일) ───────────────
async function importLinkMap(jsonPath) {
  const raw = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
  if (!raw || !Array.isArray(raw.links) || !Array.isArray(raw.tags)) throw new Error('not_linkmap_export');
  return mutate((d) => {
    const tagMap = new Map(); // LinkMap tagId → 우리 tagId
    let tags = 0, items = 0, skipped = 0;
    for (const t of raw.tags) {
      const source = t.sourcePath ? paths.toStored(t.sourcePath) : null;
      let mine = source ? d.tags.find((g) => g.source && key(g.source) === key(source)) : d.tags.find((g) => !g.source && g.name === t.name);
      if (!mine) { mine = { id: crypto.randomUUID(), name: String(t.name || '태그'), color: t.color || PALETTE[d.tags.length % PALETTE.length], source }; d.tags.push(mine); tags++; }
      tagMap.set(t.id, mine.id);
    }
    const linkTags = new Map();
    for (const lt of raw.linkTags || []) { if (!linkTags.has(lt.linkId)) linkTags.set(lt.linkId, []); linkTags.get(lt.linkId).push(tagMap.get(lt.tagId)); }
    for (const l of raw.links) {
      if (l.deletedAt) { skipped++; continue; }
      if (l.kind === 'note' || !l.url) { skipped++; continue; } // 메모 항목은 노트로 옮길 일 — 여기선 건너뜀
      const stored = paths.toStored(l.url);
      let it = d.items.find((x) => key(x.target) === key(stored));
      if (!it) {
        const ts = (v) => (typeof v === 'number' ? v : (v ? new Date(v).getTime() : now()));
        it = { id: crypto.randomUUID(), kind: l.kind === 'folder' ? 'folder' : l.kind === 'web' ? 'web' : 'file', title: String(l.title || titleFor(l.kind, l.url)),
          target: stored, tags: [], note: String(l.note || ''), favorite: !!l.favorite, content: String(l.content || '').slice(0, 8000), contentAt: l.content ? now() : 0,
          createdAt: ts(l.createdAt), updatedAt: ts(l.updatedAt), openedAt: l.openedAt ? ts(l.openedAt) : 0, deletedAt: null };
        d.items.push(it); items++;
      }
      for (const t of linkTags.get(l.id) || []) if (t && !it.tags.includes(t)) it.tags.push(t);
    }
    for (const ex of raw.folderExclusions || []) {
      const tid = tagMap.get(ex.tagId);
      if (tid && !d.exclusions.some((e) => e.tagId === tid && e.rel === ex.relativePath)) d.exclusions.push({ tagId: tid, rel: String(ex.relativePath).split(path.sep).join('/') });
    }
    return { items, tags, skipped };
  });
}

/** "위치 다시 지정" */
async function remap(id, actualAbs) {
  const it = await get(id);
  if (!it) return null;
  const rule = paths.addRemap(paths.expandTokens(it.target), actualAbs);
  return { rule, item: await get(id) };
}

module.exports = {
  init, list, add, update, remove, restore, touchOpened, setContent, get,
  createTag, updateTag, deleteTag, mergeTags,
  listFolder, importFolder, previewSync, applySync, getExclusions, setExclusions,
  usedBy, importLinkMap, remap,
};
