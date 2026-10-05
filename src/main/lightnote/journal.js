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
const TIME_RE = /^(오전|오후)\s\d{1,2}:\d{2}\s\s?/;

/** 델타를 줄 단위로 쪼갠다. 줄 끝 newline op의 속성(목록·헤더)과 그 줄에 들어
 *  있는 이미지도 함께 들고 나온다 — 카드로 그릴 때 쓴다. */
function deltaToLines(delta) {
  const ops = (delta && delta.ops) || [];
  const lines = [];
  let cur = { text: '', images: [], attrs: null };
  for (const op of ops) {
    const ins = op.insert;
    if (typeof ins === 'string') {
      const parts = ins.split('\n');
      for (let i = 0; i < parts.length; i++) {
        cur.text += parts[i];
        if (i < parts.length - 1) {
          cur.attrs = op.attributes || null;
          lines.push(cur);
          cur = { text: '', images: [], attrs: null };
        }
      }
    } else if (ins && typeof ins === 'object' && ins.image) {
      cur.images.push(ins.image);
    }
  }
  if (cur.text.trim() || cur.images.length) lines.push(cur);
  return lines;
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
        images: ln.images.slice(),
        list: (ln.attrs && ln.attrs.list) || null,
        extra: [],
      });
    } else if (records.length) {
      const last = records[records.length - 1];
      if (ln.text.trim() || ln.images.length) {
        last.extra.push({ text: ln.text, images: ln.images, list: (ln.attrs && ln.attrs.list) || null });
      }
    } else if (ln.text.trim() || ln.images.length) {
      // 시각 없는 첫 줄들(직접 쓴 메모) — 시각 없는 기록으로 둔다.
      records.push({ time: '', text: ln.text, images: ln.images.slice(), list: (ln.attrs && ln.attrs.list) || null, extra: [] });
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

/** 오늘(또는 주어진 시각) 날짜 페이지 끝에 기록 한 줄을 붙인다. */
async function append(text, at = Date.now()) {
  const body = String(text || '').trim();
  if (!body) return { error: 'EMPTY' };
  const loc = await ensureDayPage(at);
  const content = await noteStorage.loadPage(loc.notebookId, loc.sectionId, loc.pageId);
  const delta = (content && content.delta) || { ops: [] };
  const line = `${timeLabel(at)}  ${body}\n`;
  const plain = deltaToLines(delta).map((l) => l.text).join('').trim();
  const ops = plain ? [...(delta.ops || []), { insert: line }] : [{ insert: line }];
  await noteStorage.savePage(loc.notebookId, loc.sectionId, loc.pageId, { ops }, loc.title);
  return { success: true, ...loc, at };
}

/** 한 날짜의 기록 카드 목록. */
async function readDay(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  if (!y || !m || !d) return { date: key, records: [] };
  const loc = await ensureDayPage(new Date(y, m - 1, d).getTime(), { create: false });
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
  NOTEBOOK_NAME, append, readDay, listDays, ensureDayPage,
  dateKey, dayTitle, timeLabel, deltaToLines, linesToRecords,
};
