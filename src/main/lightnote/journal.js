// 기록장 — 날짜별로 자동 정리되는 짧은 기록.
//
// 별도 저장소를 만들지 않고 "기록장" 노트북 안에 월별 폴더 › 날짜별 페이지로
// 둔다. 기록 하나는 그 페이지의 한 문단("오전 9:12  내용")이다. 이렇게 두면
// 편집기·이미지·체크리스트·검색·버전·내보내기가 전부 기존 것 그대로 쓰이고,
// 적어둔 기록을 나중에 업무 속성으로 승격하거나 참조로 보내는 길도 열린다.
//
// 하루가 지나면 자동으로 다음 날짜에 쌓이는 건 타이머가 아니라, 기록을 넣는
// 순간의 날짜로 페이지를 찾고 없으면 만들기 때문이다. AI-free.
const noteStorage = require('./note-storage');
const pageVersions = require('./page-versions');

const NOTEBOOK_NAME = '기록장';
const NOTEBOOK_COLOR = '#2f9e44';
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function pad(n) { return String(n).padStart(2, '0'); }
/** 2026-10-05 — 정렬·검색이 자연스러운 키. */
function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** 2026-10 — 월별 폴더 이름. */
function monthKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
/** 2026-10-05 (월) — 페이지 제목. */
function dayTitle(ts) {
  const d = new Date(ts);
  return `${dateKey(ts)} (${DOW[d.getDay()]})`;
}
/** 오전 9:12 — 기록 한 줄 앞에 붙는 시각. */
function timeLabel(ts) {
  const d = new Date(ts);
  const h = d.getHours();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}:${pad(d.getMinutes())}`;
}
// 시각 뒤 공백은 없을 수도 있다 — 설명 없이 사진만 올리면 "오전 12:37"에서
// 줄이 끝난다. 여기서 공백을 강제했더니 그런 줄이 기록으로 안 잡히고 바로 앞
// 기록에 딸려 들어갔다(사진 세 장이 한 말풍선에 뭉친 원인).
const TIME_RE = /^(오전|오후)\s\d{1,2}:\d{2}(?:\s{1,2}|$)/;
/** "오전 9:12" → 552 (그날 0시부터의 분). 시각이 없으면 null. */
function timeMinutes(text) {
  const m = /^(오전|오후)\s(\d{1,2}):(\d{2})/.exec(String(text || ''));
  if (!m) return null;
  const h = (Number(m[2]) % 12) + (m[1] === '오후' ? 12 : 0);
  return h * 60 + Number(m[3]);
}

// 붙여넣은 주소는 링크로 저장한다 — 버튼을 따로 두지 않고 "그냥 붙여넣으면
// 된다"가 목표라서. 눈대중으로 도메인을 찍지 않고 http(s):// 나 www. 로
// 시작하는 것만 잡는다("3.5 버전" 같은 말을 링크로 만들지 않으려고).
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>()[\]{}"'‘’“”]+/gi;
/** 글 한 토막을 "보통 글 / 링크" 조각으로 쪼갠다. */
function linkSegments(text) {
  const segs = [];
  let last = 0;
  URL_RE.lastIndex = 0;
  let m;
  while ((m = URL_RE.exec(text))) {
    // 문장 끝 따라붙은 구두점은 주소에서 떼어낸다 ("...naver.com." 같은 경우).
    const url = m[0].replace(/[),.;:!?\]}'"»]+$/, '');
    if (!url) { URL_RE.lastIndex = m.index + m[0].length; continue; }
    if (m.index > last) segs.push({ text: text.slice(last, m.index), link: null });
    segs.push({ text: url, link: /^www\./i.test(url) ? `https://${url}` : url });
    last = m.index + url.length;
    URL_RE.lastIndex = last;
  }
  if (last < text.length) segs.push({ text: text.slice(last), link: null });
  return segs;
}
/** 링크 조각을 Quill 델타 op으로. 편집기에서도 진짜 링크로 보이게 하려는 것. */
function textOps(text) {
  return linkSegments(text).map((s) => (s.link ? { insert: s.text, attributes: { link: s.link } } : { insert: s.text }));
}
/** 앞에서 n글자를 덜어낸 조각 목록 (시각 머리말을 떼어낼 때 쓴다). */
function dropChars(segs, n) {
  const out = [];
  let left = n;
  for (const s of segs) {
    if (left >= s.text.length) { left -= s.text.length; continue; }
    out.push(left > 0 ? { text: s.text.slice(left), link: s.link } : s);
    left = 0;
  }
  return out;
}

