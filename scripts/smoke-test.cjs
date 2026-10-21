// Run with Electron to exercise the production renderer and real IPC handlers.
const electron = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { path7z } = require('7zip-bin-full');
const root = path.resolve(__dirname, '..');
let workspace;
let window;

async function until(expression) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${expression}`);
}

async function main() {
  workspace = await fs.mkdtemp(path.join(root, '.ui-smoke-test-'));
  // Keep test preferences away from the real profile.
  electron.app.setPath('userData', await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'qeu-smoke-profile-')));
  await electron.app.whenReady();
  await fs.writeFile(path.join(workspace, 'content.txt'), 'complete smoke test payload');
  for (const [name, flags] of [['a-protected.zip', ['-psmoke-password', '-mem=AES256']], ['b-normal.zip', []]]) {
    const command = spawnSync(path7z, ['a', '-tzip', ...flags, path.join(workspace, name), 'content.txt'], { cwd: workspace, windowsHide: true });
    assert.equal(command.status, 0);
  }
  const selectedPaths = ['a-protected.zip', 'b-normal.zip'].map((name) => path.join(workspace, name));
  await fs.utimes(selectedPaths[0], new Date('2025-01-01'), new Date('2025-01-01'));
  await fs.utimes(selectedPaths[1], new Date('2026-01-01'), new Date('2026-01-01'));
  const loaded = new Promise((resolve) => {
    electron.app.once('browser-window-created', (_event, created) => {
      window = created;
      created.webContents.once('did-finish-load', resolve);
    });
  });
  class TestWindow extends electron.BrowserWindow {
    constructor(options) {
      super({ ...options, show: false, webPreferences: { ...options.webPreferences, backgroundThrottling: false } });
    }
    loadURL() { return this.loadFile(path.join(root, 'dist-renderer/index.html')); }
  }
  const mainPath = path.join(root, 'electron/main.cjs');
  const realRequire = createRequire(mainPath);
  const testElectron = { ...electron, BrowserWindow: TestWindow,
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: selectedPaths }) } };
  vm.runInNewContext(await fs.readFile(mainPath, 'utf8'), {
    require: (name) => name === 'electron' ? testElectron : realRequire(name),
    __dirname: path.dirname(mainPath), Buffer, process, console, setTimeout, clearTimeout
  }, { filename: mainPath });
  await loaded;
  await until("typeof window.quickExtract?.submitPassword === 'function'");
  await window.webContents.executeJavaScript(`window.quickExtract.scanArchives(${JSON.stringify(workspace)}, {})`);
  await window.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Choose files')).click()");
  await until("document.querySelectorAll('.picker-tile').length === 2");
  const tileNames = await window.webContents.executeJavaScript("[...document.querySelectorAll('.picker-tile strong')].map(el => el.textContent)");
  assert.deepEqual(tileNames, ['b-normal.zip', 'a-protected.zip'], 'picker defaults to newest first');
  assert.ok(await window.webContents.executeJavaScript("document.querySelector('.picker-file-icon').getBoundingClientRect().width >= 143.9"));
  await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await fs.writeFile(path.join(root, 'docs/screenshots/archive-picker.png'), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  await fs.mkdir(path.join(workspace, 'nested'));
  await fs.copyFile(selectedPaths[1], path.join(workspace, 'nested', 'child.zip'));
  await fs.utimes(path.join(workspace, 'nested'), new Date('2024-01-01'), new Date('2024-01-01'));
  await window.webContents.executeJavaScript("document.querySelector('button[aria-label=\"Refresh folder\"]').click()");
  await until("document.querySelectorAll('.picker-tile').length === 3");
  await window.webContents.executeJavaScript("document.querySelectorAll('.picker-tile')[2].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))");
  await until("document.querySelectorAll('.picker-tile').length === 1 && document.querySelector('.picker-tile strong').textContent === 'child.zip'");
  await window.webContents.executeJavaScript("document.querySelector('button[aria-label=\"Parent folder\"]').click()");
  await until("document.querySelectorAll('.picker-tile').length === 3");
  await window.webContents.executeJavaScript(`
    { const tiles = document.querySelectorAll('.picker-tile');
    tiles[1].click();
    tiles[0].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); }
  `);
  await until("document.querySelectorAll('.picker-tile.selected').length === 2");
  await window.webContents.executeJavaScript("[...document.querySelectorAll('.picker-footer button')].find(b => b.textContent === 'Cancel').click()");
  await until("!document.querySelector('.archive-picker')");
  await window.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Choose files')).click()");
  await until("document.querySelectorAll('.picker-tile').length === 3");
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('.picker-tile.selected').length"), 0);
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.picker-tile strong').textContent"), 'b-normal.zip');
  await window.webContents.executeJavaScript(`
    { const tiles = document.querySelectorAll('.picker-tile');
    tiles[0].click();
    tiles[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); }
  `);
  await until("document.querySelectorAll('.picker-tile.selected').length === 2");
  await window.webContents.executeJavaScript("document.querySelector('.picker-select').click()");
  await until("document.querySelectorAll('.data-row').length === 2");
  await window.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Extract all')).click()");
  await until("document.querySelectorAll('.status-awaiting-password').length === 1 && document.querySelectorAll('.status-done').length === 1");
  await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const screenshot = await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  await fs.writeFile(path.join(root, 'docs/screenshots/extract-password.png'), screenshot.toPNG());
  await window.webContents.executeJavaScript(`
    const input = document.querySelector('.password-row input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'smoke-password');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  `);
  await until("!document.querySelector('.password-row button[type=submit]').disabled");
  await window.webContents.executeJavaScript("document.querySelector('.password-row').requestSubmit()");
  await until("document.querySelectorAll('.status-done').length === 2 && !document.querySelector('.password-row')");
  assert.equal(await fs.readFile(path.join(workspace, 'a-protected/content.txt'), 'utf8'), 'complete smoke test payload');
  assert.equal(await fs.readFile(path.join(workspace, 'b-normal/content.txt'), 'utf8'), 'complete smoke test payload');
  const shoot = async (name) => {
    await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await fs.writeFile(path.join(root, 'docs/screenshots', name), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  };
  const command = (action, paths) => window.webContents.send('app:command', { action, paths });

  // Explorer "Add to 7Z" goes straight to the Compress tab and starts.
  command('add-7z', [path.join(workspace, 'content.txt'), path.join(workspace, 'nested')]);
  await until("document.querySelector('.result-box') !== null");
  // Several items are named after their folder, like WinRAR does.
  const created = await window.webContents.executeJavaScript("document.querySelector('.result-box span').title");
  assert.equal(created, path.join(workspace, `${path.basename(workspace)}.7z`));
  await fs.access(created);
  await shoot('compress.png');

  // Explorer "Open" shows the archive contents.
  command('open', [created]);
  await until("document.querySelectorAll('.browse-table.data-row').length === 2");
  await shoot('browse.png');

  // Explorer "Calculate checksums".
  command('hash', [path.join(workspace, 'content.txt')]);
  await until("document.querySelectorAll('.hash-line').length === 2");
  await shoot('tools.png');

  // Explorer "Extract here (smart)": one top-level item comes out directly.
  await fs.mkdir(path.join(workspace, 'smart'));
  spawnSync(path7z, ['a', '-tzip', path.join(workspace, 'smart', 'Wrapped.zip'), 'nested'], { cwd: workspace, windowsHide: true });
  command('extract-here', [path.join(workspace, 'smart', 'Wrapped.zip')]);
  await until("document.querySelectorAll('.status-done').length === 1");
  await fs.access(path.join(workspace, 'smart', 'nested', 'child.zip'));

  // Explorer delivers multi-selections as separate launches; none may collide with a running batch.
  await fs.mkdir(path.join(workspace, 'burst'));
  for (const name of ['one', 'two', 'three']) {
    await fs.mkdir(path.join(workspace, 'burst-src', name), { recursive: true });
    await fs.writeFile(path.join(workspace, 'burst-src', name, 'file.txt'), name);
    spawnSync(path7z, ['a', '-tzip', path.join(workspace, 'burst', `${name}.zip`), name], { cwd: path.join(workspace, 'burst-src'), windowsHide: true });
  }
  command('extract-folder', [path.join(workspace, 'burst', 'one.zip')]);
  await new Promise((resolve) => setTimeout(resolve, 30));
  command('extract-folder', [path.join(workspace, 'burst', 'two.zip')]);
  await new Promise((resolve) => setTimeout(resolve, 30));
  command('extract-folder', [path.join(workspace, 'burst', 'three.zip')]);
  for (const name of ['one', 'two', 'three']) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      try { await fs.access(path.join(workspace, 'burst', name, 'file.txt')); break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    assert.equal(await fs.readFile(path.join(workspace, 'burst', name, 'file.txt'), 'utf8'), name);
  }
  const burstErrors = await window.webContents.executeJavaScript("[...document.querySelectorAll('.log-error')].map(el => el.textContent)");
  assert.deepEqual(burstErrors, [], 'no errors while commands arrive during a running batch');

  // The Extract tab shows where files will be saved.
  assert.ok(await window.webContents.executeJavaScript("document.querySelector('[data-action=choose-destination]').textContent.includes('Next to each archive')"));

  // Language switch re-renders the whole interface.
  for (const [language, label, name] of [['ja', '展開', 'extract-ja.png'], ['vi', 'Giải nén', 'extract-vi.png'], ['en', 'Extract', 'extract-en.png']]) {
    await window.webContents.executeJavaScript(`
      { const select = document.querySelector('.language-select select');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, '${language}');
      select.dispatchEvent(new Event('change', { bubbles: true })); }
    `);
    await until(`document.querySelector('.tab-button').textContent === ${JSON.stringify(label)} && document.documentElement.lang === '${language}'`);
    await shoot(name);
  }

  // The language switcher offers all five languages.
  const languageCount = await window.webContents.executeJavaScript("document.querySelectorAll('.language-select select option').length");
  assert.equal(languageCount, 5, 'five languages');

  // The ZIP password recovery tab renders with its ownership note.
  await window.webContents.executeJavaScript("[...document.querySelectorAll('.tab-button')].find(b => b.textContent.includes('Recover')).click()");
  await until("document.querySelector('.ownership-note') !== null");
  await until("document.querySelectorAll('.tool-row').length === 3");
  await shoot('recover.png');

  console.log('PASS: five languages, ZIP password recovery tab, Explorer commands (add-7z, open, hash, extract-here), compress, browse, checksums and language switching.');
  console.log('PASS: newest-first icon picker, Ctrl multi-select, password row, queue continuation, password submission, and complete output via real Electron IPC.');
}

main().then(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
  window?.destroy();
  electron.app.exit(0);
}).catch(async (error) => {
  console.error(error);
  if (workspace) await fs.rm(workspace, { recursive: true, force: true });
  window?.destroy();
  electron.app.exit(1);
});
