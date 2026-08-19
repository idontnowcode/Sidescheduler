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

// Build one work item's block. Empty fields are omitted entirely — the
// sub-letters (a/b/c…) are assigned to whatever's actually present, in order,
// so there are never gaps like "a. … c. …" from a skipped field.
function buildItemBlock(index, title, wo) {
  const sections = []; // { label, lines: string[] | null (null = single-line, label already has the value) }

  if (wo.due) sections.push({ label: `목표 기한: ${fmtDate(wo.due)}`, lines: null });
  if (wo.background && wo.background.trim()) sections.push({ label: '배경', lines: wo.background.trim().split('\n') });
  if (wo.purpose && wo.purpose.trim()) sections.push({ label: '목적', lines: wo.purpose.trim().split('\n') });

  const progress = [...(wo.progressLog || [])].sort((a, b) => a.at - b.at); // chronological for the report, regardless of panel (newest-first) order
  if (progress.length) sections.push({ label: '진행 현황', lines: progress.map((p) => `- ${fmtDate(p.at)}: ${p.text}`) });

  const todoActions = (wo.nextActions || []).filter((a) => !a.done);
  if (todoActions.length) sections.push({ label: 'Action Item (미완료)', lines: todoActions.map((a) => `- ${a.text}`) });

  const pending = (wo.pendingDecisions || []).filter((p) => !p.resolved);
  if (pending.length) sections.push({ label: '의사결정 필요 사항', lines: pending.map((p) => `- ${p.text}`) });

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

module.exports = { buildReport };
