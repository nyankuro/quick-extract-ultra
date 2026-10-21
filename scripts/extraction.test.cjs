const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { path7z } = require('7zip-bin-full');
const { extractWithSevenZip } = require('../electron/extraction.cjs');

let workspace;
const password = 'test-pass-123';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

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
        result[name] = hash(await fs.readFile(path.join(current, entry.name)));
      }
    }
  }
  await walk(folder);
  return result;
}

function archive(name, targetName = name + '-output') {
  return { archivePath: path.join(workspace, name), fileName: name, targetPath: path.join(workspace, targetName) };
}

before(async () => {
  workspace = await fs.mkdtemp(path.join(path.resolve(__dirname, '..'), '.extraction-test-'));
  const source = path.join(workspace, 'source');
  await fs.mkdir(path.join(source, 'nested', 'empty'), { recursive: true });
  await fs.writeFile(path.join(source, 'nested', 'tiếng Việt.txt'), 'Unicode contents ✓');
  await fs.writeFile(path.join(source, '.hidden'), 'hidden data');
  await fs.writeFile(path.join(source, 'empty.txt'), '');
  await fs.writeFile(path.join(source, 'data.bin'), Buffer.from(Array.from({ length: 65536 }, (_, i) => i % 251)));
  sevenZip(['a', '-tzip', '-mx=0', path.join(workspace, 'flat.zip'), './*'], source);
  sevenZip(['a', path.join(workspace, 'solid.7z'), './*'], source);
  sevenZip(['a', '-tzip', '-mem=AES256', `-p${password}`, path.join(workspace, 'encrypted.zip'), './*'], source);
  sevenZip(['a', '-mhe=on', `-p${password}`, path.join(workspace, 'encrypted.7z'), './*'], source);
  sevenZip(['a', '-mhe=on', '-pMật-khẩu-✓', path.join(workspace, 'unicode-password.7z'), './*'], source);
  sevenZip(['a', '-tzip', path.join(workspace, 'source.zip'), 'source'], workspace);
  sevenZip(['a', '-tzip', path.join(workspace, 'mixed.zip'), 'source', 'flat.zip'], workspace);
  const damaged = await fs.readFile(path.join(workspace, 'flat.zip'));
  const contents = await fs.readFile(path.join(source, 'data.bin'));
  const offset = damaged.indexOf(contents);
  assert.ok(offset >= 0);
  damaged[offset + 123] ^= 255;
  await fs.writeFile(path.join(workspace, 'corrupt.zip'), damaged);

  // Duplicate entries are legal in ZIP. Verify both payloads survive extraction.
  const python = spawnSync('python', ['-c',
    'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1], "w"); z.writestr("same.txt", "first"); z.writestr("same.txt", "second"); z.close()',
    path.join(workspace, 'duplicates.zip')], { encoding: 'utf8' });
  assert.equal(python.status, 0, python.stderr);
});

after(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

for (const name of ['flat.zip', 'solid.7z', 'encrypted.zip', 'encrypted.7z']) {
  test(`complete paths, empty folders and SHA-256 contents: ${name}`, { timeout: 10000 }, async () => {
    const job = archive(name);
    const progress = [];
    await extractWithSevenZip(path7z, job, { password, updateProgress: (value) => progress.push(value) });
    assert.deepEqual(await snapshot(job.targetPath), await snapshot(path.join(workspace, 'source')));
    assert.ok(progress.every((value, index) => value < 100 && (!index || value > progress[index - 1])));
  });
}

for (const name of ['encrypted.zip', 'encrypted.7z']) {
  test(`missing password returns promptly: ${name}`, { timeout: 5000 }, async () => {
    const job = archive(name, name + '-missing');
    await assert.rejects(extractWithSevenZip(path7z, job), /Password required/);
    await assert.rejects(fs.access(job.targetPath), { code: 'ENOENT' });
  });
  test(`wrong password does not publish incomplete output: ${name}`, { timeout: 5000 }, async () => {
    const job = archive(name, name + '-wrong');
    await assert.rejects(extractWithSevenZip(path7z, job, { password: 'wrong' }), /Incorrect archive password/);
    await assert.rejects(fs.access(job.targetPath), { code: 'ENOENT' });
  });
}

test('matching root is flattened, mixed root retains every item', async () => {
  const single = archive('source.zip');
  await extractWithSevenZip(path7z, single);
  assert.deepEqual(await snapshot(single.targetPath), await snapshot(path.join(workspace, 'source')));
  const mixed = archive('mixed.zip');
  await extractWithSevenZip(path7z, mixed);
  const expected = Object.fromEntries(Object.entries(await snapshot(path.join(workspace, 'source'))).map(([name, value]) => ['source/' + name, value]));
  expected['source/'] = 'directory';
  expected['flat.zip'] = hash(await fs.readFile(path.join(workspace, 'flat.zip')));
  assert.deepEqual(await snapshot(mixed.targetPath), expected);
});

test('CRC corruption fails without publishing partial output', async () => {
  const job = archive('corrupt.zip');
  await assert.rejects(extractWithSevenZip(path7z, job), /CRC|Data Error/);
  await assert.rejects(fs.access(job.targetPath), { code: 'ENOENT' });
});

test('pre-existing destination survives success and failure', async () => {
  const target = path.join(workspace, 'existing');
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, 'keep.txt'), 'keep this');
  const original = await snapshot(target);
  await assert.rejects(extractWithSevenZip(path7z, archive('flat.zip', 'existing')), /Target folder/);
  await assert.rejects(extractWithSevenZip(path7z, archive('corrupt.zip', 'existing')), /CRC|Data Error/);
  assert.deepEqual(await snapshot(target), original);
});

