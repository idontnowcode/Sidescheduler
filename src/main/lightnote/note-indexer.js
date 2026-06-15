const noteStorage = require('./note-storage');

const pageCache = new Map();

function invalidateCache(pageId) {
  pageCache.delete(pageId);
}

function clearCache() {
  pageCache.clear();
}

function extractText(delta) {
  if (!delta || !Array.isArray(delta.ops)) return '';
  return delta.ops
    .filter(op => typeof op.insert === 'string')
    .map(op => op.insert)
    .join('');
}

// Korean particles (josa), longest first so multi-char strip before single-char.
const JOSA = ['이라고', '으로', '에서', '에게', '까지', '부터', '이나', '은', '는', '이', '가', '을', '를', '에', '의', '도', '와', '과', '로', '만', '요', '들']
  .sort((a, b) => b.length - a.length);

/** Normalize a token: lowercase, strip English plural, strip Korean particle. */
function normToken(w) {
  w = w.toLowerCase();
  if (/^[a-z]+s$/.test(w) && w.length > 3) w = w.slice(0, -1);          // meetings → meeting
  for (const j of JOSA) {
    if (w.length > j.length + 1 && w.endsWith(j)) { w = w.slice(0, -j.length); break } // 프로젝트는 → 프로젝트
  }
  return w;
}

/** Tokenize into normalized stems (latin words/numbers + Hangul runs). */
function tokenize(text) {
  return (String(text).toLowerCase().match(/[a-z0-9]+|[가-힣]+/g) || [])
    .map(normToken)
    .filter(w => w.length >= 2);
}

function buildTokenCounts(text) {
  const m = new Map();
  for (const t of tokenize(text)) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

function scoreContent(page, queryTokens) {
  if (queryTokens.length === 0) return 1;
  const title = page._titleTokens || new Set();
  const counts = page._tokenCounts || new Map();
  let score = 0;
  for (const q of queryTokens) {
    if (title.has(q)) score += 3;
    let hit = counts.get(q) || 0;
    // prefix/substring fallback for compounds (e.g. q "회의" inside "주간회의")
    if (hit === 0) {
      for (const [tok, c] of counts) { if (tok.includes(q) || q.includes(tok)) { hit += c; if (hit >= 5) break } }
    }
    score += Math.min(hit, 5);
  }
  return score;
}

async function getRelevantPages(question, maxPages = 5) {
  const notebooks = await noteStorage.getNotebooks();
  const result = [];

  for (const nb of notebooks) {
    const sections = await noteStorage.getSections(nb.id);
    for (const sec of sections) {
      const pages = await noteStorage.getPages(nb.id, sec.id);
      for (const page of pages) {
        if (pageCache.has(page.id)) {
          result.push(pageCache.get(page.id));
          continue;
        }
        try {
          const content = await noteStorage.loadPage(nb.id, sec.id, page.id);
          const text = extractText(content.delta);
          const entry = {
            notebookId: nb.id,
            sectionId: sec.id,
            pageId: page.id,
            notebookName: nb.name,
            sectionName: sec.name,
            pageName: page.title,
            name: page.title,
            text,
            content: text,
            path: `${nb.name}/${sec.name}/${page.title}`,
            isVirtual: true,
            _titleTokens: new Set(tokenize(page.title)),
            _tokenCounts: buildTokenCounts(`${page.title} ${text}`),
          };
          pageCache.set(page.id, entry);
          result.push(entry);
        } catch {}
      }
    }
  }

  const queryTokens = [...new Set(tokenize(question))];
  const scored = result.map(p => ({ ...p, score: scoreContent(p, queryTokens) }));
  return scored
    .filter(p => p.score > 0)            // drop pages that match nothing → no hallucinated citations
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPages);
}

module.exports = { getRelevantPages, invalidateCache, clearCache };
