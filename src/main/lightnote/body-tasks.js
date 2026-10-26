// 본문에 체크박스로 적어둔 줄을 "할 일"로 모은다.
//
// 업무 속성의 "다음 Action"만 할 일로 세면, 정작 노트에 체크박스로 적어둔
// 것들이 어디에도 안 잡힌다. 적는 사람 입장에선 둘 다 할 일이다.
//
// 체크박스는 **본문이 원본**이다. 따로 복사해 두지 않고 그때그때 읽는다 —
// 복사해 두면 본문에서 지운 줄이 할 일 목록에 유령으로 남는다. AI-free.
const noteStorage = require('./note-storage');
const { splitOpLines, joinOpLines, lineText } = require('./delta-lines');

const isBox = (nl) => nl && (nl.list === 'checked' || nl.list === 'unchecked');

/** 체크박스 줄만 추려낸다. line 번호는 splitOpLines 기준이라 toggle과 맞는다. */
function checkboxLines(delta) {
  const out = [];
  splitOpLines(delta).forEach((ln, i) => {
    if (!isBox(ln.nl)) return;
    const text = lineText(ln).trim();
    if (!text) return;   // 적다 만 빈 줄은 할 일이 아니다
    out.push({ line: i, text, done: ln.nl.list === 'checked' });
  });
  return out;
}

// ── 업무 페이지의 본문 A/I (docs/02-design/features/work-page.design.md) ─────────────
// 본문이 원본: 'Action Item'(Action·A/I·액션) 소제목 아래 체크칸 줄이 곧 A/I.
// 줄 끝 '~MM/DD' 는 기한, 체크된 줄의 줄 날짜(수정)는 완료 날짜.
const isActionHead = (t) => /action|a\/i|액션/i.test(t || '');
const DUE_RE = /\s*~\s*(\d{1,2})\/(\d{1,2})\s*$/;
function dueFrom(text, base) {
  const m = DUE_RE.exec(text);
  if (!m) return null;
  const ref = new Date(base || Date.now());
  const d = new Date(ref.getFullYear(), Number(m[1]) - 1, Number(m[2]), 12, 0, 0, 0);
  // 연도가 없으니 기준일에서 반년 넘게 지난 날짜면 내년으로 본다
  if (d.getTime() < ref.getTime() - 183 * 86400000) d.setFullYear(d.getFullYear() + 1);
  return d.getTime();
}
function bodyActions(delta) {
  const out = [];
  let inAction = false;
  splitOpLines(delta).forEach((ln, i) => {
    const nl = ln.nl || {};
    const raw = lineText(ln).trim();
    if (nl.header) { inAction = isActionHead(raw); return; }
    if (!inAction || !isBox(nl) || !raw) return;
    const lt = typeof nl.linetime === 'string' ? nl.linetime.split('-').map(Number) : null;
    const done = nl.list === 'checked';
    out.push({
      id: `body:${i}`, text: raw.replace(DUE_RE, '').trim(), lineText: raw, line: i,
      done, doneAt: done && lt ? (lt[1] || lt[0] || null) : null,
      due: dueFrom(raw, lt ? lt[0] : null), taskId: null, fromBody: true,
    });
  });
  return out;
}

/** 보이는 모든 페이지에서 체크박스 줄을 모은다. */
async function list() {
  const out = [];
  for (const nb of await noteStorage.getVisibleNotebooks()) {
    for (const sec of await noteStorage.getVisibleSections(nb.id)) {
      for (const pg of await noteStorage.getVisiblePages(nb.id, sec.id)) {
        let content = null;
        try { content = await noteStorage.loadPage(nb.id, sec.id, pg.id); } catch { continue; }
        const boxes = checkboxLines(content && content.delta);
        if (!boxes.length) continue;
        out.push({
          notebookId: nb.id, sectionId: sec.id, pageId: pg.id,
          title: pg.title, notebookName: nb.name, sectionName: sec.name,
          items: boxes,
        });
      }
    }
  }
  return out;
}

/** 목록에서 체크를 누르면 **본문 그 줄**을 바꾼다(원본이 본문이므로).
 *
 *  줄 번호는 조금 전에 읽은 것이라, 그 사이 본문이 바뀌었을 수 있다.
 *  글자를 함께 대조해, 다른 줄을 엉뚱하게 체크하는 일을 막는다. */
async function toggle(notebookId, sectionId, pageId, line, expectText) {
  const content = await noteStorage.loadPage(notebookId, sectionId, pageId);
  const lines = splitOpLines(content && content.delta);
  const ln = lines[line];
  if (!ln) return { error: 'NO_LINE' };
  if (!isBox(ln.nl)) return { error: 'NOT_A_CHECKBOX' };
  if (expectText && lineText(ln).trim() !== String(expectText).trim()) return { error: 'MOVED' };

  const done = ln.nl.list !== 'checked';
  // 편집기 밖에서 체크해도 줄 날짜(수정)를 남긴다 — 주간 보고의 완료 날짜가 된다
  const now = Date.now();
  const lt = typeof ln.nl.linetime === 'string' ? ln.nl.linetime.split('-').map(Number) : null;
  ln.nl = { ...ln.nl, list: done ? 'checked' : 'unchecked', linetime: `${(lt && lt[0]) || now}-${now}` };
  const res = await noteStorage.savePage(notebookId, sectionId, pageId, joinOpLines(lines), content.title);
  return { success: true, done, updatedAt: res && res.updatedAt };
}

module.exports = { list, toggle, checkboxLines, bodyActions };