/** 델타를 줄 단위로 쪼갠다. 줄 끝 newline op의 속성(목록·헤더)과 그 줄에 들어
 *  있는 이미지, 링크 조각도 함께 들고 나온다 — 카드로 그릴 때 쓴다. */
function deltaToLines(delta) {
  const ops = (delta && delta.ops) || [];
  const lines = [];
  const blank = () => ({ text: '', images: [], segs: [], attrs: null });
  let cur = blank();
  for (const op of ops) {
    const ins = op.insert;
    if (typeof ins === 'string') {
      const link = (op.attributes && op.attributes.link) || null;
      const parts = ins.split('\n');
      for (let i = 0; i < parts.length; i++) {
        if (parts[i]) {
          cur.text += parts[i];
          cur.segs.push({ text: parts[i], link });
        }
        if (i < parts.length - 1) {
          cur.attrs = op.attributes || null;
          lines.push(cur);
          cur = blank();
        }
      }
    } else if (ins && typeof ins === 'object' && ins.image) {
      cur.images.push(ins.image);
    }
  }
  if (cur.text.trim() || cur.images.length) lines.push(cur);
  return lines;
}

/** 델타를 줄 단위 op 묶음으로 쪼갠다. deltaToLines 는 "읽어서 보여주기"용이라
 *  글자만 들고 나오는데, 고쳐 쓰려면 원래 op을 그대로 쥐고 있어야 한다 —
 *  편집기에서 굵게 쓴 글씨 같은 걸 수정 한 번에 날려버리지 않으려는 것. */
function splitOpLines(delta) {
  const lines = [];
  let cur = { ops: [], nl: null };
  for (const op of (delta && delta.ops) || []) {
    const ins = op.insert;
    if (typeof ins === 'string') {
      const parts = ins.split('\n');
      for (let i = 0; i < parts.length; i++) {
        if (parts[i]) cur.ops.push(op.attributes ? { insert: parts[i], attributes: op.attributes } : { insert: parts[i] });
        if (i < parts.length - 1) { cur.nl = op.attributes || null; lines.push(cur); cur = { ops: [], nl: null }; }
      }
    } else {
      cur.ops.push(op);
    }
  }
  if (cur.ops.length) lines.push(cur);
  return lines;
}
function joinOpLines(lines) {
  const ops = [];
  for (const ln of lines) {
    ops.push(...ln.ops);
    ops.push(ln.nl ? { insert: '\n', attributes: ln.nl } : { insert: '\n' });
  }
  return { ops };
}
/** 기록 하나가 차지하는 줄 범위 [from, to). 머리줄 + 딸린 줄들. */
function recordSpans(lines) {
  const spans = [];
  lines.forEach((ln, i) => {
    const hasBody = ln.text.trim() || ln.images.length;
    if (TIME_RE.test(ln.text)) spans.push({ from: i, to: i + 1 });
    else if (spans.length && hasBody) spans[spans.length - 1].to = i + 1;
    else if (hasBody) spans.push({ from: i, to: i + 1 });
  });
  return spans;
}

/** 시각이 붙은 줄만 기록으로 센다. 사용자가 페이지에 자유롭게 쓴 줄은 세지
 *  않되, 카드 목록에서는 바로 앞 기록에 딸린 내용으로 보여준다. */
