const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let _safeStorage = null;

function init(safeStorage) {
  _safeStorage = safeStorage;
}

/**
 * Settings file lives alongside standalone LightNote's userData path
 * so that API keys survive between standalone and embedded usage.
 */
function getSettingsFile() {
  return path.join(app.getPath('appData'), 'lightnote', 'lightnote-settings.json');
}

function saveApiKey(key) {
  const SETTINGS_FILE = getSettingsFile();
  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  if (_safeStorage && _safeStorage.isEncryptionAvailable()) {
    const encrypted = _safeStorage.encryptString(key);
    const settings = loadRawSettings();
    settings.encryptedApiKey = encrypted.toString('base64');
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings));
  } else {
    const settings = loadRawSettings();
    settings.apiKeyPlain = key;
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings));
  }
}

function loadApiKey() {
  const settings = loadRawSettings();
  if (_safeStorage && _safeStorage.isEncryptionAvailable() && settings.encryptedApiKey) {
    const buf = Buffer.from(settings.encryptedApiKey, 'base64');
    return _safeStorage.decryptString(buf);
  }
  return settings.apiKeyPlain || null;
}

function hasApiKey() {
  return !!loadApiKey();
}

function loadRawSettings() {
  try {
    const file = getSettingsFile();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (_) {}
  return {};
}

module.exports = { init, saveApiKey, loadApiKey, hasApiKey };
