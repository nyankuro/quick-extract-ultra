const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const sevenZipBin = require('7zip-bin-full');
const { extractWithSevenZip, extractInto } = require('./extraction.cjs');
const { detectTools, downloadTool, setupAllTools, toolsDir } = require('./password-tools.cjs');
const { RecoveryJob } = require('./password-recovery.cjs');
const { PasswordQueue } = require('./password-queue.cjs');
const { browseArchives } = require('./folder-browser.cjs');
const { applyFolderView } = require('./folder-view.cjs');
const { isArchiveFile, archiveBaseName, archiveFormatLabel, EXTRACT_EXTENSIONS, CREATE_FORMATS } = require('./formats.cjs');
const { listArchive, testArchive, createArchive, hashFile, HASH_ALGORITHMS } = require('./archive-ops.cjs');
const { SettingsStore } = require('./settings.cjs');
const { registerContextMenu, unregisterContextMenu, isContextMenuRegistered } = require('./shell-integration.cjs');
const { ShellIcons } = require('./shell-icons.cjs');
const locales = {
  en: require('../locales/en.json'),
  ja: require('../locales/ja.json'),
  vi: require('../locales/vi.json'),
  'zh-Hans': require('../locales/zh-Hans.json'),
  'zh-Hant': require('../locales/zh-Hant.json')
};

const MAIN_OUTPUT_FOLDER_NAME = 'Main Zip';
const APP_NAME = 'Quick Extract Ultra';

let mainWindow;
let sessionLastFolder = null;
let activeBatch = null;
let activeRecovery = null;
let settings;
let rendererReady = false;
let pendingCommands = [];
let flushTimer = null;

function tr(key, params = {}) {
  const language = settings?.value.language || 'en';
  const template = locales[language]?.[key] ?? locales.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

// Explorer starts one process per selected file; the first instance collects them all.
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) {
  app.quit();
}
// Defaults are usable at once; saved preferences load before the window opens.
settings = new SettingsStore(app.getPath('userData'));

function parseCommand(argv) {
  const actionIndex = argv.findIndex((arg) => arg.startsWith('--qe-action='));
  if (actionIndex >= 0) {
    const action = argv[actionIndex].slice('--qe-action='.length);
    const paths = argv.slice(actionIndex + 1).filter((arg) => !arg.startsWith('--') && path.isAbsolute(arg));
    return paths.length ? { action, paths } : null;
  }
  // "Open with" passes plain archive paths.
  const paths = argv.slice(1).filter((arg) => path.isAbsolute(arg) && isArchiveFile(arg) && existsSync(arg));
  return paths.length ? { action: 'open', paths } : null;
}

function queueCommand(command) {
  if (!command) return;
  const last = pendingCommands.at(-1);
  if (last && last.action === command.action) {
    last.paths.push(...command.paths.filter((item) => !last.paths.includes(item)));
  } else {
    pendingCommands.push({ action: command.action, paths: [...command.paths] });
  }
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushCommands, 400);
}

function flushCommands() {
  if (!rendererReady || !mainWindow || mainWindow.isDestroyed()) return;
  for (const command of pendingCommands) mainWindow.webContents.send('app:command', command);
  pendingCommands = [];
}

app.on('second-instance', (_event, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  queueCommand(parseCommand(argv));
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 960,
    minWidth: 1040,
    minHeight: 720,
    backgroundColor: '#050815',
    title: APP_NAME,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.webContents.on('did-start-loading', () => { rendererReady = false; });
  // Links in the About panel open in the user's browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'));
  } else {
    mainWindow.loadURL('http://127.0.0.1:5173');
  }
}

if (hasInstanceLock) {
  app.whenReady().then(async () => {
    await settings.load();
    queueCommand(parseCommand(process.argv));
    createWindow();
    void refreshContextMenu();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

// Explorer's own icons for the file picker; app.getFileIcon (32 px) is the fallback.
const shellIcons = new ShellIcons(async (filePath) => (await app.getFileIcon(filePath, { size: 'large' })).toDataURL());
app.on('will-quit', () => shellIcons.stop());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function sendExtractionEvent(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('extraction:event', payload);
  }
}

function sendTaskProgress(task, progress) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('task:progress', { task, progress });
  }
}

