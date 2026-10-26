// Build a "업무 진행 현황 보고서" — a plain-text outline (번호-문자 개조식:
// "1." → "a." → "-", no Markdown "#" headers, per user feedback that headers
// read as "AI가 정리한" rather than a proper business document) from a set of
// work-object pages, for pasting into Copilot/Word. AI-free: pure field
// formatting, no AI API call anywhere in this path.
const noteStorage = require('./note-storage');
const workObjectStorage = require('./work-object-storage');

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function fmtDate(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Month/day only (no year) — for Action/진행 현황 line labels.
function fmtMD(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

// 필드 → 섹션 목록. Action Item(미완료만) / 의사결정 필요사항(미해결만) /
// 진행 현황(시간순) 등 "무엇을 어떻게 거를지"는 여기 한 곳에만 있다 —
// 개조식 보고서 텍스트와 PDF 내보내기의 "업무 요약" 블록이 이 로직을
// 같이 쓰므로, 둘 사이에 규칙이 어긋날 일이 없다.
function buildFieldSections(wo) {
  const sections = []; // { label, lines: string[] | null (null = single-line, label already has the value) }

  if (wo.due) sections.push({ label: `목표 기한: ${fmtDate(wo.due)}`, lines: null });
  if (wo.background && wo.background.trim()) sections.push({ label: '배경', lines: wo.background.trim().split('\n') });
  if (wo.purpose && wo.purpose.trim()) sections.push({ label: '목적', lines: wo.purpose.trim().split('\n') });

  const progress = [...(wo.progressLog || [])].sort((a, b) => a.at - b.at); // chronological for the report, regardless of panel (newest-first) order
  if (progress.length) {
    sections.push({ label: '진행 현황', lines: progress.map((p) => `- ${p.text} (${fmtMD(p.at)})`) });
  }

  const todoActions = (wo.nextActions || []).filter((a) => !a.done);
  if (todoActions.length) {
    sections.push({
      label: 'Action Item',
      lines: todoActions.map((a) => `- ${a.text}${a.due ? ` (~${fmtMD(a.due)})` : ''}`),
    });
  }

  const pending = (wo.pendingDecisions || []).filter((p) => !p.resolved);
  if (pending.length) sections.push({ label: '의사결정 필요 사항', lines: pending.map((p) => `- ${p.text}`) });

  return sections;
}

// Build one work item's block. Empty fields are omitted entirely — the
// sub-letters (a/b/c…) are assigned to whatever's actually present, in order,
// so there are never gaps like "a. … c. …" from a skipped field.
function buildItemBlock(index, title, wo) {
  const sections = buildFieldSections(wo);
  const out = [`${index}. ${title || '(제목 없음)'}`];
  sections.forEach((s, i) => {
    const letter = LETTERS[i] || `(${i + 1})`;
    out.push(`    ${letter}. ${s.label}`);
    if (s.lines) for (const line of s.lines) out.push(`       ${line}`);
  });
  return out.join('\n');
}

/** pageIds -> full outline report text. Skips ids that no longer resolve to a
 *  visible page (deleted/trashed since selection). Items are ordered by due
 *  date ascending (undated last) — independent of the selection order, so a
 *  filter change between selecting and exporting can't silently reorder or
 *  drop anything from the picked set. */
async function buildReport(pageIds) {
  const items = [];
  for (const pid of pageIds) {
    const loc = await noteStorage.findPageLocation(pid);
    if (!loc) continue;
    const wo = (await workObjectStorage.get(pid)) || workObjectStorage.blank();
    items.push({ title: loc.title, wo });
  }
  items.sort((a, b) => (a.wo.due ?? Infinity) - (b.wo.due ?? Infinity));

  const out = ['업무 진행 현황 보고서', `생성일: ${fmtDate(Date.now())}`, ''];
  items.forEach((it, i) => {
    out.push(buildItemBlock(i + 1, it.title, it.wo));
    out.push('');
  });
  return { text: out.join('\n').trimEnd() + '\n', count: items.length };
}

// ── 주간 업무 현황 보고 (A안: 업무별 묶음) ─────────────────────────────────
// 설계: docs/02-design/features/weekly-report.design.md. 이미 쌓이는 기록을
// 기간으로 걸러 업무마다 금주 실적·차주 계획·이슈로 묶는다. AI 없음.
const DAY = 24 * 60 * 60 * 1000;
function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function mondayOf(ts) { const d = new Date(startOfDay(ts)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
function addDays(ts, n) { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); }
function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / DAY); }

/** 기준 주(월 00:00 ~ 일 23:59:59.999)와 다음 주. week: 'this' | 'last'.
 *  ref = 지연 일수를 셀 기준일 — 이번 주면 오늘, 지난 주면 그 주 일요일. */
function weekRange(now = Date.now(), week = 'this') {
  const ws = week === 'last' ? addDays(mondayOf(now), -7) : mondayOf(now);
  const we = addDays(ws, 7) - 1;
  const nws = addDays(ws, 7);
  const nwe = addDays(ws, 14) - 1;
  const ref = week === 'last' ? startOfDay(we) : startOfDay(now);
  const asOf = week === 'last' ? we : now; // 열림/닫힘을 판단할 시점
  return { ws, we, nws, nwe, ref, asOf };
}

const inRange = (ts, a, b) => ts != null && ts >= a && ts <= b;

// 기준 시점 T 에 아직 열려 있던 것 — 지난 주 보고는 그 주 끝의 상태로 판단해야 한다
// (그 뒤에 완료·해결된 것은 그때는 열려 있었고, 그 뒤에 생긴 것은 그때 없었다).
const actionOpenAt = (a, T) => !a.done || (a.doneAt != null && a.doneAt > T);
const decisionOpenAt = (p, T) => (p.raisedAt == null || p.raisedAt <= T) && (!p.resolved || (p.resolvedAt != null && p.resolvedAt > T));

// ── 본문 줄 읽기 ────────────────────────────────────────────────────────────
// delta → 줄 목록. 줄 속성(header·list·indent·linetime)은 줄 끝 '\n' 에 붙어 있다.
// 이미지 등 글자가 아닌 것은 건너뛴다.
function deltaLines(delta) {
  const lines = [];
  let buf = '';
  for (const op of (delta && delta.ops) || []) {
    if (typeof op.insert !== 'string') continue;
    const parts = op.insert.split('\n');
    for (let i = 0; i < parts.length; i++) {
      buf += parts[i];
      if (i < parts.length - 1) {
        const a = op.attributes || {};
        const lt = typeof a.linetime === 'string' ? a.linetime.split('-').map(Number) : null;
        lines.push({ text: buf, header: a.header || null, list: a.list || null, indent: a.indent || 0,
          created: lt ? lt[0] || null : null, modified: lt ? lt[1] || lt[0] || null : null });
        buf = '';
      }
    }
  }
  return lines;
}

const isActionSection = (name) => /action|a\/i|액션/i.test(name || '');
const DUE_IN_TEXT = /~\s*(\d{1,2})\/(\d{1,2})/;

// 본문 소제목 → 칸. 그 주(ws~we)에 수정 날짜가 든 줄만, Action 칸은 규칙이 다르다.
function bodySections(lines, range) {
  const { ws, we } = range;
  const sections = [];
  let cur = { name: '(본문)', lines: [] };
  const push = () => { if (cur.lines.length) sections.push(cur); };
  for (const ln of lines) {
    if (ln.header) { push(); cur = { name: ln.text.trim() || '(소제목 없음)', lines: [] }; continue; }
    if (!ln.text.trim()) continue;
    const pad = '    '.repeat(ln.indent || 0);
    const inWeek = ln.modified != null && ln.modified >= ws && ln.modified <= we;
    if (isActionSection(cur.name) && (ln.list === 'checked' || ln.list === 'unchecked')) {
      // A/I: 그 주에 체크한 것 = 완료, 체크 안 된 것은 날짜와 상관없이 지금 남은 일
      if (ln.list === 'checked' && inWeek) cur.lines.push(`${pad}- [완료] ${ln.text.trim()} (${fmtMD(ln.modified)})`);
      else if (ln.list === 'unchecked') cur.lines.push(`${pad}- ${ln.text.trim()}`);
      continue;
    }
    if (inWeek) cur.lines.push(`${pad}- ${ln.text.trim()} (${fmtMD(ln.modified)})`);
  }
  push();
  return sections;
}

// 예전 업무 패널 기록(본문 원본 이전)도 같은 칸 이름으로 합친다.
const CANON = ['진행 메모', '배경', '진행 현황', '논의 및 의사 결정 기록', 'Action Item', '참고 자료'];
function panelSections(wo, range) {
  const { ws, we, asOf } = range;
  const out = [];
  const prog = (wo.progressLog || []).filter((p) => p.at >= ws && p.at <= we).sort((a, b) => a.at - b.at)
    .map((p) => `- ${p.text} (${fmtMD(p.at)})`);
  if (prog.length) out.push({ name: '진행 현황', lines: prog });
  const dec = [
    ...(wo.decisions || []).filter((d) => d.at >= ws && d.at <= we).sort((a, b) => a.at - b.at).map((d) => `- 결정: ${d.text} (${fmtMD(d.at)})`),
    ...(wo.pendingDecisions || []).filter((p) => (p.raisedAt == null || p.raisedAt <= asOf) && (!p.resolved || (p.resolvedAt != null && p.resolvedAt > asOf)))
      .map((p) => `- 미결: ${p.text}`),
  ];
  if (dec.length) out.push({ name: '논의 및 의사 결정 기록', lines: dec });
  const acts = [
    ...(wo.nextActions || []).filter((a) => a.done && a.doneAt >= ws && a.doneAt <= we).map((a) => `- [완료] ${a.text} (${fmtMD(a.doneAt)})`),
    ...(wo.nextActions || []).filter((a) => !a.done || (a.doneAt != null && a.doneAt > asOf)).map((a) => `- ${a.text}${a.due ? ` (~${fmtMD(a.due)})` : ''}`),
  ];
  if (acts.length) out.push({ name: 'Action Item', lines: acts });
  return out;
}

function mergeSections(body, panel) {
  const out = body.map((s) => ({ name: s.name, lines: [...s.lines] }));
  const norm = (n) => n.replace(/\s+/g, '').toLowerCase();
  for (const p of panel) {
    const hit = out.find((s) => norm(s.name) === norm(p.name) || (isActionSection(s.name) && isActionSection(p.name)));
    if (hit) hit.lines.push(...p.lines);
    else out.push({ name: p.name, lines: [...p.lines] });
  }
  // 패널에서만 온 칸은 기본 틀 순서 자리로
  const bodyNames = new Set(body.map((s) => s.name));
  const head = out.filter((s) => bodyNames.has(s.name));
  const tail = out.filter((s) => !bodyNames.has(s.name)).sort((a, b) => CANON.indexOf(a.name) - CANON.indexOf(b.name));
  return [...head, ...tail];
}

function weeklyHeadState(wo, ref) {
  const late = wo.due && wo.status !== '완료' && startOfDay(wo.due) < ref;
  const state = late ? `지연 D+${daysBetween(wo.due, ref)}` : (wo.status || '');
  const parts = [state, wo.due ? `기한 ${fmtMD(wo.due)}` : ''].filter(Boolean);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

/** 업무로 등록된 페이지 전체 → 주간 보고(본문 소제목 그대로). 선택 없음.
 *  docs/02-design/features/work-page.design.md §4. AI 없음. */
async function buildWeeklyReport({ week = 'this', now = Date.now() } = {}) {
  const range = weekRange(now, week);
  const items = [];
  for (const wo of await workObjectStorage.list()) {
    if (!wo.enabled) continue;
    const loc = await noteStorage.findPageLocation(wo.pageId);
    if (!loc) continue;
    const page = await noteStorage.loadPage(loc.notebookId, loc.sectionId, wo.pageId);
    const sections = mergeSections(bodySections(deltaLines(page && page.delta), range), panelSections(wo, range));
    const hasWeek = sections.some((s) => s.lines.some((l) => /\(\d\d\/\d\d\)$/.test(l)));
    if (!hasWeek && (wo.status === '완료' || wo.status === '보류')) continue;
    items.push({ title: loc.title, wo, sections });
  }
  items.sort((a, b) => (a.wo.due ?? Infinity) - (b.wo.due ?? Infinity));
  const out = [`주간 업무 현황 (${fmtMD(range.ws)} ~ ${fmtMD(addDays(range.ws, 4))})`, `생성일: ${fmtDate(now)}`, ''];
  items.forEach((it, i) => {
    out.push(`${i + 1}. ${it.title || '(제목 없음)'}${weeklyHeadState(it.wo, range.ref)}`);
    it.sections.forEach((s, j) => {
      out.push(`    ${LETTERS[j] || `(${j + 1})`}. ${s.name}`);
      for (const line of s.lines) out.push(`        ${line}`);
    });
    out.push('');
  });
  return { text: out.join('\n').trimEnd() + '\n', count: items.length, range };
}

module.exports = { buildReport, buildFieldSections, buildWeeklyReport, weekRange, deltaLines, bodySections };
