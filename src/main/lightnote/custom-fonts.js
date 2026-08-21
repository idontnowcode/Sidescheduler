// User-supplied fonts: drop a .ttf/.otf/.woff/.woff2 file into this folder and
// it's available in LightNote's font picker from the next launch (scanned
// once at startup — no filesystem watcher, keeps this simple). The font's
// bytes are read once and handed to the renderer as a data: URI so the
// @font-face rule doesn't depend on file:// access from the renderer.
const path = require('path');
const fs = require('fs').promises;

let FONTS_DIR = '';

function init(appDataRoot) {
  // appDataRoot = the electron 'lightnote' folder (sibling to lightnote-data)
  FONTS_DIR = path.join(appDataRoot, 'fonts');
}

async function ensureDir() {
  await fs.mkdir(FONTS_DIR, { recursive: true });
}

const EXT_MIME = { '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2' };

// Derive a usable CSS font-family name from the filename: strip the
// extension, replace separators with spaces, drop characters that would
// break out of a quoted CSS string.
function familyFromFilename(filename) {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/['"\\]/g, '')
    .trim() || filename;
}

async function list() {
  await ensureDir();
  let entries;
  try {
    entries = await fs.readdir(FONTS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const ext = path.extname(e.name).toLowerCase();
    const mime = EXT_MIME[ext];
    if (!mime) continue;
    try {
      const buf = await fs.readFile(path.join(FONTS_DIR, e.name));
      out.push({ id: e.name, family: familyFromFilename(e.name), dataUrl: `data:${mime};base64,${buf.toString('base64')}` });
    } catch { /* unreadable file — skip */ }
  }
  return out;
}

function folderPath() { return FONTS_DIR; }

module.exports = { init, list, folderPath, ensureDir };