test('duplicate file entries retain both contents', async () => {
  const job = archive('duplicates.zip');
  await extractWithSevenZip(path7z, job);
  const files = await fs.readdir(job.targetPath);
  assert.equal(files.length, 2);
  const contents = await Promise.all(files.map((file) => fs.readFile(path.join(job.targetPath, file), 'utf8')));
  assert.deepEqual(contents.sort(), ['first', 'second']);
});

test('Unicode password is supplied correctly over stdin', async () => {
  const job = archive('unicode-password.7z');
  await extractWithSevenZip(path7z, job, { password: 'Mật-khẩu-✓' });
  assert.deepEqual(await snapshot(job.targetPath), await snapshot(path.join(workspace, 'source')));
});

test('no staging folders remain after success or errors', async () => {
  assert.deepEqual((await fs.readdir(workspace)).filter((name) => name.startsWith('.quick-extract-')), []);
});

async function loadMain(onEvent) {
  const handlers = new Map();
  let windowCreated = false;
  const mainPath = path.resolve(__dirname, '../electron/main.cjs');
  const realRequire = createRequire(mainPath);
  const electron = {
    app: {
      isPackaged: false, whenReady: () => Promise.resolve(), on: () => {}, quit: () => {},
      requestSingleInstanceLock: () => true, getPath: () => path.join(workspace, 'user-data'), getVersion: () => '0.0.0'
    },
    BrowserWindow: class {
      constructor() {
        windowCreated = true;
        this.webContents = { send: (_channel, event) => onEvent(event, handlers), on: () => {}, setWindowOpenHandler: () => {} };
      }
      loadURL() {}
      isDestroyed() { return false; }
    },
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    dialog: {}, shell: {}
  };
  vm.runInNewContext(await fs.readFile(mainPath, 'utf8'), {
    require: (name) => name === 'electron' ? electron : realRequire(name),
    __dirname: path.dirname(mainPath), process, Buffer, console, setTimeout, clearTimeout
  }, { filename: mainPath });
  while (!windowCreated) await new Promise((resolve) => setTimeout(resolve, 5));
  return handlers;
}

test('batch continues normal archives, then retries password jobs and wrong passwords', { timeout: 10000 }, async () => {
  const events = [];
  const attempts = new Map();
  const inputPromises = [];
  const handlers = await loadMain((event, ipc) => {
    events.push(event);
    if (event.type === 'job-update' && event.patch.status === 'awaiting-password') {
      const attempt = (attempts.get(event.id) || 0) + 1;
      attempts.set(event.id, attempt);
      inputPromises.push(ipc.get('archives:password')(null, { id: event.id, password: attempt === 1 ? 'wrong' : password }));
    }
  });
  const archivePaths = ['encrypted.zip', 'encrypted.7z', 'flat.zip'].map((name) => path.join(workspace, name));
  const options = { useMainFolder: true, newMainFolder: true };
  const jobs = await handlers.get('archives:scan-files')(null, { folderPath: workspace, archivePaths, options });
  const result = await handlers.get('archives:extract-all')(null, { folderPath: workspace, archiveIds: jobs.map((job) => job.id), archivePaths, options });
  await Promise.all(inputPromises);
  assert.equal(result.done, 3);
  assert.equal(result.error, 0);
  assert.equal(result.skipped, 0);
  const normalId = jobs.find((job) => job.fileName === 'flat.zip').id;
  const normalDone = events.findIndex((event) => event.id === normalId && event.patch?.status === 'done');
  for (const job of jobs.filter((job) => job.id !== normalId)) {
    const starts = events.map((event, index) => event.id === job.id && event.patch?.status === 'extracting' ? index : -1).filter((index) => index >= 0);
    assert.equal(starts.length, 3);
    assert.ok(starts[1] > normalDone, 'password retry starts after normal jobs finish');
  }
  for (const job of jobs) {
    const completed = events.findLast((event) => event.id === job.id && event.patch?.targetPath);
    assert.deepEqual(await snapshot(completed.patch.targetPath), await snapshot(path.join(workspace, 'source')));
  }
  assert.ok(!JSON.stringify(events).includes(password), 'password never appears in events or logs');
});

