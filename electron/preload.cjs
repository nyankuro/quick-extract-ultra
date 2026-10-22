const { contextBridge, ipcRenderer, webUtils } = require('electron');

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('quickExtract', {
  selectFolder: (options) => ipcRenderer.invoke('folder:select', options),
  selectArchiveFiles: (options, archivePaths) => ipcRenderer.invoke('archives:select-files', { options, archivePaths }),
  browseArchives: (folderPath) => ipcRenderer.invoke('archives:browse', folderPath),
  scanArchives: (folderPath, options) => ipcRenderer.invoke('archives:scan', { folderPath, options }),
  scanSelectedArchives: (folderPath, archivePaths, options) =>
    ipcRenderer.invoke('archives:scan-files', { folderPath, archivePaths, options }),
  extractAll: (folderPath, archiveIds, archivePaths, options) =>
    ipcRenderer.invoke('archives:extract-all', { folderPath, archiveIds, archivePaths, options }),
  submitPassword: (id, password) => ipcRenderer.invoke('archives:password', { id, password }),
  skipWaitingArchive: (id) => ipcRenderer.invoke('archives:skip-waiting', id),
  openFolder: (folderPath) => ipcRenderer.invoke('folder:open', folderPath),
  onExtractionEvent: (callback) => subscribe('extraction:event', callback),

  readyForCommands: () => ipcRenderer.invoke('app:ready'),
  onAppCommand: (callback) => subscribe('app:command', callback),
  onTaskProgress: (callback) => subscribe('task:progress', callback),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  selectPaths: (options) => ipcRenderer.invoke('files:select', options),
  statPaths: (paths) => ipcRenderer.invoke('files:stat', paths),
  // Dropped files carry no path in the renderer since Electron 32; resolve it here.
  pathForFile: (file) => webUtils.getPathForFile(file),
  listArchive: (archivePath, password) => ipcRenderer.invoke('archive:list', { archivePath, password }),
  extractEntries: (archivePath, entries, destinationFolder, password) =>
    ipcRenderer.invoke('archive:extract-entries', { archivePath, entries, destinationFolder, password }),
  testArchive: (archivePath, password) => ipcRenderer.invoke('archive:test', { archivePath, password }),
  createArchive: (options) => ipcRenderer.invoke('archive:create', options),
  hashFile: (filePath, algorithms) => ipcRenderer.invoke('hash:file', { filePath, algorithms }),
  showItemInFolder: (itemPath) => ipcRenderer.invoke('shell:show-item', itemPath),
  getShellIcons: (paths, size) => ipcRenderer.invoke('shell:icons', { paths, size }),

  listTools: () => ipcRenderer.invoke('tools:list'),
  openToolPage: (url) => ipcRenderer.invoke('tools:open-page', url),
  openToolsFolder: () => ipcRenderer.invoke('tools:open-folder'),
  downloadTool: (toolId, consent) => ipcRenderer.invoke('tools:download', { toolId, consent }),
  setupAllTools: (consent) => ipcRenderer.invoke('tools:setup-all', { consent }),
  onToolProgress: (callback) => subscribe('tools:progress', callback),
  inspectZip: (zipPath) => ipcRenderer.invoke('recovery:inspect', { zipPath }),
  startRecovery: (options) => ipcRenderer.invoke('recovery:start', options),
  pauseRecovery: () => ipcRenderer.invoke('recovery:pause'),
  resumeRecovery: () => ipcRenderer.invoke('recovery:resume'),
  cancelRecovery: () => ipcRenderer.invoke('recovery:cancel'),
  recoveryExtract: (options) => ipcRenderer.invoke('recovery:extract', options),
  onRecoveryEvent: (callback) => subscribe('recovery:event', callback)
});