async function getLastFolder() {
  if (sessionLastFolder && (await pathExists(sessionLastFolder))) {
    return sessionLastFolder;
  }
  return null;
}

async function rememberLastFolder(folderPath) {
  if (!folderPath) {
    return;
  }
  sessionLastFolder = folderPath;
}

function archiveIdFor(archivePath) {
  return Buffer.from(archivePath, 'utf8').toString('base64url');
}

function targetNameFor(fileName) {
  return archiveBaseName(fileName);
}

async function pathExists(candidatePath) {
  try {
    await fs.access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function findAvailableTarget(parentFolder, baseName, reservedTargets = new Set()) {
  let index = 0;

  while (true) {
    const targetFolder = index === 0 ? baseName : `${baseName} (${index})`;
    const targetPath = path.join(parentFolder, targetFolder);
    const reservationKey = targetPath.toLowerCase();

    if (!reservedTargets.has(reservationKey) && !(await pathExists(targetPath))) {
      reservedTargets.add(reservationKey);
      return { targetFolder, targetPath };
    }

    index += 1;
  }
}

async function getOutputParentFolder(folderPath, useMainFolder, newMainFolder = false) {
  if (!useMainFolder) {
    return folderPath;
  }

  if (newMainFolder) {
    return (await findAvailableTarget(folderPath, MAIN_OUTPUT_FOLDER_NAME)).targetPath;
  }

  const preferredPath = path.join(folderPath, MAIN_OUTPUT_FOLDER_NAME);
  try {
    const stat = await fs.stat(preferredPath);
    if (stat.isDirectory()) {
      return preferredPath;
    }
  } catch {}

  if (!(await pathExists(preferredPath))) {
    return preferredPath;
  }

  return (await findAvailableTarget(folderPath, MAIN_OUTPUT_FOLDER_NAME)).targetPath;
}

function displayTargetFolder(folderPath, targetPath) {
  const relative = path.relative(folderPath, targetPath);
  // A chosen destination elsewhere reads better as a full path than as ../../name.
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return targetPath;
  return relative;
}

function outputFolderOption(options = {}) {
  if (!options.outputFolder) return null;
  return requirePath(options.outputFolder, 'Destination');
}

async function ensureFolder(folderPath) {
  const stat = await fs.stat(folderPath);
  if (!stat.isDirectory()) {
    throw new Error('Selected path is not a folder.');
  }
}

async function buildArchiveItem(archivePath, rootFolder, outputParentPath, reservedTargets) {
  const fileName = path.basename(archivePath);
  const baseTargetFolder = targetNameFor(fileName);
  const { targetPath } = await findAvailableTarget(outputParentPath, baseTargetFolder, reservedTargets);
  const targetFolder = displayTargetFolder(rootFolder, targetPath);
  const stat = await fs.stat(archivePath);
  const renamedTarget = path.basename(targetPath) !== baseTargetFolder;

  return {
    id: archiveIdFor(archivePath),
    archivePath,
    fileName,
    format: archiveFormatLabel(fileName),
    targetFolder,
    targetPath,
    outputParentPath,
    size: stat.size,
    status: 'ready',
    progress: 0,
    selected: true,
    message: renamedTarget ? tr('main.targetExists', { target: targetFolder }) : ''
  };
}

async function scanArchivePaths(filePaths, rootFolder, options = {}) {
  await ensureFolder(rootFolder);
  const archivePaths = [...new Set(filePaths)]
    .filter((filePath) => isArchiveFile(filePath))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  const outputFolder = outputFolderOption(options);
  const sharedOutputParentPath = options.useMainFolder
    ? await getOutputParentFolder(outputFolder || rootFolder, true, Boolean(options.newMainFolder))
    : outputFolder;
  const reservedTargets = new Set();
  const archives = [];

  for (const archivePath of archivePaths) {
    const stat = await fs.stat(archivePath);
    if (!stat.isFile()) {
      continue;
    }

    const outputParentPath = sharedOutputParentPath || path.dirname(archivePath);
    archives.push(await buildArchiveItem(archivePath, rootFolder, outputParentPath, reservedTargets));
  }

  return archives;
}

async function collectArchivePaths(folderPath, deepScan = false) {
  const archivePaths = [];

  async function walk(currentFolder) {
    const entries = await fs.readdir(currentFolder, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentFolder, entry.name);

      if (entry.isFile() && isArchiveFile(entry.name)) {
        archivePaths.push(entryPath);
        continue;
      }

      if (deepScan && entry.isDirectory()) {
        await walk(entryPath);
      }
    }
  }

  await walk(folderPath);
  return archivePaths;
}

async function scanArchives(folderPath, options = {}) {
  await ensureFolder(folderPath);
  await rememberLastFolder(folderPath);
  const archivePaths = await collectArchivePaths(folderPath, Boolean(options.deepScan));
  return scanArchivePaths(archivePaths, folderPath, options);
}

function resolveSevenZipPath() {
  let binaryPath = sevenZipBin.path7z;
  if (app.isPackaged) {
    binaryPath = binaryPath.replace('app.asar', 'app.asar.unpacked');
  }
  return binaryPath;
}

async function extractArchive(archive, password, smart) {
  return extractWithSevenZip(resolveSevenZipPath(), archive, {
    password,
    smart,
    propagateZone: settings.value.propagateZone,
    updateProgress: (progress) => {
      sendExtractionEvent({ type: 'job-update', id: archive.id, patch: { progress } });
    },
    onFinalizing: () => {
      sendExtractionEvent({ type: 'job-update', id: archive.id, patch: { progress: 99, message: tr('main.finalizing') } });
    }
  });
}

// Multi-volume sets are recycled together so no orphaned parts stay behind.
async function volumeSet(archivePath) {
  const folder = path.dirname(archivePath);
  const name = path.basename(archivePath);
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let pattern = null;
  const rarPart = /^(.*)\.part\d+\.rar$/i.exec(name);
  const numbered = /^(.*)\.\d{3}$/.exec(name);
  if (rarPart) pattern = new RegExp(`^${escape(rarPart[1])}\\.part\\d+\\.rar$`, 'i');
  else if (numbered) pattern = new RegExp(`^${escape(numbered[1])}\\.\\d{3}$`, 'i');
  if (!pattern) return [archivePath];
  return (await fs.readdir(folder)).filter((item) => pattern.test(item)).map((item) => path.join(folder, item));
}

function log(level, message) {
  sendExtractionEvent({
    type: 'log',
    entry: {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      time: new Date().toLocaleTimeString(),
      level,
      message
    }
  });
}

// Password problems come back as data: Electron drops custom error fields across IPC.
async function asResult(work) {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    return { ok: false, code: error.code || '', message: error.message || String(error) };
  }
}

