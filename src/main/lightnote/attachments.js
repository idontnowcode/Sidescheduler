// File attachments (PDF/xlsx/pptx/zip…). Images stay as they are — embedded
// as base64 in the page delta — but real documents would bloat the note JSON,
// so they're copied next to the page instead:
//   <DATA_ROOT>/attachments/<pageId>/<uuid><ext>
// The delta only carries a link (lnfile://<pageId>/<file>), which the editor
// turns into a clickable chip that opens the file in its default app.
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

let DATA_ROOT = '';

function init(dataRoot) { DATA_ROOT = dataRoot; }

function pageDir(pageId) { return path.join(DATA_ROOT, 'attachments', pageId); }

function safeName(name) {
  return String(name || 'file').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
}

/** Copy a picked file into the page's attachment folder. */
async function add(pageId, sourcePath) {
  const orig = safeName(path.basename(sourcePath));
  const ext = path.extname(orig);
  const stored = `${crypto.randomUUID()}${ext}`;
  const dir = pageDir(pageId);
  await fs.mkdir(dir, { recursive: true });
  await fs.copyFile(sourcePath, path.join(dir, stored));
  const { size } = await fs.stat(path.join(dir, stored));
  return { stored, name: orig, size };
}

/** 이미 메모리에 있는 바이트(클립보드 이미지 등)를 페이지 폴더에 새 파일로 쓴다. */
async function addBuffer(pageId, buffer, ext) {
  const safeExt = /^[a-z0-9]{1,8}$/i.test(String(ext || '')) ? `.${ext}` : '.png';
  const stored = `${crypto.randomUUID()}${safeExt}`;
  const dir = pageDir(pageId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, stored), buffer);
  return stored;
}

function resolve(pageId, stored) {
  // Guard against a crafted link escaping the page's own folder.
  const base = pageDir(pageId);
  const full = path.join(base, path.basename(String(stored || '')));
  return full.startsWith(base) ? full : null;
}

async function exists(pageId, stored) {
  const p = resolve(pageId, stored);
  if (!p) return false;
  try { await fs.access(p); return true; } catch { return false; }
}

async function removeAll(pageIds) {
  for (const id of pageIds || []) {
    try { await fs.rm(pageDir(id), { recursive: true, force: true }); } catch { /* ignore */ }
  }
  return { success: true };
}

module.exports = { init, add, addBuffer, resolve, exists, removeAll };
