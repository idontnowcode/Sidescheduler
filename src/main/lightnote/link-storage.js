const path = require('path');
const fs = require('fs');

let DATA_ROOT = '';

function init(dataRoot) {
  DATA_ROOT = dataRoot;
}

function linksPath() {
  return path.join(DATA_ROOT, 'page-links.json');
}

function loadLinks() {
  try {
    if (fs.existsSync(linksPath())) {
      return JSON.parse(fs.readFileSync(linksPath(), 'utf-8'));
    }
  } catch {}
  return [];
}

function saveLinks(links) {
  const dir = path.dirname(linksPath());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = linksPath() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(links, null, 2));
  try { fs.renameSync(tmp, linksPath()); } catch { fs.copyFileSync(tmp, linksPath()); try { fs.unlinkSync(tmp); } catch {} }
}

function addLink(pageId, notebookId, sectionId, kind, itemId) {
  const links = loadLinks();
  let entry = links.find(l => l.pageId === pageId);
  if (!entry) {
    entry = { pageId, notebookId, sectionId, linkedEvents: [], linkedTasks: [] };
    links.push(entry);
  }
  if (kind === 'event') {
    if (!entry.linkedEvents.includes(itemId)) entry.linkedEvents.push(itemId);
  } else {
    if (!entry.linkedTasks.includes(itemId)) entry.linkedTasks.push(itemId);
  }
  saveLinks(links);
}

function removeLink(pageId, kind, itemId) {
  const links = loadLinks();
  const entry = links.find(l => l.pageId === pageId);
  if (!entry) return;
  if (kind === 'event') {
    entry.linkedEvents = entry.linkedEvents.filter(id => id !== itemId);
  } else {
    entry.linkedTasks = entry.linkedTasks.filter(id => id !== itemId);
  }
  if (entry.linkedEvents.length === 0 && entry.linkedTasks.length === 0) {
    saveLinks(links.filter(l => l.pageId !== pageId));
  } else {
    saveLinks(links);
  }
}

function getLinksByPage(pageId) {
  const links = loadLinks();
  return links.find(l => l.pageId === pageId) || null;
}

function getLinksByItem(kind, itemId) {
  const links = loadLinks();
  return links
    .filter(l => kind === 'event' ? l.linkedEvents.includes(itemId) : l.linkedTasks.includes(itemId))
    .map(l => ({ pageId: l.pageId, notebookId: l.notebookId, sectionId: l.sectionId }));
}

function removePageLinks(pageId) {
  saveLinks(loadLinks().filter(l => l.pageId !== pageId));
}

/** Drop a deleted event/task id from every page link, then prune empty entries.
 *  Called when an event/task is deleted in the planner so no orphan refs remain. */
function removeItemLinks(kind, itemId) {
  const links = loadLinks();
  let changed = false;
  for (const entry of links) {
    const arr = kind === 'event' ? 'linkedEvents' : 'linkedTasks';
    const before = entry[arr].length;
    entry[arr] = entry[arr].filter(id => id !== itemId);
    if (entry[arr].length !== before) changed = true;
  }
  if (changed) {
    saveLinks(links.filter(l => l.linkedEvents.length > 0 || l.linkedTasks.length > 0));
  }
}

module.exports = { init, addLink, removeLink, getLinksByPage, getLinksByItem, removePageLinks, removeItemLinks };