function linesToRecords(lines) {
  const records = [];
  for (const ln of lines) {
    const m = TIME_RE.exec(ln.text);
    if (m) {
      records.push({
        time: m[0].trim(),
        text: ln.text.slice(m[0].length),
        segs: dropChars(ln.segs, m[0].length),
        images: ln.images.slice(),
        list: (ln.attrs && ln.attrs.list) || null,
        extra: [],
      });
    } else if (records.length) {
      const last = records[records.length - 1];
      if (ln.text.trim() || ln.images.length) {
        last.extra.push({ text: ln.text, segs: ln.segs, images: ln.images, list: (ln.attrs && ln.attrs.list) || null });
      }
    } else if (ln.text.trim() || ln.images.length) {
      // 시각 없는 첫 줄들(직접 쓴 메모) — 시각 없는 기록으로 둔다.
      records.push({ time: '', text: ln.text, segs: ln.segs, images: ln.images.slice(), list: (ln.attrs && ln.attrs.list) || null, extra: [] });
    }
  }
  return records;
}

async function ensureNotebook() {
  const nbs = await noteStorage.getNotebooks();
  const found = nbs.find((n) => n.name === NOTEBOOK_NAME && !n.deletedAt);
  if (found) return found;
  return noteStorage.createNotebook(NOTEBOOK_NAME, NOTEBOOK_COLOR);
}

async function ensureMonthSection(notebookId, ym) {
  const secs = await noteStorage.getSections(notebookId);
  const found = secs.find((s) => s.name === ym && !s.deletedAt);
  if (found) return found;
  return noteStorage.createSection(notebookId, ym, null);
}

/** 그 날짜의 페이지를 찾고, 없으면 만든다(만들 때만 create=true로 돌려준다). */
async function ensureDayPage(ts, { create = true } = {}) {
  const nb = await ensureNotebook();
  const sec = create
    ? await ensureMonthSection(nb.id, monthKey(ts))
    : (await noteStorage.getSections(nb.id)).find((s) => s.name === monthKey(ts) && !s.deletedAt);
  if (!sec) return null;
  const title = dayTitle(ts);
  const pages = await noteStorage.getPages(nb.id, sec.id);
  const found = pages.find((p) => p.title === title && !p.deletedAt);
  if (found) return { notebookId: nb.id, sectionId: sec.id, pageId: found.id, title };
  if (!create) return null;
  const made = await noteStorage.createPage(nb.id, sec.id, title);
  return { notebookId: nb.id, sectionId: sec.id, pageId: made.id, title };
}

/** 그 날짜 페이지에 줄 묶음을 시각 순서에 맞춰 끼워 넣고 저장한다.
 *  꽁무니에 붙이지 않는 건 지난 날짜에 뒤늦게 적을 때를 위해서다 — 오후 2시
 *  기록 뒤에 오전 9시 기록이 와 있으면 그날을 훑어볼 수가 없다. */
async function insertLines(loc, at, newLines) {
  const content = await noteStorage.loadPage(loc.notebookId, loc.sectionId, loc.pageId);
  const delta = (content && content.delta) || { ops: [] };
  const lines = deltaToLines(delta);
  if (!lines.some((l) => l.text.trim() || l.images.length)) {
    await noteStorage.savePage(loc.notebookId, loc.sectionId, loc.pageId, joinOpLines(newLines), loc.title);
    return;
  }
  const opLines = splitOpLines(delta);
  const mins = timeMinutes(timeLabel(at));
  let pos = opLines.length;
  for (const sp of recordSpans(lines)) {
    const t = timeMinutes(lines[sp.from].text);
    if (t !== null && mins !== null && t > mins) { pos = sp.from; break; }
  }
  opLines.splice(pos, 0, ...newLines);
  await noteStorage.savePage(loc.notebookId, loc.sectionId, loc.pageId, joinOpLines(opLines), loc.title);
}

