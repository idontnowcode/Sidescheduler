// 스티커 메모 — 바탕화면에 붙여두는 작은 창 하나가 노트 하나다.
//
// 따로 저장소를 만들지 않고 "메모" 노트북 안의 보통 페이지로 둔다. 기록장과
// 같은 생각이다 — 그래야 적어둔 메모가 검색·내보내기·업무 속성·휴지통에
// 전부 그대로 걸리고, 나중에 제대로 된 노트로 키워 쓸 수 있다. AI-free.
const noteStorage = require('./note-storage');

const NOTEBOOK_NAME = '메모';
const NOTEBOOK_COLOR = '#f59f00';
const SECTION_NAME = '메모';
const UNTITLED = '새 메모';

async function ensureNotebook() {
  const nbs = await noteStorage.getNotebooks();
  const found = nbs.find((n) => n.name === NOTEBOOK_NAME && !n.deletedAt);
  return found || noteStorage.createNotebook(NOTEBOOK_NAME, NOTEBOOK_COLOR);
}

async function ensureSection(notebookId) {
  const secs = await noteStorage.getSections(notebookId);
  const found = secs.find((s) => s.name === SECTION_NAME && !s.deletedAt);
  return found || noteStorage.createSection(notebookId, SECTION_NAME, null);
}

/** 빈 메모 한 장을 만든다. 제목은 첫 줄을 적는 순간 따라 바뀐다. */
async function newNote() {
  const nb = await ensureNotebook();
  const sec = await ensureSection(nb.id);
  const page = await noteStorage.createPage(nb.id, sec.id, UNTITLED);
  return { notebookId: nb.id, sectionId: sec.id, pageId: page.id, title: UNTITLED };
}

/** 첫 줄을 제목으로 삼는다 — 스티커에는 제목 칸을 따로 두지 않는다. */
function titleFromText(text) {
  const first = String(text || '').split('\n').map((l) => l.trim()).find((l) => l) || '';
  return first.slice(0, 50) || UNTITLED;
}

module.exports = { NOTEBOOK_NAME, UNTITLED, ensureNotebook, ensureSection, newNote, titleFromText };
