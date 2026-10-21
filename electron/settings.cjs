const path = require('node:path');
const fs = require('node:fs/promises');

// Preferences only. Archive lists and passwords are never written to disk.
const DEFAULT_SETTINGS = {
  language: 'en',
  explorerMenu: false,
  openFolderAfter: false,
  propagateZone: true,
  trashAfterExtract: false
};
const LANGUAGES = new Set(['en', 'ja', 'vi']);

function sanitize(input = {}) {
  return {
    language: LANGUAGES.has(input.language) ? input.language : DEFAULT_SETTINGS.language,
    explorerMenu: Boolean(input.explorerMenu),
    openFolderAfter: Boolean(input.openFolderAfter),
    propagateZone: input.propagateZone === undefined ? DEFAULT_SETTINGS.propagateZone : Boolean(input.propagateZone),
    trashAfterExtract: Boolean(input.trashAfterExtract)
  };
}

class SettingsStore {
  constructor(folder) {
    this.file = path.join(folder, 'settings.json');
    this.value = { ...DEFAULT_SETTINGS };
  }

  async load() {
    try {
      this.value = sanitize(JSON.parse(await fs.readFile(this.file, 'utf8')));
    } catch {
      this.value = { ...DEFAULT_SETTINGS };
    }
    return this.value;
  }

  async update(patch) {
    this.value = sanitize({ ...this.value, ...patch });
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(this.value, null, 2), 'utf8');
    return this.value;
  }
}

module.exports = { SettingsStore, DEFAULT_SETTINGS, sanitize };
