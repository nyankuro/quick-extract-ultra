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

export type Language = 'en' | 'ja' | 'vi' | 'zh-Hans' | 'zh-Hant';

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

export type ToolPurpose = 'known-plaintext' | 'gpu' | 'cpu';

export interface ToolInfo {
  id: 'bkcrack' | 'hashcat' | 'john';
  name: string;
  license: string;
  licenseUrl: string;
  approxSizeMb: number;
  page: string;
  purpose: ToolPurpose;
  autoAvailable: boolean;
  autoNote: string;
  installed: boolean;
  exePath: string;
  helpers: Record<string, string>;
  version: string;
}

export interface ToolList {
  toolsDir: string;
  tools: ToolInfo[];
  defaultWordlist: string;
}

export interface EncryptedEntry {
  path: string;
  size: number;
  method: string;
}

export interface ZipInspection {
  fileName: string;
  encrypted: EncryptedEntry[];
  zipCrypto: boolean;
}

export interface Charset {
  lower?: boolean;
  upper?: boolean;
  digits?: boolean;
  symbols?: boolean;
}

export interface RecoveryOptions {
  zipPath: string;
  entryName?: string;
  knownPlaintextPath?: string;
  device?: 'auto' | 'gpu' | 'cpu';
  attack?: {
    mode: 'auto' | 'wordlist' | 'bruteforce';
    wordlistPath?: string;
    charset?: Charset;
    minLen?: number;
    maxLen?: number;
  };
}

export type RecoveryEvent =
  | { type: 'stage'; stage: string; device?: string; mode?: string; entry?: string }
  | { type: 'info'; message: string }
  | { type: 'progress'; percent: number | null; speed: number | null; eta: number | null; etaText?: string | null; tried?: number | null; total?: number | null }
  | { type: 'found'; password: string | null; via: string; decryptedZipPath?: string }
  | { type: 'exhausted' }
  | { type: 'paused' }
  | { type: 'resumed' }
  | { type: 'cancelled' }
  | { type: 'error'; message: string; code?: string };

export interface ToolProgress {
  toolId: string;
  phase: 'download' | 'verify' | 'extract';
  percent: number;
  verified?: boolean;
  sha256?: string;
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
      selectPaths: (options: { folders?: boolean; archives?: boolean; zip?: boolean }) => Promise<string[]>;
      statPaths: (paths: string[]) => Promise<PathInfo[]>;
      pathForFile: (file: File) => string;
      listArchive: (archivePath: string, password?: string) => Promise<TaskResult<ArchiveListing>>;
      extractEntries: (archivePath: string, entries: string[], destinationFolder: string, password?: string) => Promise<TaskResult<string>>;
      testArchive: (archivePath: string, password?: string) => Promise<TaskResult<boolean>>;
      createArchive: (options: CreateArchiveOptions) => Promise<TaskResult<{ outputPath: string; files: string[] }>>;
      hashFile: (filePath: string, algorithms?: string[]) => Promise<TaskResult<HashResult>>;
      showItemInFolder: (itemPath: string) => Promise<void>;
      getShellIcons: (paths: string[], size: number) => Promise<Record<string, string>>;
      listTools: () => Promise<TaskResult<ToolList>>;
      openToolPage: (url: string) => Promise<void>;
      openToolsFolder: () => Promise<string>;
      downloadTool: (toolId: string, consent: boolean) => Promise<TaskResult<{ verified: boolean; sha256: string; checksumPublished: boolean; version: string; source: string }>>;
      setupAllTools: (consent: boolean) => Promise<TaskResult<Array<{ toolId: string; ok: boolean; skipped?: boolean; verified?: boolean; sha256?: string; message?: string }>>>;
      onToolProgress: (callback: (event: ToolProgress) => void) => () => void;
      inspectZip: (zipPath: string) => Promise<TaskResult<ZipInspection>>;
      startRecovery: (options: RecoveryOptions) => Promise<TaskResult<boolean>>;
      pauseRecovery: () => Promise<void>;
      resumeRecovery: () => Promise<void>;
      cancelRecovery: () => Promise<void>;
      recoveryExtract: (options: { zipPath: string; password?: string; decryptedZipPath?: string; destinationFolder?: string }) => Promise<TaskResult<string>>;
      onRecoveryEvent: (callback: (event: RecoveryEvent) => void) => () => void;
    };
  }
}
