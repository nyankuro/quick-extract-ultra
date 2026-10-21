// Integration tests for the Ultra features, using the real bundled 7-Zip binary.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { path7z } = require('7zip-bin-full');
const { extractWithSevenZip } = require('../electron/extraction.cjs');
const { listArchive, testArchive, createArchive, hashFile } = require('../electron/archive-ops.cjs');
const { isArchiveFile, archiveBaseName, archiveFormatLabel } = require('../electron/formats.cjs');
const { buildRegFile, registerContextMenu, unregisterContextMenu, isContextMenuRegistered } = require('../electron/shell-integration.cjs');
const { SettingsStore } = require('../electron/settings.cjs');

let workspace;
let source;
const password = 'Ultra-pass-✓';

function sevenZip(args, cwd) {
  const result = spawnSync(path7z, [...args, '-sccUTF-8'], { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

async function snapshot(folder) {
  const result = {};
  async function walk(current, prefix = '') {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) {
        result[name + '/'] = 'directory';
        await walk(path.join(current, entry.name), name + '/');
      } else {
        result[name] = createHash('sha256').update(await fs.readFile(path.join(current, entry.name))).digest('hex');
      }
    }
  }
  await walk(folder);
  return result;
}

before(async () => {
  workspace = await fs.mkdtemp(path.join(path.resolve(__dirname, '..'), '.ultra-test-'));
  source = path.join(workspace, 'Project files');
  await fs.mkdir(path.join(source, 'docs', 'empty'), { recursive: true });
  await fs.writeFile(path.join(source, 'docs', 'ghi chú tiếng Việt.txt'), 'Unicode ✓ 日本語');
  await fs.writeFile(path.join(source, 'readme.txt'), 'hello');
  await fs.writeFile(path.join(source, 'random.bin'), Buffer.from(Array.from({ length: 300000 }, (_, i) => (i * 7919) % 256)));
});

after(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

test('format helpers recognise multi-part and compound names', () => {
  assert.ok(isArchiveFile('a.tar.gz'));
  assert.ok(isArchiveFile('movie.part1.rar'));
  assert.ok(isArchiveFile('movie.part01.rar'));
  assert.ok(!isArchiveFile('movie.part2.rar'));
  assert.ok(isArchiveFile('backup.7z.001'));
  assert.ok(!isArchiveFile('backup.7z.002'));
  assert.ok(!isArchiveFile('notes.txt'));
  assert.equal(archiveBaseName('photos.tar.gz'), 'photos');
  assert.equal(archiveBaseName('movie.part01.rar'), 'movie');
  assert.equal(archiveBaseName('backup.7z.001'), 'backup');
  assert.equal(archiveFormatLabel('photos.tar.xz'), 'tar.xz');
  assert.equal(archiveFormatLabel('backup.7z.001'), '7z');
});

test('create 7z with password and hidden names, then list, test and extract it', { timeout: 20000 }, async () => {
  const progress = [];
  const result = await createArchive(path7z, {
    sources: [source], outputFolder: workspace, archiveName: 'secret', format: '7z', level: 5, password, encryptNames: true
  }, { updateProgress: (value) => progress.push(value) });
  assert.equal(path.basename(result.outputPath), 'secret.7z');
  await assert.rejects(listArchive(path7z, result.outputPath), { code: 'PASSWORD_REQUIRED' });
  await assert.rejects(listArchive(path7z, result.outputPath, 'nope'), { code: 'PASSWORD_INCORRECT' });
  const listing = await listArchive(path7z, result.outputPath, password);
  assert.ok(listing.entries.some((entry) => entry.path === 'Project files/docs/ghi chú tiếng Việt.txt'));
  assert.ok(listing.entries.some((entry) => entry.path === 'Project files/docs/empty' && entry.isDirectory));
  await testArchive(path7z, result.outputPath, { password });
  const job = { archivePath: result.outputPath, fileName: 'secret.7z', targetPath: path.join(workspace, 'secret-out') };
  await extractWithSevenZip(path7z, job, { password });
  assert.deepEqual(await snapshot(path.join(workspace, 'secret-out')), { 'Project files/': 'directory', ...prefixed(await snapshot(source), 'Project files/') });
  const second = await createArchive(path7z, { sources: [source], outputFolder: workspace, archiveName: 'secret', format: '7z' });
  assert.equal(path.basename(second.outputPath), 'secret (1).7z', 'never overwrites an existing archive');
});

function prefixed(map, prefix) {
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [prefix + key, value]));
}

