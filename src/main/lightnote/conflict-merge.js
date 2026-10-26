// 동기화 충돌 사본(OneDrive 가 남기는 `notebooks-PC이름.json`, `<페이지id>-PC이름.json` 같은 것)을
// 원본에 합친다. 지우지 않는다 — 합친 뒤 사본은 데이터 폴더의 `_conflict-backup/<시각>/` 로 옮긴다.
//
// 합치는 규칙 (원본이 기준, 사본에서 "없는 것"과 "더 최근 것"만 가져온다):
//   · 배열 — id/pageId 가 있으면 그 키로 합집합. 같은 키가 둘 다 있으면 updatedAt 이 더 큰 쪽.
//            키 없는 값(문자열 등)의 배열은 합집합.
//   · 객체(맵) — 원본에 없는 키는 사본 것을 넣고, 둘 다 있으면 안쪽으로 내려가 같은 규칙.
//            둘 다 updatedAt 을 가진 객체면 더 최근 쪽을 통째로.
//   · 그 밖의 값 — 원본 유지.
// 페이지 본문 사본(델타)은 줄 단위로 합칠 수 없다 — 하나를 골라 누르면 사본으로 바꾸고(원본은 버전 기록에),
// 한꺼번에 처리할 때는 더 최근 쪽을 남긴다.
// AI-free.
const fs = require('fs');
const path = require('path');

const ROOT_BASES = ['notebooks', 'page-refs', 'page-links', 'work-objects', 'references', 'settings', 'resources', 'sections', 'pages'];
const UUID = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

const keyOf = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? (v.id ?? v.pageId ?? null) : null);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const newer = (a, b) => (Number(b?.updatedAt) || 0) > (Number(a?.updatedAt) || 0);

function mergeValue(orig, copy, stat) {
  if (orig === undefined) { stat.added++; return copy; }
  if (Array.isArray(orig) && Array.isArray(copy)) return mergeArray(orig, copy, stat);
  if (isObj(orig) && isObj(copy)) {
    if ('updatedAt' in orig && 'updatedAt' in copy) {
      if (newer(orig, copy)) { stat.updated++; return copy; }
      return orig;
    }
    const out = { ...orig };
    for (const k of Object.keys(copy)) out[k] = mergeValue(orig[k], copy[k], stat);
    return out;
  }
  return orig;
}
function mergeArray(orig, copy, stat) {
  const keyed = orig.some((v) => keyOf(v) !== null) || copy.some((v) => keyOf(v) !== null);
  if (!keyed) {
    const seen = new Set(orig.map((v) => JSON.stringify(v)));
    const out = orig.slice();
    for (const v of copy) if (!seen.has(JSON.stringify(v))) { out.push(v); seen.add(JSON.stringify(v)); stat.added++; }
    return out;
  }
  const out = orig.slice();
  const at = new Map(out.map((v, i) => [keyOf(v), i]));
  for (const v of copy) {
    const k = keyOf(v);
    if (k === null) continue;
    if (!at.has(k)) { at.set(k, out.length); out.push(v); stat.added++; continue; }
    const i = at.get(k);
    const o = out[i];
    if (isObj(o) && isObj(v)) {
      if ('updatedAt' in o && 'updatedAt' in v) { if (newer(o, v)) { out[i] = v; stat.updated++; } }
      else out[i] = mergeValue(o, v, stat);
    }
  }
  return out;
}

/** 사본 경로 → { kind: 'list'|'page', original } (원본을 못 찾으면 null) */
function originalOf(copyPath) {
  const dir = path.dirname(copyPath), name = path.basename(copyPath);
  if (path.basename(dir) === 'pages') {
    const m = UUID.exec(name);
    return m ? { kind: 'page', original: path.join(dir, m[1] + '.json'), pageId: m[1] } : null;
  }
  const base = ROOT_BASES.find((b) => name.toLowerCase().startsWith(b + '-'));
  return base ? { kind: 'list', original: path.join(dir, base + '.json') } : null;
}

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return undefined; } };
function writeJson(p, data) {
  const tmp = p + '.' + process.pid + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  try { fs.renameSync(tmp, p); } catch { fs.copyFileSync(tmp, p); try { fs.unlinkSync(tmp); } catch { /* 그만 */ } }
}
const stamp = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);

/** 사본을 백업 폴더로 옮긴다(데이터 폴더 안에서의 상대 위치를 그대로) */
function moveToBackup(root, copyPath, when) {
  const dest = path.join(root, '_conflict-backup', when, 'copy', path.relative(root, copyPath));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try { fs.renameSync(copyPath, dest); } catch { fs.copyFileSync(copyPath, dest); fs.unlinkSync(copyPath); }
  return dest;
}

/**
 * 사본 하나를 처리한다.
 *   목록·맵 파일 → 원본에 합치기 / 페이지 본문 → 사본으로 바꾸기(원본은 snapshot 으로 버전 기록에)
 * @returns {{ ok, kind, added?, updated?, pageId?, backup, reason? }}
 */
async function resolve(root, copyPath, { snapshotPage, force = false } = {}) {
  const full = path.resolve(copyPath);
  if (!full.toLowerCase().startsWith(path.resolve(root).toLowerCase() + path.sep)) return { ok: false, reason: 'outside' };
  if (!fs.existsSync(full)) return { ok: false, reason: 'gone' };
  const info = originalOf(full);
  if (!info) return { ok: false, reason: 'unknown' };
  const copy = readJson(full);
  if (copy === undefined) return { ok: false, reason: 'unreadable' };
  const when = stamp();
  if (info.kind === 'page') {
    const orig = readJson(info.original);
    // 한꺼번에 처리할 때(force 아님)는 더 최근 쪽을 남긴다 — 사본이 더 오래됐으면 원본을 두고 사본만 치운다
    if (!force && orig && (Number(orig.updatedAt) || 0) >= (Number(copy.updatedAt) || 0)) {
      const backup = moveToBackup(root, full, when);
      return { ok: true, kind: 'page-kept', pageId: info.pageId, backup };
    }
    if (orig && snapshotPage) { try { await snapshotPage(info.pageId, orig); } catch { /* 기록 실패해도 원본 파일은 백업에 남긴다 */ } }
    if (orig) {
      const dest = path.join(root, '_conflict-backup', when, 'original', path.relative(root, info.original));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(info.original, dest);
    }
    writeJson(info.original, { ...copy, id: info.pageId, updatedAt: Date.now() });
    const backup = moveToBackup(root, full, when);
    return { ok: true, kind: 'page', pageId: info.pageId, backup };
  }
  const orig = readJson(info.original);
  const stat = { added: 0, updated: 0 };
  const merged = orig === undefined ? copy : mergeValue(orig, copy, stat);
  if (orig !== undefined) {
    // 원본도 합치기 전 모습으로 백업에 남긴다 — 규칙이 마음에 안 들면 되돌릴 수 있게
    const dest = path.join(root, '_conflict-backup', when, 'original', path.relative(root, info.original));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(info.original, dest);
  }
  writeJson(info.original, merged);
  const backup = moveToBackup(root, full, when);
  return { ok: true, kind: 'list', added: stat.added, updated: stat.updated, backup };
}

module.exports = { resolve, originalOf, mergeValue, ROOT_BASES };
