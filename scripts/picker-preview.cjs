// Renders the archive picker over a folder with many entries and saves a screenshot per view.
// Run with Electron after `npm run build`: electron scripts/picker-preview.cjs [width] [height]
const electron = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const [width = 1280, height = 800] = process.argv.slice(2).filter((arg) => /^\d+$/.test(arg)).map(Number);
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
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'qeu-picker-'));
  electron.app.setPath('userData', path.join(workspace, 'profile'));
  await electron.app.whenReady();
  const folder = path.join(workspace, 'Downloads');
  for (let index = 0; index < 8; index += 1) await fs.mkdir(path.join(folder, `Folder with a fairly long name ${index}`), { recursive: true });
  for (let index = 0; index < 24; index += 1) await fs.writeFile(path.join(folder, `Archive_${index}_${'x'.repeat(index % 3 * 12)}.zip`), 'PK');
  const loaded = new Promise((resolve) => electron.app.once('browser-window-created', (_event, created) => {
    window = created;
    created.webContents.once('did-finish-load', resolve);
  }));
  class PreviewWindow extends electron.BrowserWindow {
    constructor(options) { super({ ...options, width, height, minWidth: 0, minHeight: 0, show: false }); }
    loadURL() { return this.loadFile(path.join(root, 'dist-renderer/index.html')); }
  }
  const mainPath = path.join(root, 'electron/main.cjs');
  const realRequire = createRequire(mainPath);
  vm.runInNewContext(await fs.readFile(mainPath, 'utf8'), {
    require: (name) => name === 'electron' ? { ...electron, BrowserWindow: PreviewWindow } : realRequire(name),
    __dirname: path.dirname(mainPath), Buffer, process, console, setTimeout, clearTimeout
  }, { filename: mainPath });
  await loaded;
  await until("typeof window.quickExtract?.browseArchives === 'function'");
  await window.webContents.executeJavaScript(`window.quickExtract.scanArchives(${JSON.stringify(folder)}, {})`);
  await window.webContents.executeJavaScript("document.querySelector('[data-action=choose-files]').click()");
  await until("document.querySelectorAll('.picker-tile').length === 32");
  const views = await window.webContents.executeJavaScript("[...document.querySelectorAll('.picker-view-menu [data-view]')].map(el => el.dataset.view)");
  const outFolder = path.join(root, 'docs/screenshots/picker');
  await fs.mkdir(outFolder, { recursive: true });
  for (const view of views) {
    await window.webContents.executeJavaScript(`document.querySelector('.picker-view-menu [data-view="${view}"]').click()`);
    await until(`document.querySelector('.picker-grid').dataset.view === '${view}'`);
    await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    // Fail if any tile's text spills outside its own box or overlaps the next tile.
    const overlap = await window.webContents.executeJavaScript(`(() => {
      const tiles = [...document.querySelectorAll('.picker-tile')];
      for (const tile of tiles) {
        const box = tile.getBoundingClientRect();
        for (const child of tile.querySelectorAll('svg, strong, span')) {
          const inner = child.getBoundingClientRect();
          if (inner.width && (inner.bottom > box.bottom + 1 || inner.top < box.top - 1)) return tile.title + ' ' + child.tagName;
        }
      }
      return '';
    })()`);
    await fs.writeFile(path.join(outFolder, `${view}-${width}x${height}.png`), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
    console.log(`${view}: ${overlap ? 'OVERLAP ' + overlap : 'ok'}`);
    if (overlap) process.exitCode = 1;
  }
  await fs.rm(workspace, { recursive: true, force: true }).catch(() => {});
}

main().then(() => { window?.destroy(); electron.app.exit(process.exitCode || 0); })
  .catch((error) => { console.error(error); window?.destroy(); electron.app.exit(1); });
