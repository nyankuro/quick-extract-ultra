export type ArchiveStatus = 'ready' | 'queued' | 'extracting' | 'awaiting-password' | 'done' | 'skipped' | 'error';

export interface ArchiveItem {
  id: string;
  archivePath: string;
  fileName: string;
  format: string;
  targetFolder: string;
  targetPath: string;
  outputParentPath?: string;
  size: number;
  status: ArchiveStatus;
  progress: number;
  selected: boolean;
  message?: string;
}

export interface ActivityLog {
  id: string;
  time: string;
  level: 'info' | 'done' | 'skipped' | 'error';
  message: string;
}

export interface ExtractionEvent {
  type: 'job-update' | 'log' | 'batch-complete';
  id?: string;
  patch?: Partial<ArchiveItem>;
  entry?: ActivityLog;
  summary?: {
    done: number;
    skipped: number;
    error: number;
    openFolderPath?: string | null;
  };
}

export interface ScanOptions {
  useMainFolder?: boolean;
  newMainFolder?: boolean;
  deepScan?: boolean;
  smart?: boolean;
  outputFolder?: string;
}

export type Language = 'en' | 'ja' | 'vi';

export interface AppSettings {
  language: Language;
  explorerMenu: boolean;
  openFolderAfter: boolean;
  propagateZone: boolean;
  trashAfterExtract: boolean;
}

export interface AppInfo {
  version: string;
  extractFormats: string[];
  createFormats: string[];
  hashAlgorithms: string[];
}

export type AppCommandAction = 'open' | 'extract-to' | 'extract-here' | 'extract-folder' | 'test' | 'compress' | 'add-zip' | 'add-7z' | 'hash';

export interface AppCommand {
  action: AppCommandAction;
  paths: string[];
}

export type TaskResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

export interface PathInfo {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
}

export interface ArchiveEntry {
  path: string;
  isDirectory: boolean;
  size: number;
  packedSize: number;
  modified: string;
  encrypted: boolean;
  crc: string;
  method: string;
}

export interface ArchiveListing {
  archivePath: string;
  fileName: string;
  size: number;
  info: { type: string; method: string; solid: boolean; physicalSize: number; encryptedHeaders: boolean };
  entries: ArchiveEntry[];
}

export interface CreateArchiveOptions {
  sources: string[];
  outputFolder: string;
  archiveName: string;
  format: string;
  level: number;
  password?: string;
  encryptNames?: boolean;
  volumeSizeMb?: number;
}

export interface HashResult {
  path: string;
  size: number;
  hashes: Record<string, string>;
}

export interface BrowserEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
}

export interface BrowserFolder {
  folderPath: string;
  parentPath: string | null;
  entries: BrowserEntry[];
}

declare global {
  interface Window {
    quickExtract: {
      selectFolder: (options?: { defaultPath?: string; purpose?: 'destination' }) => Promise<string | null>;
      selectArchiveFiles: (options?: ScanOptions, archivePaths?: string[]) => Promise<{
        folderPath: string;
        archivePaths: string[];
        archives: ArchiveItem[];
      } | null>;
      browseArchives: (folderPath?: string) => Promise<BrowserFolder>;
      scanArchives: (folderPath: string, options?: ScanOptions) => Promise<ArchiveItem[]>;
      scanSelectedArchives: (
        folderPath: string,
        archivePaths: string[],
        options?: ScanOptions
      ) => Promise<ArchiveItem[]>;
      extractAll: (
        folderPath: string,
        archiveIds: string[],
        archivePaths?: string[],
        options?: ScanOptions
      ) => Promise<{ done: number; skipped: number; error: number; openFolderPath?: string | null }>;
      submitPassword: (id: string, password: string) => Promise<void>;
      skipWaitingArchive: (id: string) => Promise<void>;
      openFolder: (folderPath: string) => Promise<string>;
      onExtractionEvent: (callback: (event: ExtractionEvent) => void) => () => void;
      readyForCommands: () => Promise<void>;
      onAppCommand: (callback: (command: AppCommand) => void) => () => void;
      onTaskProgress: (callback: (event: { task: string; progress: number }) => void) => () => void;
      getAppInfo: () => Promise<AppInfo>;
      getSettings: () => Promise<AppSettings>;
      updateSettings: (patch: Partial<AppSettings>) => Promise<TaskResult<AppSettings>>;
      selectPaths: (options: { folders?: boolean; archives?: boolean }) => Promise<string[]>;
      statPaths: (paths: string[]) => Promise<PathInfo[]>;
      pathForFile: (file: File) => string;
      listArchive: (archivePath: string, password?: string) => Promise<TaskResult<ArchiveListing>>;
      extractEntries: (archivePath: string, entries: string[], destinationFolder: string, password?: string) => Promise<TaskResult<string>>;
      testArchive: (archivePath: string, password?: string) => Promise<TaskResult<boolean>>;
      createArchive: (options: CreateArchiveOptions) => Promise<TaskResult<{ outputPath: string; files: string[] }>>;
      hashFile: (filePath: string, algorithms?: string[]) => Promise<TaskResult<HashResult>>;
      showItemInFolder: (itemPath: string) => Promise<void>;
    };
  }
}