test('create zip (AES), tar.gz and split 7z; all round-trip', { timeout: 30000 }, async () => {
  const files = [path.join(source, 'readme.txt'), path.join(source, 'random.bin')];
  await assert.rejects(createArchive(path7z, { sources: files, outputFolder: workspace, archiveName: 'pair', format: 'zip', password }), { code: 'ZIP_PASSWORD_ASCII' });
  const zip = await createArchive(path7z, { sources: files, outputFolder: workspace, archiveName: 'pair', format: 'zip', password: 'Plain-ascii 123!' });
  const zipListing = await listArchive(path7z, zip.outputPath);
  assert.ok(zipListing.entries.every((entry) => entry.encrypted));

  const tgz = await createArchive(path7z, { sources: [source], outputFolder: workspace, archiveName: 'bundle', format: 'tar.gz', level: 9 });
  assert.equal(path.basename(tgz.outputPath), 'bundle.tar.gz');
  const tgzJob = { archivePath: tgz.outputPath, fileName: 'bundle.tar.gz', targetPath: path.join(workspace, 'bundle-out') };
  await extractWithSevenZip(path7z, tgzJob);
  // The inner .tar is unpacked automatically; the matching root folder is not.
  assert.deepEqual(await snapshot(tgzJob.targetPath), { 'Project files/': 'directory', ...prefixed(await snapshot(source), 'Project files/') });

  const split = await createArchive(path7z, { sources: [path.join(source, 'random.bin')], outputFolder: workspace, archiveName: 'parts', format: '7z', level: 0, volumeSizeMb: 0.1 });
  assert.ok(split.files.length >= 3, `expected volumes, got ${split.files.map((file) => path.basename(file))}`);
  assert.equal(path.basename(split.outputPath), 'parts.7z.001');
  const splitJob = { archivePath: split.outputPath, fileName: 'parts.7z.001', targetPath: path.join(workspace, 'parts-out') };
  await extractWithSevenZip(path7z, splitJob);
  assert.deepEqual(await snapshot(splitJob.targetPath), { 'random.bin': (await snapshot(source))['random.bin'] });
  assert.deepEqual((await fs.readdir(workspace)).filter((name) => name.startsWith('.quick-extract-')), []);
});

test('smart extraction publishes a single top item directly and renames on collision', { timeout: 20000 }, async () => {
  const smartFolder = path.join(workspace, 'smart');
  await fs.mkdir(smartFolder);
  const single = await createArchive(path7z, { sources: [source], outputFolder: smartFolder, archiveName: 'differently named', format: 'zip' });
  const target = path.join(smartFolder, 'differently named');
  const first = await extractWithSevenZip(path7z, { archivePath: single.outputPath, fileName: 'differently named.zip', targetPath: target }, { smart: true });
  assert.equal(first, path.join(smartFolder, 'Project files'));
  const second = await extractWithSevenZip(path7z, { archivePath: single.outputPath, fileName: 'differently named.zip', targetPath: target }, { smart: true });
  assert.equal(second, path.join(smartFolder, 'Project files (1)'));
  const many = await createArchive(path7z, { sources: [path.join(source, 'readme.txt'), path.join(source, 'docs')], outputFolder: smartFolder, archiveName: 'many', format: '7z' });
  const third = await extractWithSevenZip(path7z, { archivePath: many.outputPath, fileName: 'many.7z', targetPath: path.join(smartFolder, 'many') }, { smart: true });
  assert.equal(third, path.join(smartFolder, 'many'));
});