test('all-password batch waits for input, prevents overlapping batches, and supports skip', { timeout: 10000 }, async () => {
  const events = [];
  let waitingResolve;
  const waiting = new Promise((resolve) => { waitingResolve = resolve; });
  const handlers = await loadMain((event) => {
    events.push(event);
    if (event.type === 'log' && event.entry.message.startsWith('Other archives finished.')) waitingResolve();
  });
  const archivePaths = [path.join(workspace, 'encrypted.zip')];
  const jobs = await handlers.get('archives:scan-files')(null, { folderPath: workspace, archivePaths });
  const request = { folderPath: workspace, archiveIds: jobs.map((job) => job.id), archivePaths };
  const resultPromise = handlers.get('archives:extract-all')(null, request);
  await waiting;
  await assert.rejects(handlers.get('archives:extract-all')(null, request), /already running/);
  assert.ok(!events.some((event) => event.type === 'batch-complete'));
  await handlers.get('archives:skip-waiting')(null, jobs[0].id);
  const result = await resultPromise;
  assert.equal(result.done, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.error, 0);
  assert.ok(events.some((event) => event.type === 'batch-complete'));
});

test('deep scan and Main folder reserve collisions while a password archive waits', { timeout: 10000 }, async () => {
  const root = path.join(workspace, 'deep-scan');
  await fs.mkdir(path.join(root, 'nested'), { recursive: true });
  await fs.copyFile(path.join(workspace, 'encrypted.zip'), path.join(root, 'shared.zip'));
  await fs.copyFile(path.join(workspace, 'flat.zip'), path.join(root, 'nested', 'shared.zip'));
  await fs.mkdir(path.join(root, 'Main Zip'));
  await fs.writeFile(path.join(root, 'Main Zip', 'keep.txt'), 'keep');
  const submissions = [];
  const events = [];
  const handlers = await loadMain((event, ipc) => {
    events.push(event);
    if (event.patch?.status === 'awaiting-password') submissions.push(ipc.get('archives:password')(null, { id: event.id, password }));
  });
  const options = { deepScan: true, useMainFolder: true, newMainFolder: true };
  const shallow = await handlers.get('archives:scan')(null, { folderPath: root, options: {} });
  assert.equal(shallow.length, 1);
  const deep = await handlers.get('archives:scan')(null, { folderPath: root, options });
  assert.equal(deep.length, 2);
  const result = await handlers.get('archives:extract-all')(null, { folderPath: root, archiveIds: deep.map((job) => job.id), options });
  await Promise.all(submissions);
  assert.equal(result.done, 2);
  assert.equal(path.basename(result.openFolderPath), 'Main Zip (1)');
  assert.equal(await fs.readFile(path.join(root, 'Main Zip', 'keep.txt'), 'utf8'), 'keep');
  assert.notEqual(deep[0].targetPath, deep[1].targetPath);
  for (const job of deep) {
    const updated = events.findLast((event) => event.id === job.id && event.patch?.targetPath);
    assert.deepEqual(await snapshot(updated.patch.targetPath), await snapshot(path.join(workspace, 'source')));
  }
});

test('a chosen destination receives every archive, with or without Main folder', { timeout: 10000 }, async () => {
  const handlers = await loadMain(() => {});
  const archivePaths = ['flat.zip', 'solid.7z'].map((name) => path.join(workspace, name));
  const destination = path.join(workspace, 'chosen destination');
  for (const options of [{ outputFolder: destination }, { outputFolder: destination, useMainFolder: true }]) {
    const jobs = await handlers.get('archives:scan-files')(null, { folderPath: workspace, archivePaths, options });
    const expectedParent = options.useMainFolder ? path.join(destination, 'Main Zip') : destination;
    assert.ok(jobs.every((job) => path.dirname(job.targetPath) === expectedParent), JSON.stringify(jobs.map((job) => job.targetPath)));
    const result = await handlers.get('archives:extract-all')(null, { folderPath: workspace, archiveIds: jobs.map((job) => job.id), archivePaths, options });
    assert.equal(result.done, 2);
    assert.equal(result.openFolderPath, expectedParent);
  }
  assert.deepEqual((await fs.readdir(destination)).sort(), ['Main Zip', 'flat', 'solid']);
  await assert.rejects(handlers.get('archives:scan-files')(null, { folderPath: workspace, archivePaths, options: { outputFolder: 'relative\\path' } }), /absolute/);
});
