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

function scoreContent(page, question) {
  const words = question.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  if (words.length === 0) return 1;
  const name = (page.pageName || '').toLowerCase();
  const content = (page.text || '').toLowerCase();
  let score = 0;
  for (const word of words) {
    if (name.includes(word)) score += 3;
    const count = (content.match(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    score += Math.min(count, 5);
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
          const entry = {
            notebookId: nb.id,
            sectionId: sec.id,
            pageId: page.id,
            notebookName: nb.name,
            sectionName: sec.name,
            pageName: page.title,
            name: page.title,
            text: extractText(content.delta),
            content: extractText(content.delta),
            path: `${nb.name}/${sec.name}/${page.title}`,
            isVirtual: true,
          };
          pageCache.set(page.id, entry);
          result.push(entry);
        } catch {}
      }
    }
  }

  const scored = result.map(p => ({ ...p, score: scoreContent(p, question) }));
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPages);
}

module.exports = { getRelevantPages, invalidateCache, clearCache };
