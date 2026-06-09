const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

let DATA_ROOT = '';

function init(dataRoot) {
  DATA_ROOT = dataRoot;
}

function getImagesDir(notebookId, sectionId, pageId) {
  return path.join(DATA_ROOT, 'notebooks', notebookId, 'sections', sectionId, 'pages', pageId, 'images');
}

async function saveImage({ notebookId, sectionId, pageId, imageData, ext }) {
  const imagesDir = getImagesDir(notebookId, sectionId, pageId);
  await fs.mkdir(imagesDir, { recursive: true });

  const uuid = crypto.randomUUID();
  const safeExt = (ext || 'png').replace(/[^a-zA-Z0-9]/g, '').substring(0, 10) || 'png';
  const fileName = `${uuid}.${safeExt}`;
  const filePath = path.join(imagesDir, fileName);

  const buffer = typeof imageData === 'string'
    ? Buffer.from(imageData, 'base64')
    : Buffer.from(imageData);
  await fs.writeFile(filePath, buffer);
  return { filePath, fileName };
}

module.exports = { init, saveImage };
