// 자료(파일·폴더 링크)의 경로를 기기마다 맞춰 푼다.
//
// 회사 PC와 노트북이 같은 데이터 폴더를 쓰면, 같은 파일이라도 경로가 다르다
// (C:\Users\홍길동\OneDrive - 회사\… / C:\Users\hong\OneDrive - 회사\…). 그래서
//   · 저장할 때 사용자 폴더·OneDrive 부분을 %USERPROFILE%·%OneDrive% 토큰으로 바꿔 두고
//   · 풀 때 이 기기의 값으로 되돌린다.
// 그래도 없으면(드라이브 문자가 다르다든가) 사용자가 "위치 다시 지정"으로 고른 경로에서
// 앞부분 바꿔치기 규칙을 만들어 **이 기기에만** 저장한다(공유 폴더에 두면 다른 기기 경로가 섞인다).
const path = require('path');
const fs = require('fs');

let DEVICE_FILE = '';
function init(appRoot) { DEVICE_FILE = path.join(appRoot, 'lightnote-device.json'); }

const isWebLike = (t) => /^[a-z][a-z0-9+.-]*:\/\//i.test(t || '') && !/^file:\/\//i.test(t || '');

/** 토큰으로 바꿀 이 기기의 뿌리들 — 긴 것부터 대 본다 */
function roots() {
  const out = [];
  const add = (token, v) => { if (v && path.isAbsolute(v)) out.push({ token, dir: path.normalize(v).replace(/[\\/]+$/, '') }); };
  add('%OneDriveCommercial%', process.env.OneDriveCommercial);
  add('%OneDriveConsumer%', process.env.OneDriveConsumer);
  add('%OneDrive%', process.env.OneDrive);
  add('%USERPROFILE%', process.env.USERPROFILE);
  return out.sort((a, b) => b.dir.length - a.dir.length);
}

const sameStart = (p, dir) => {
  const a = p.toLowerCase(), d = dir.toLowerCase();
  return a === d || a.startsWith(d + '\\') || a.startsWith(d + '/');
};

/** 절대경로 → 저장형(토큰). 웹 주소는 그대로. */
function toStored(abs) {
  if (!abs || isWebLike(abs)) return abs;
  const p = path.normalize(abs);
  for (const r of roots()) if (sameStart(p, r.dir)) return r.token + p.slice(r.dir.length);
  return p;
}

function expandTokens(stored) {
  if (!stored || isWebLike(stored)) return stored;
  const env = { '%OneDriveCommercial%': process.env.OneDriveCommercial, '%OneDriveConsumer%': process.env.OneDriveConsumer,
    '%OneDrive%': process.env.OneDrive, '%USERPROFILE%': process.env.USERPROFILE };
  const m = /^(%[A-Za-z]+%)(.*)$/.exec(stored);
  if (m && env[m[1]]) return path.normalize(env[m[1]] + m[2]);
  return stored;
}

function readDevice() {
  try { return JSON.parse(fs.readFileSync(DEVICE_FILE, 'utf-8')) || {}; } catch { return {}; }
}
function writeDevice(d) {
  fs.mkdirSync(path.dirname(DEVICE_FILE), { recursive: true });
  const tmp = DEVICE_FILE + '.' + process.pid + '-' + Date.now().toString(36) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  try { fs.renameSync(tmp, DEVICE_FILE); } catch { fs.copyFileSync(tmp, DEVICE_FILE); try { fs.unlinkSync(tmp); } catch { /* 그만 */ } }
}
function remaps() { return Array.isArray(readDevice().pathRemaps) ? readDevice().pathRemaps : []; }

/** 저장형 → 이 기기의 실제 경로. { path, missing } — 없으면 기기 규칙을 대 본다. */
function resolve(stored) {
  if (!stored || isWebLike(stored)) return { path: stored, missing: false };
  const p = expandTokens(stored);
  if (fs.existsSync(p)) return { path: p, missing: false };
  for (const r of remaps()) {
    if (r && r.from && sameStart(p, r.from)) {
      const q = path.normalize(r.to + p.slice(r.from.length));
      if (fs.existsSync(q)) return { path: q, missing: false };
    }
  }
  return { path: p, missing: true };
}

/** "위치 다시 지정": 원래 경로(풀린 것)와 실제로 고른 경로의 공통 꼬리를 빼고 남은 앞부분을
 *  규칙으로 저장한다. 같은 앞부분을 쓰는 다른 자료도 함께 풀린다. */
function addRemap(expectedAbs, actualAbs) {
  const a = path.normalize(expectedAbs).split(/[\\/]/), b = path.normalize(actualAbs).split(/[\\/]/);
  let k = 0
  while (k < a.length - 1 && k < b.length - 1 && a[a.length - 1 - k].toLowerCase() === b[b.length - 1 - k].toLowerCase()) k++;
  const from = a.slice(0, a.length - k).join(path.sep), to = b.slice(0, b.length - k).join(path.sep);
  if (!from || !to || from.toLowerCase() === to.toLowerCase()) return null;
  const d = readDevice();
  const list = (Array.isArray(d.pathRemaps) ? d.pathRemaps : []).filter((r) => r.from.toLowerCase() !== from.toLowerCase());
  list.unshift({ from, to });
  writeDevice({ ...d, pathRemaps: list });
  return { from, to };
}

module.exports = { init, toStored, expandTokens, resolve, addRemap, remaps, isWebLike };