function requireStringArray(value, label) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && path.isAbsolute(item))) {
    throw new Error(`${label} must be a list of absolute paths.`);
  }
  return value;
}

function requirePath(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error(`${label} must be an absolute path.`);
  return value;
}

function launcher() {
  // A self-extracting portable exe unpacks the whole app on every launch, which made
  // each right-click take seconds and let parallel launches collide.
  if (process.env.PORTABLE_EXECUTABLE_FILE) {
    throw Object.assign(new Error('The Explorer menu needs the installed or unzipped app, not the single-file portable exe.'), { code: 'PORTABLE_MENU' });
  }
  return { executable: process.execPath, args: app.isPackaged ? [] : [path.resolve(__dirname, '..')] };
}

// Keeps the menu pointing at this copy of the app after an update or a move.
async function refreshContextMenu() {
  if (!settings.value.explorerMenu || process.env.PORTABLE_EXECUTABLE_FILE) return;
  try {
    await registerContextMenu(launcher(), menuLabels());
  } catch (error) {
    log('error', error.message);
  }
}

function menuLabels() {
  const keys = ['archiveMenu', 'open', 'extractTo', 'extractHere', 'extractFolder', 'test', 'addMenu', 'addArchive', 'addZip', 'add7z', 'hash'];
  return Object.fromEntries(keys.map((key) => [key, tr(`menu.${key}`)]));
}

