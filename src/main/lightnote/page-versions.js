// Page version history: every save snapshots the PREVIOUS content, so an
// accidental overwrite (notably AI Organize, which rewrites the whole body)
// can be rolled back. Snapshots live outside the page file itself:
//   <DATA_ROOT>/versions/<pageId>/<timestamp>.json  = { title, delta, at }
// Kept to the most recent MAX_VERSIONS per page, and only written when the
// content actually changed and enough time passed since the last snapshot
// (autosave fires ~1s after every keystroke burst — snapshotting each one
// would bury real checkpoints under hundreds of near-identical entries).
const path = require('path');
const fs = require('fs').promises;

let DATA_ROOT = '';
const MAX_VERSIONS = 30;
const MIN_INTERVAL_MS = 3 * 60 * 1000; // don't snapshot more than once per 3 min per page

function init(dataRoot) { DATA_ROOT = dataRoot; }

function pageDir(pageId) { return path.join(DATA_ROOT, 'versions', pageId); }

async function list(pageId) {
  try {
    const files = await fs.readdir(pageDir(pageId));
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => ({ id: f.replace(/\.json$/, ''), at: Number(f.replace(/\.json$/, '')) || 0 }))
      .filter(v => v.at > 0)
      .sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

async function get(pageId, versionId) {
  try {
    return JSON.parse(await fs.readFile(path.join(pageDir(pageId), `${versionId}.json`), 'utf-8'));
  } catch {
    return null;
  }
}

async function prune(pageId) {
  const all = await list(pageId);
  for (const v of all.slice(MAX_VERSIONS)) {
    try { await fs.unlink(path.join(pageDir(pageId), `${v.id}.json`)); } catch { /* ignore */ }
  }
}

/**
 * Snapshot `prev` (the content being replaced). `force` bypasses the interval
 * throttle — used before destructive rewrites like AI Organize so there's
 * always a restore point regardless of timing.
 */
async function snapshot(pageId, prev, force = false) {
  if (!prev || !prev.delta) return { skipped: true };
  const versions = await list(pageId);
  const now = Date.now();
  if (!force && versions.length > 0 && now - versions[0].at < MIN_INTERVAL_MS) return { skipped: true };
  // Don't store an identical consecutive snapshot.
  if (versions.length > 0) {
    const last = await get(pageId, versions[0].id);
    if (last && JSON.stringify(last.delta) === JSON.stringify(prev.delta)) return { skipped: true };
  }
  const dir = pageDir(pageId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `${now}.json`),
    JSON.stringify({ at: now, title: prev.title || '', delta: prev.delta }, null, 2),
  );
  await prune(pageId);
  return { saved: true, at: now };
}

async function removeAll(pageIds) {
  for (const id of pageIds || []) {
    try { await fs.rm(pageDir(id), { recursive: true, force: true }); } catch { /* ignore */ }
  }
  return { success: true };
}

module.exports = { init, list, get, snapshot, removeAll, MAX_VERSIONS };