test('extract only selected entries', { timeout: 20000 }, async () => {
  const archive = await createArchive(path7z, { sources: [source], outputFolder: workspace, archiveName: 'partial', format: '7z' });
  const listing = await listArchive(path7z, archive.outputPath);
  const wanted = listing.entries.filter((entry) => entry.path.startsWith('Project files/docs')).map((entry) => entry.path.replace(/\//g, '\\'));
  const job = { archivePath: archive.outputPath, fileName: 'partial.7z', targetPath: path.join(workspace, 'partial-out') };
  await extractWithSevenZip(path7z, job, { entries: wanted });
  const result = await snapshot(job.targetPath);
  assert.ok(result['Project files/docs/ghi chú tiếng Việt.txt']);
  assert.ok(result['Project files/docs/empty/']);
  assert.equal(result['Project files/readme.txt'], undefined);
});

test('test detects corruption', { timeout: 20000 }, async () => {
  const archive = await createArchive(path7z, { sources: [path.join(source, 'random.bin')], outputFolder: workspace, archiveName: 'damaged', format: 'zip', level: 0 });
  const bytes = await fs.readFile(archive.outputPath);
  bytes[2000] ^= 0xff;
  await fs.writeFile(archive.outputPath, bytes);
  await assert.rejects(testArchive(path7z, archive.outputPath), /CRC|Data Error|error/i);
});

test('checksums match Node crypto and zlib', async () => {
  const file = path.join(source, 'random.bin');
  const result = await hashFile(file, ['crc32', 'md5', 'sha1', 'sha256', 'sha512']);
  const bytes = await fs.readFile(file);
  for (const name of ['md5', 'sha1', 'sha256', 'sha512']) assert.equal(result.hashes[name], createHash(name).update(bytes).digest('hex'));
  assert.equal(result.hashes.crc32, (require('node:zlib').crc32(bytes) >>> 0).toString(16).toUpperCase().padStart(8, '0'));
  assert.equal(result.size, bytes.length);
});

test('Mark-of-the-Web is carried to extracted files when enabled', { timeout: 20000 }, async (t) => {
  const archive = await createArchive(path7z, { sources: [path.join(source, 'readme.txt')], outputFolder: workspace, archiveName: 'downloaded', format: 'zip' });
  try {
    await fs.writeFile(`${archive.outputPath}:Zone.Identifier`, '[ZoneTransfer]\r\nZoneId=3\r\n');
  } catch {
    t.skip('This drive does not support alternate data streams.');
    return;
  }
  const marked = await extractWithSevenZip(path7z, { archivePath: archive.outputPath, fileName: 'downloaded.zip', targetPath: path.join(workspace, 'motw-on') }, { propagateZone: true });
  assert.match(await fs.readFile(path.join(marked, 'readme.txt:Zone.Identifier'), 'utf8'), /ZoneId=3/);
  const clean = await extractWithSevenZip(path7z, { archivePath: archive.outputPath, fileName: 'downloaded.zip', targetPath: path.join(workspace, 'motw-off') }, { propagateZone: false });
  await assert.rejects(fs.readFile(path.join(clean, 'readme.txt:Zone.Identifier')));
});

test('settings are sanitised and saved', async () => {
  const store = new SettingsStore(path.join(workspace, 'settings'));
  assert.equal((await store.load()).language, 'en');
  await store.update({ language: 'ja', explorerMenu: 'yes', bogus: 1 });
  const reloaded = new SettingsStore(path.join(workspace, 'settings'));
  assert.deepEqual(await reloaded.load(), { language: 'ja', explorerMenu: true, openFolderAfter: false, propagateZone: true, trashAfterExtract: false });
  await reloaded.update({ language: 'xx' });
  assert.equal(reloaded.value.language, 'en');
});

const labels = { archiveMenu: 'QEU', open: 'Mở', extractHere: 'ここに展開', extractFolder: 'Folder', test: 'Test', addMenu: 'Add', addArchive: 'Add...', addZip: 'ZIP', add7z: '7Z', hash: 'Hash' };
const launcher = { executable: 'C:\\Apps\\Quick "Extract".exe', args: [] };

test('registry script escapes paths and covers every menu action', () => {
  const text = buildRegFile('HKEY_CURRENT_USER\\Software\\Classes', launcher, labels);
  assert.match(text, /^Windows Registry Editor Version 5\.00/);
  for (const action of ['open', 'extract-here', 'extract-folder', 'test', 'compress', 'add-zip', 'add-7z', 'hash']) {
    assert.ok(text.includes(`--qe-action=${action} \\"%1\\"`), action);
  }
  assert.ok(text.includes('C:\\\\Apps\\\\Quick \\"Extract\\".exe'));
  assert.ok(text.includes('System.FileExtension:=.zip OR'));
});

test('context menu registers and unregisters under an isolated test key', { skip: process.platform !== 'win32' }, async () => {
  const root = 'HKEY_CURRENT_USER\\Software\\QuickExtractUltraTest';
  try {
    await registerContextMenu(launcher, labels, root);
    assert.equal(await isContextMenuRegistered(root), true);
    const query = spawnSync('reg.exe', ['query', `${root}\\*\\shell\\QuickExtractUltra.Archive\\shell\\2extracthere\\command`, '/ve'], { encoding: 'utf8' });
    assert.match(query.stdout, /--qe-action=extract-here "%1"/);
    const label = spawnSync('reg.exe', ['query', `${root}\\*\\shell\\QuickExtractUltra.Archive\\shell\\2extracthere`, '/v', 'MUIVerb'], { encoding: 'buffer' });
    assert.equal(label.status, 0);
    await unregisterContextMenu(root);
    assert.equal(await isContextMenuRegistered(root), false);
  } finally {
    spawnSync('reg.exe', ['delete', root, '/f']);
  }
});