ipcMain.handle('app:ready', () => {
  rendererReady = true;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushCommands, 50);
});

ipcMain.handle('app:info', () => ({
  // Read straight from package.json so it is correct in dev too (app.getVersion
  // returns Electron's version when the app is not packaged).
  version: require('../package.json').version,
  extractFormats: EXTRACT_EXTENSIONS,
  createFormats: Object.keys(CREATE_FORMATS),
  hashAlgorithms: HASH_ALGORITHMS
}));

ipcMain.handle('settings:get', async () => ({
  ...settings.value,
  explorerMenu: settings.value.explorerMenu && (await isContextMenuRegistered())
}));

ipcMain.handle('settings:update', async (_event, patch) => asResult(async () => {
  const previous = settings.value;
  const next = await settings.update(patch || {});
  const menuChanged = next.explorerMenu !== previous.explorerMenu;
  if (next.explorerMenu && (menuChanged || next.language !== previous.language)) {
    try {
      await registerContextMenu(launcher(), menuLabels());
    } catch (error) {
      await settings.update({ explorerMenu: false });
      throw error;
    }
  } else if (!next.explorerMenu && menuChanged) {
    await unregisterContextMenu();
  }
  return settings.value;
}));

ipcMain.handle('folder:select', async (_event, options = {}) => {
  const defaultPath = typeof options?.defaultPath === 'string' && path.isAbsolute(options.defaultPath)
    ? options.defaultPath
    : await getLastFolder();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options?.purpose === 'destination' ? tr('main.dialogSelectDestination') : tr('main.dialogSelectFolder'),
    properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
    defaultPath: defaultPath || undefined
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  await rememberLastFolder(result.filePaths[0]);
  return result.filePaths[0];
});

ipcMain.handle('files:select', async (_event, { folders = false, archives = false, zip = false } = {}) => {
  const defaultPath = await getLastFolder();
  const filters = zip
    ? [{ name: 'ZIP', extensions: ['zip'] }, { name: tr('main.allFiles'), extensions: ['*'] }]
    : archives
      ? [{ name: tr('main.archiveFilter'), extensions: EXTRACT_EXTENSIONS }, { name: tr('main.allFiles'), extensions: ['*'] }]
      : undefined;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: archives || zip ? tr('main.dialogSelectArchive') : tr('main.dialogSelectFiles'),
    properties: [folders ? 'openDirectory' : 'openFile', 'multiSelections'],
    defaultPath: defaultPath || undefined,
    filters
  });
  if (result.canceled || result.filePaths.length === 0) return [];
  await rememberLastFolder(path.dirname(result.filePaths[0]));
  return result.filePaths;
});

ipcMain.handle('files:stat', async (_event, paths) => {
  const items = [];
  for (const item of requireStringArray(paths, 'Paths')) {
    try {
      const stat = await fs.stat(item);
      items.push({ path: item, name: path.basename(item) || item, isDirectory: stat.isDirectory(), size: stat.isDirectory() ? 0 : stat.size });
    } catch {}
  }
  return items;
});

ipcMain.handle('archives:scan', async (_event, { folderPath, options }) => {
  const archives = await scanArchives(folderPath, options);
  log('info', tr(options?.deepScan ? 'main.deepScanFound' : 'main.scanFound', { count: archives.length, folder: folderPath }));
  return archives;
});

ipcMain.handle('archives:scan-files', async (_event, { folderPath, archivePaths, options }) => {
  const archives = await scanArchivePaths(archivePaths, folderPath, options);
  log('info', tr('main.refreshed', { count: archives.length }));
  return archives;
});

ipcMain.handle('archives:browse', async (_event, folderPath) => {
  return browseArchives(folderPath || await getLastFolder() || app.getPath('downloads'));
});