/** 오늘(또는 주어진 시각) 날짜 페이지에 기록 한 줄을 넣는다. */
async function append(text, at = Date.now()) {
  const body = String(text || '').trim();
  if (!body) return { error: 'EMPTY' };
  const loc = await ensureDayPage(at);
  const parts = body.split('\n');
  await insertLines(loc, at, parts.map((t, i) => ({
    ops: [...(i === 0 ? [{ insert: `${timeLabel(at)}  ` }] : []), ...textOps(t)],
    nl: null,
  })));
  return { success: true, ...loc, at };
}

/** 이미지를 기록 한 줄로 붙인다. 본문 이미지와 같은 방식(델타에 data URL
 *  임베드)이라, 그 날짜 페이지를 편집기로 열면 평소처럼 보이고 PDF 내보내기
 *  같은 기존 기능도 그대로 걸린다. */
async function appendImage(dataUrl, text = '', at = Date.now()) {
  if (!/^data:image\/[a-z0-9+.-]+;base64,/i.test(String(dataUrl || ''))) return { error: 'BAD_IMAGE' };
  const loc = await ensureDayPage(at);
  const caption = String(text || '').trim();
  await insertLines(loc, at, [{
    ops: [
      { insert: caption ? `${timeLabel(at)}  ` : timeLabel(at) },
      ...textOps(caption),
      { insert: { image: dataUrl } },
    ],
    nl: null,
  }]);
  return { success: true, ...loc, at };
}

/** 2026-10-05 → 그 날 0시의 타임스탬프. 못 읽으면 null. */
function keyToTs(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getTime();
}

// ── 지난 기록 고치기 ────────────────────────────────────────────────────
// "과거에 기록을 못한 경우에 기록을 추가/편집할 수 있게." 추가는 append 에
// 그 날짜의 시각을 넘기면 되고(지난 날짜 페이지도 그때 만들어진다), 고치기와
// 지우기는 아래에서 그 줄만 바꿔 쓴다. 덮어쓰기 전에 스냅샷을 남겨 페이지
// 기록에서 되돌릴 수 있게 한다.

/** 고칠 기록의 자리를 찾아 둔다 — 고치기·지우기가 똑같이 쓴다. */
async function locateRecord(key, index) {
  const ts = keyToTs(key);
  if (ts === null) return { error: 'BAD_DATE' };
  const loc = await ensureDayPage(ts, { create: false });
  if (!loc) return { error: 'NO_PAGE' };
  const content = await noteStorage.loadPage(loc.notebookId, loc.sectionId, loc.pageId);
  const delta = (content && content.delta) || { ops: [] };
  const lines = deltaToLines(delta);
  const span = recordSpans(lines)[index];
  if (!span) return { error: 'NO_RECORD' };
  return { loc, content, delta, lines, span, opLines: splitOpLines(delta) };
}

async function saveEdited(loc, prev, next) {
  try { await pageVersions.snapshot(loc.pageId, prev, true); } catch { /* 스냅샷 실패가 수정을 막진 않는다 */ }
  await noteStorage.savePage(loc.notebookId, loc.sectionId, loc.pageId, next, loc.title);
}

/** 기록 하나의 글을 고쳐 쓴다. 시각과 그 기록에 붙은 사진은 그대로 둔다. */
async function editRecord(key, index, text) {
  const body = String(text || '').trim();
  if (!body) return { error: 'EMPTY' };
  const at = await locateRecord(key, index);
  if (at.error) return { error: at.error };
  const { loc, content, lines, span, opLines } = at;

  const m = TIME_RE.exec(lines[span.from].text);
  const prefix = m ? m[0] : '';
  // 그 기록에 붙어 있던 사진은 살린다 — 글만 고치는 자리라서.
  const images = [];
  for (let i = span.from; i < span.to; i++) {
    for (const op of (opLines[i] || { ops: [] }).ops) {
      if (op.insert && typeof op.insert === 'object' && op.insert.image) images.push(op);
    }
  }
  const parts = body.split('\n');
  const made = parts.map((t, i) => ({
    ops: [
      ...(i === 0 && prefix ? [{ insert: prefix }] : []),
      ...textOps(t),
      ...(i === parts.length - 1 ? images : []),
    ],
    nl: i === 0 ? (opLines[span.from] || {}).nl || null : null,
  }));
  opLines.splice(span.from, span.to - span.from, ...made);
  await saveEdited(loc, content, joinOpLines(opLines));
  return { success: true, ...loc };
}

