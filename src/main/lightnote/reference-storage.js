// 논문식 참조("참조 탭")를 페이지별로 보관한다.
// references.json = { [pageId(UUID)]: Reference[] } — 업무 객체와 같은
// 사이드카 방식이라 노트를 옮기거나 이름을 바꿔도 따라다닌다.
//
// 이미지는 base64로 이 JSON에 박지 않는다. 본문 이미지와 달리 참조 자료는
// 실험 사진처럼 큰 파일이 예사라, 그대로 넣으면 노트 JSON이 금세 수 MB가
// 된다. 기존 첨부 폴더(attachments/<pageId>/)에 파일로 두고 파일명만 적는다.
// AI-free.
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const attachments = require('./attachments');

let DATA_ROOT = '';
let cache = null;

function init(dataRoot) {
  DATA_ROOT = dataRoot;
  cache = null;
}

function filePath() { return path.join(DATA_ROOT, 'references.json'); }

async function readAll() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(filePath(), 'utf-8')) || {};
  } catch {
    cache = {};
  }
  return cache;
}

async function writeAll(map) {
  cache = map;
  const p = filePath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(map, null, 2));
  try {
    await fs.rename(tmp, p);
  } catch {
    await fs.copyFile(tmp, p);
    try { await fs.unlink(tmp); } catch { /* ignore */ }
  }
  return map;
}

async function list(pageId) {
  const all = await readAll();
  return all[pageId] || [];
}

/** ref: { kind:'image'|'text', text?, file?, caption? } — id/createdAt은 여기서 붙인다. */
async function add(pageId, ref) {
  const all = await readAll();
  const rows = all[pageId] ? all[pageId].slice() : [];
  const row = {
    id: crypto.randomUUID(),
    kind: ref.kind === 'image' ? 'image' : 'text',
    text: String(ref.text || ''),
    file: ref.file || null,
    caption: String(ref.caption || '').slice(0, 200),
    createdAt: Date.now(),
  };
  rows.push(row);
  await writeAll({ ...all, [pageId]: rows });
  return row;
}

async function update(pageId, id, patch) {
  const all = await readAll();
  const rows = (all[pageId] || []).map((r) => (r.id === id
    ? { ...r, caption: patch.caption !== undefined ? String(patch.caption).slice(0, 200) : r.caption,
        text: patch.text !== undefined ? String(patch.text) : r.text }
    : r));
  await writeAll({ ...all, [pageId]: rows });
  return rows;
}

async function remove(pageId, id) {
  const all = await readAll();
  const rows = all[pageId] || [];
  const gone = rows.find((r) => r.id === id);
  const next = rows.filter((r) => r.id !== id);
  await writeAll({ ...all, [pageId]: next });
  // 딸린 이미지 파일도 같이 치운다 — 남겨두면 아무도 가리키지 않는 파일이
  // 첨부 폴더에 계속 쌓인다.
  if (gone && gone.kind === 'image' && gone.file) {
    const full = attachments.resolve(pageId, gone.file);
    if (full) { try { await fs.unlink(full); } catch { /* 이미 없으면 그만 */ } }
  }
  return next;
}

/** 페이지가 통째로 지워질 때. 이미지 파일은 attachments.removeAll이 폴더째 지운다. */
async function removeMany(pageIds) {
  const all = await readAll();
  const next = { ...all };
  for (const id of pageIds || []) delete next[id];
  await writeAll(next);
  return { success: true };
}

/** 클립보드/파일에서 온 이미지 바이트를 첨부 폴더에 넣고 참조로 등록한다. */
async function addImage(pageId, buffer, ext, caption) {
  const stored = await attachments.addBuffer(pageId, buffer, ext);
  return add(pageId, { kind: 'image', file: stored, caption });
}

/** 참조 이미지를 렌더러가 <img>에 바로 물릴 수 있는 data URI로 읽어준다. */
async function imageDataUrl(pageId, file) {
  const full = attachments.resolve(pageId, file);
  if (!full) return null;
  try {
    const buf = await fs.readFile(full);
    const ext = path.extname(full).slice(1).toLowerCase();
    const mime = ext === 'jpg' ? 'jpeg' : (ext || 'png');
    return `data:image/${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

module.exports = { init, list, add, update, remove, removeMany, addImage, imageDataUrl };