ipcMain.handle('archives:select-files', async (_event, { options, archivePaths } = {}) => {
  const defaultPath = await getLastFolder();
  const result = Array.isArray(archivePaths) && archivePaths.length > 0
    ? { canceled: false, filePaths: archivePaths }
    : await dialog.showOpenDialog(mainWindow, {
    title: tr('main.dialogSelectArchives'),
    properties: ['openFile', 'multiSelections'],
    defaultPath: defaultPath || undefined,
    filters: [
      { name: tr('main.archiveFilter'), extensions: EXTRACT_EXTENSIONS },
      { name: tr('main.allFiles'), extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const rootFolder = path.dirname(result.filePaths[0]);
  await rememberLastFolder(rootFolder);
  const archives = await scanArchivePaths(result.filePaths, rootFolder, options);
  log('info', tr('main.selected', { count: archives.length, folder: rootFolder }));
  return { folderPath: rootFolder, archivePaths: result.filePaths, archives };
});

ipcMain.handle('archives:password', async (_event, { id, password }) => {
  if (!activeBatch) throw new Error('No extraction batch is running.');
  activeBatch.queue.submit(id, password);
  sendExtractionEvent({ type: 'job-update', id, patch: { message: tr('main.passwordReceived') } });
});

ipcMain.handle('archives:skip-waiting', async (_event, id) => {
  if (!activeBatch) throw new Error('No extraction batch is running.');
  activeBatch.queue.skip(id);
  activeBatch.summary.skipped += 1;
  sendExtractionEvent({ type: 'job-update', id, patch: { status: 'skipped', progress: 0, selected: false, message: tr('main.skippedWaiting') } });
});

ipcMain.handle('archives:extract-all', async (_event, { folderPath, archiveIds, archivePaths, options }) => {
  if (activeBatch) throw new Error(tr('main.busy'));
  const batch = { queue: new PasswordQueue(), summary: { done: 0, skipped: 0, error: 0, openFolderPath: null } };
  activeBatch = batch;
  const summary = batch.summary;
  const outputParentPaths = new Set();
  const smart = Boolean(options?.smart);
  try {
    await rememberLastFolder(folderPath);
    const selectedIds = new Set(archiveIds);
    const scannedArchives = Array.isArray(archivePaths) && archivePaths.length > 0
      ? await scanArchivePaths(archivePaths, folderPath, options)
      : await scanArchives(folderPath, options);
    const archives = scannedArchives.filter((archive) => selectedIds.has(archive.id));
    log('info', tr('main.extractionStarted', { folder: folderPath }));

    const processArchive = async (archive, password) => {
      // Recheck on password retry too, in case a destination appeared while waiting.
      if (await pathExists(archive.targetPath)) {
        const reservedTargets = new Set(archives.filter((item) => item.id !== archive.id).map((item) => item.targetPath.toLowerCase()));
        const nextTarget = await findAvailableTarget(archive.outputParentPath || folderPath, targetNameFor(archive.fileName), reservedTargets);
        archive.targetFolder = displayTargetFolder(folderPath, nextTarget.targetPath);
        archive.targetPath = nextTarget.targetPath;
      }
      sendExtractionEvent({ type: 'job-update', id: archive.id, patch: {
        status: 'extracting', progress: 0, targetFolder: archive.targetFolder, targetPath: archive.targetPath, message: ''
      } });
      log('info', tr('main.extracting', { name: archive.fileName, target: archive.targetFolder }));
      try {
        const startedAt = Date.now();
        const publishedPath = await extractArchive(archive, password, smart);
        summary.done += 1;
        outputParentPaths.add(path.dirname(publishedPath));
        sendExtractionEvent({ type: 'job-update', id: archive.id, patch: {
          status: 'done', progress: 100, selected: false, message: '',
          targetPath: publishedPath, targetFolder: displayTargetFolder(folderPath, publishedPath)
        } });
        log('done', tr('main.completed', { name: archive.fileName, seconds: ((Date.now() - startedAt) / 1000).toFixed(1) }));
        if (settings.value.trashAfterExtract) {
          try {
            for (const part of await volumeSet(archive.archivePath)) await shell.trashItem(part);
            log('info', tr('main.trashed', { name: archive.fileName }));
          } catch (error) {
            log('error', tr('main.trashFailed', { name: archive.fileName, message: error.message }));
          }
        }
      } catch (error) {
        if (error.code === 'PASSWORD_REQUIRED' || error.code === 'PASSWORD_INCORRECT') {
          batch.queue.add(archive);
          const message = tr(error.code === 'PASSWORD_REQUIRED' ? 'main.passwordRequired' : 'main.passwordIncorrect');
          sendExtractionEvent({ type: 'job-update', id: archive.id, patch: { status: 'awaiting-password', progress: 0, message } });
          log('info', tr('main.waitingPassword', { name: archive.fileName }));
        } else {
          summary.error += 1;
          sendExtractionEvent({ type: 'job-update', id: archive.id, patch: { status: 'error', progress: 0, message: error.message } });
          log('error', tr('main.error', { name: archive.fileName, message: error.message }));
        }
      }
    };

    // Finish the normal queue before returning to any password-protected archive.
    for (const archive of archives) await processArchive(archive);
    if (batch.queue.waiting.size) log('info', tr('main.otherFinished'));
    let next;
    while ((next = await batch.queue.next())) await processArchive(next.archive, next.password);

    if (outputParentPaths.size === 1) summary.openFolderPath = [...outputParentPaths][0];
    else if (outputParentPaths.size > 1) summary.openFolderPath = folderPath;
    log('done', tr('main.finished', summary));
    if (settings.value.openFolderAfter && summary.openFolderPath) void shell.openPath(summary.openFolderPath);
    sendExtractionEvent({ type: 'batch-complete', summary });
    return summary;
  } finally {
    batch.queue.passwords.clear();
    activeBatch = null;
  }
});

ipcMain.handle('archive:list', async (_event, { archivePath, password = '' }) => asResult(async () => {
  requirePath(archivePath, 'Archive');
  const stat = await fs.stat(archivePath);
  const listing = await listArchive(resolveSevenZipPath(), archivePath, password);
  return { archivePath, fileName: path.basename(archivePath), size: stat.size, ...listing };
}));

ipcMain.handle('archive:extract-entries', async (_event, { archivePath, entries = [], destinationFolder, password = '' }) => asResult(async () => {
  requirePath(archivePath, 'Archive');
  requirePath(destinationFolder, 'Destination');
  if (!Array.isArray(entries) || !entries.every((entry) => typeof entry === 'string')) throw new Error('Entries must be a list.');
  const fileName = path.basename(archivePath);
  const { targetPath } = await findAvailableTarget(destinationFolder, targetNameFor(fileName));
  const published = await extractWithSevenZip(resolveSevenZipPath(), { archivePath, fileName, targetPath }, {
    password,
    entries: entries.map((entry) => entry.replace(/\//g, '\\')),
    propagateZone: settings.value.propagateZone,
    updateProgress: (progress) => sendTaskProgress('browse', progress)
  });
  log('done', tr('main.entriesExtracted', { count: entries.length || '*', name: fileName, target: published }));
  if (settings.value.openFolderAfter) void shell.openPath(path.dirname(published));
  return published;
}));

ipcMain.handle('archive:test', async (_event, { archivePath, password = '' }) => asResult(async () => {
  requirePath(archivePath, 'Archive');
  await testArchive(resolveSevenZipPath(), archivePath, { password, updateProgress: (progress) => sendTaskProgress('test', progress) });
  log('done', tr('main.testOk', { name: path.basename(archivePath) }));
  return true;
}));

ipcMain.handle('archive:create', async (_event, options = {}) => asResult(async () => {
  requireStringArray(options.sources, 'Sources');
  requirePath(options.outputFolder, 'Output folder');
  log('info', tr('main.compressStarted', { count: options.sources.length }));
  const startedAt = Date.now();
  const result = await createArchive(resolveSevenZipPath(), options, { updateProgress: (progress) => sendTaskProgress('compress', progress) });
  log('done', tr('main.compressDone', { name: path.basename(result.outputPath), seconds: ((Date.now() - startedAt) / 1000).toFixed(1) }));
  return result;
}));

ipcMain.handle('hash:file', async (_event, { filePath, algorithms }) => asResult(async () => {
  requirePath(filePath, 'File');
  return hashFile(filePath, Array.isArray(algorithms) ? algorithms : HASH_ALGORITHMS, (progress) => sendTaskProgress('hash', progress));
}));

ipcMain.handle('shell:icons', async (_event, { paths, size }) => {
  const icons = {};
  for (const item of requireStringArray(paths, 'Paths').slice(0, 400)) {
    icons[item] = await shellIcons.get(item, Number(size) || 64).catch(() => '');
  }
  return icons;
});

ipcMain.handle('shell:show-item', async (_event, itemPath) => {
  shell.showItemInFolder(requirePath(itemPath, 'Item'));
});


// --- ZIP password recovery (self-service, for the user's own files) ------------

function bundledToolsRoot() {
  return app.isPackaged ? path.join(process.resourcesPath, 'tools') : path.join(__dirname, '..', 'tools');
}

async function defaultWordlist() {
  for (const root of [toolsDir(app.getPath('userData')), bundledToolsRoot()]) {
    const candidate = path.join(root, 'wordlists', 'common-passwords.txt');
    if (await pathExists(candidate)) return candidate;
  }
  return '';
}

ipcMain.handle('tools:list', async () => asResult(async () => {
  const detected = await detectTools(app.getPath('userData'), [bundledToolsRoot()]);
  return { ...detected, defaultWordlist: await defaultWordlist() };
}));

ipcMain.handle('tools:open-page', async (_event, url) => {
  if (typeof url === 'string' && /^https:\/\//.test(url)) await shell.openExternal(url);
});

ipcMain.handle('tools:open-folder', async () => {
  const dir = toolsDir(app.getPath('userData'));
  await fs.mkdir(dir, { recursive: true });
  await shell.openPath(dir);
  return dir;
});

ipcMain.handle('tools:download', async (_event, { toolId, consent } = {}) => asResult(async () => {
  // The UI only sends consent:true after the user ticks the per-tool confirmation box.
  if (consent !== true) throw Object.assign(new Error('Download needs your confirmation first.'), { code: 'NO_CONSENT' });
  const result = await downloadTool(toolId, {
    userDataDir: app.getPath('userData'),
    sevenZipPath: resolveSevenZipPath(),
    extract: extractInto,
    onProgress: (progress) => mainWindow?.webContents.send('tools:progress', { toolId, ...progress })
  });
  log('done', tr('recover.toolReady', { name: toolId }));
  return result;
}));

ipcMain.handle('tools:setup-all', async (_event, { consent } = {}) => asResult(async () => {
  if (consent !== true) throw Object.assign(new Error('Setup needs your confirmation first.'), { code: 'NO_CONSENT' });
  const results = await setupAllTools({
    userDataDir: app.getPath('userData'),
    sevenZipPath: resolveSevenZipPath(),
    extract: extractInto,
    onProgress: (progress) => mainWindow?.webContents.send('tools:progress', progress)
  });
  const added = results.filter((r) => r.ok && !r.skipped).map((r) => r.toolId);
  if (added.length) log('done', tr('recover.setupDone', { names: added.join(', ') }));
  return results;
}));

ipcMain.handle('recovery:inspect', async (_event, { zipPath }) => asResult(async () => {
  requirePath(zipPath, 'ZIP');
  const { listArchive } = require('./archive-ops.cjs');
  const listing = await listArchive(resolveSevenZipPath(), zipPath, '');
  // The recovery tools (zip2john, bkcrack) are ZIP-only. Reject anything else clearly.
  if (!/^zip$/i.test(listing.info.type || '')) {
    throw Object.assign(new Error(tr('recover.notZip', { name: path.basename(zipPath), type: (listing.info.type || path.extname(zipPath).slice(1) || '?').toUpperCase() })), { code: 'NOT_ZIP' });
  }
  const encrypted = listing.entries.filter((entry) => entry.encrypted && !entry.isDirectory)
    .map((entry) => ({ path: entry.path, size: entry.size, method: entry.method }));
  if (!encrypted.length) throw Object.assign(new Error(tr('recover.notEncrypted')), { code: 'NOT_ENCRYPTED' });
  const zipCrypto = encrypted.every((entry) => /ZipCrypto/i.test(entry.method));
  return { fileName: path.basename(zipPath), encrypted, zipCrypto };
}));

ipcMain.handle('recovery:start', async (_event, options = {}) => asResult(async () => {
  if (activeRecovery) throw Object.assign(new Error(tr('recover.busy')), { code: 'BUSY' });
  requirePath(options.zipPath, 'ZIP');
  if (options.knownPlaintextPath) requirePath(options.knownPlaintextPath, 'Known file');
  if (options.attack?.wordlistPath) requirePath(options.attack.wordlistPath, 'Wordlist');
  const detected = await detectTools(app.getPath('userData'), [bundledToolsRoot()]);
  const tool = (id) => detected.tools.find((item) => item.id === id);
  const tools = {
    bkcrack: tool('bkcrack')?.installed ? tool('bkcrack').exePath : null,
    hashcat: tool('hashcat')?.installed ? tool('hashcat').exePath : null,
    john: tool('john')?.exePath ? { exe: tool('john').exePath, helpers: tool('john').helpers } : null
  };
  const workDir = path.join(app.getPath('userData'), 'recovery', `job-${Date.now()}`);
  const job = new RecoveryJob(options, {
    tools, workDir, sevenZipPath: resolveSevenZipPath(),
    listArchive: require('./archive-ops.cjs').listArchive,
    emit: (event) => {
      mainWindow?.webContents.send('recovery:event', event);
      if (['found', 'exhausted', 'cancelled', 'error'].includes(event.type)) {
        if (event.type !== 'found') { job.cleanup(); if (activeRecovery === job) activeRecovery = null; }
      }
    }
  });
  activeRecovery = job;
  void job.start();
  return true;
}));

ipcMain.handle('recovery:pause', async () => { activeRecovery?.pause(); });
ipcMain.handle('recovery:resume', async () => { activeRecovery?.resume(); });
ipcMain.handle('recovery:cancel', async () => {
  const job = activeRecovery;
  activeRecovery = null;
  if (job) { job.cancel(); await job.cleanup(); }
});

ipcMain.handle('recovery:extract', async (_event, { zipPath, password = '', decryptedZipPath = '', destinationFolder } = {}) => asResult(async () => {
  requirePath(zipPath, 'ZIP');
  const source = decryptedZipPath && await pathExists(decryptedZipPath) ? decryptedZipPath : zipPath;
  const parent = destinationFolder ? requirePath(destinationFolder, 'Destination') : path.dirname(zipPath);
  const fileName = path.basename(zipPath);
  const { targetPath } = await findAvailableTarget(parent, targetNameFor(fileName));
  const published = await extractWithSevenZip(resolveSevenZipPath(), { archivePath: source, fileName, targetPath }, {
    password: decryptedZipPath ? '' : password,
    propagateZone: settings.value.propagateZone
  });
  // The decrypted copy was only a means to extract; the user keeps the original ZIP.
  if (decryptedZipPath && activeRecovery) { await activeRecovery.cleanup(); activeRecovery = null; }
  log('done', tr('recover.extracted', { name: fileName, target: published }));
  if (settings.value.openFolderAfter) void shell.openPath(path.dirname(published));
  return published;
}));

ipcMain.handle('folder:open', async (_event, folderPath) => {
  await ensureFolder(folderPath);
  const error = await shell.openPath(folderPath);
  if (error) return error;
  try {
    await applyFolderView(folderPath);
  } catch (viewError) {
    log('error', tr('main.folderViewFailed'));
  }
  return '';
});