/** 기록 하나를 지운다 (딸린 줄과 사진까지). */
async function deleteRecord(key, index) {
  const at = await locateRecord(key, index);
  if (at.error) return { error: at.error };
  const { loc, content, span, opLines } = at;
  opLines.splice(span.from, span.to - span.from);
  await saveEdited(loc, content, joinOpLines(opLines));
  return { success: true, ...loc };
}

/** 한 날짜의 기록 카드 목록. */
async function readDay(key) {
  const ts = keyToTs(key);
  if (ts === null) return { date: key, records: [] };
  const loc = await ensureDayPage(ts, { create: false });
  if (!loc) return { date: key, records: [], page: null };
  const content = await noteStorage.loadPage(loc.notebookId, loc.sectionId, loc.pageId);
  return { date: key, records: linesToRecords(deltaToLines(content && content.delta)), page: loc };
}

/** 날짜 목록. 기록이 있는 날은 개수를, 없는 날은 0을 돌려준다 — 빈 날도 목록에
 *  한 줄로 남겨 "그날은 아무것도 없었다"가 보이게 하려는 것.
 *
 *  withRecords를 주면 각 날의 기록까지 함께 돌려준다. 어차피 개수를 세려고
 *  페이지를 읽고 있어서 거의 공짜다 — 여러 날짜를 한 화면에 이어 보여줄 때
 *  날짜마다 IPC를 왕복하지 않게 하려는 것.
 *  days = 0 이면 달력으로 빈 날을 채우지 않고, 기록이 있는 날만 돌려준다. */
async function listDays({ days = 30, withRecords = false } = {}) {
  const nbs = await noteStorage.getNotebooks();
  const nb = nbs.find((n) => n.name === NOTEBOOK_NAME && !n.deletedAt);
  const counts = new Map();
  if (nb) {
    for (const sec of await noteStorage.getSections(nb.id)) {
      if (sec.deletedAt) continue;
      for (const pg of await noteStorage.getPages(nb.id, sec.id)) {
        if (pg.deletedAt) continue;
        const key = (pg.title || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
        const content = await noteStorage.loadPage(nb.id, sec.id, pg.id).catch(() => null);
        const records = linesToRecords(deltaToLines(content && content.delta));
        counts.set(key, {
          count: records.length,
          records: withRecords ? records : undefined,
          page: { notebookId: nb.id, sectionId: sec.id, pageId: pg.id, title: pg.title },
        });
      }
    }
  }
  // 최근 N일 + 기록이 있는 모든 날을 합쳐 최신순으로.
  const keys = new Set(counts.keys());
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) keys.add(dateKey(today.getTime() - i * 86400000));
  return [...keys].sort().reverse().map((key) => {
    const [y, m, d] = key.split('-').map(Number);
    const hit = counts.get(key);
    return {
      date: key,
      label: `${y}년 ${m}월 ${d}일 (${DOW[new Date(y, m - 1, d).getDay()]})`,
      count: hit ? hit.count : 0,
      records: withRecords ? (hit && hit.records) || [] : undefined,
      page: hit ? hit.page : null,
    };
  });
}

module.exports = {
  NOTEBOOK_NAME, append, appendImage, editRecord, deleteRecord, readDay, listDays,
  ensureDayPage, dateKey, dayTitle, timeLabel, deltaToLines, linesToRecords,
  linkSegments, recordSpans,
};
