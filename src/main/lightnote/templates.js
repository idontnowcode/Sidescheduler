// Page templates: reusable page skeletons (e.g. a 업무 페이지 뼈대) saved as
// deltas under <DATA_ROOT>/templates/<id>.json = { id, name, delta, at }.
// "새 페이지"에서 고르면 그 내용으로 페이지가 만들어진다.
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

let DATA_ROOT = '';

function init(dataRoot) { DATA_ROOT = dataRoot; }
function dir() { return path.join(DATA_ROOT, 'templates'); }

async function list() {
  try {
    const files = await fs.readdir(dir());
    const out = [];
    for (const f of files.filter(f => f.endsWith('.json'))) {
      try {
        const t = JSON.parse(await fs.readFile(path.join(dir(), f), 'utf-8'));
        if (t && t.id && t.name) out.push({ id: t.id, name: t.name, at: t.at || 0 });
      } catch { /* skip unreadable */ }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  } catch {
    return [];
  }
}

async function get(id) {
  try {
    return JSON.parse(await fs.readFile(path.join(dir(), `${path.basename(String(id))}.json`), 'utf-8'));
  } catch {
    return null;
  }
}

async function save(name, delta) {
  const id = crypto.randomUUID();
  await fs.mkdir(dir(), { recursive: true });
  const t = { id, name: String(name || '템플릿').slice(0, 80), delta, at: Date.now() };
  await fs.writeFile(path.join(dir(), `${id}.json`), JSON.stringify(t, null, 2));
  return { id: t.id, name: t.name, at: t.at };
}

async function remove(id) {
  try { await fs.unlink(path.join(dir(), `${path.basename(String(id))}.json`)); } catch { /* ignore */ }
  return { success: true };
}

module.exports = { init, list, get, save, remove };
