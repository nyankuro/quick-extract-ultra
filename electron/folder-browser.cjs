const fs = require('node:fs/promises');
const path = require('node:path');
const { isArchiveFile } = require('./formats.cjs');

async function browseArchives(folderPath) {
  const resolved = path.resolve(folderPath);
  if (!(await fs.stat(resolved)).isDirectory()) throw new Error('Selected path is not a folder.');
  const candidates = (await fs.readdir(resolved, { withFileTypes: true })).filter((entry) =>
    entry.isDirectory() || (entry.isFile() && isArchiveFile(entry.name))
  );
  const entries = [];
  let nextIndex = 0;
  // Bound metadata requests on HDDs and network folders.
  await Promise.all(Array.from({ length: Math.min(16, candidates.length) }, async () => {
    while (nextIndex < candidates.length) {
      const entry = candidates[nextIndex++];
      const entryPath = path.join(resolved, entry.name);
      try {
        const stat = await fs.stat(entryPath);
        entries.push({ name: entry.name, path: entryPath, isDirectory: stat.isDirectory(), size: stat.size, modifiedAt: stat.mtimeMs });
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }));
  entries.sort((a, b) => b.modifiedAt - a.modifiedAt || a.name.localeCompare(b.name));
  const parentPath = path.dirname(resolved);
  return { folderPath: resolved, parentPath: parentPath === resolved ? null : parentPath, entries };
}

module.exports = { browseArchives };
