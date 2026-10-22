import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import {
  Archive,
  Check,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Files,
  FolderArchive,
  Clock3,
  Folder,
  FolderOpen,
  FolderOutput,
  FolderSearch,
  HardDrive,
  Heart,
  Languages,
  LoaderCircle,
  LockKeyhole,
  PackagePlus,
  Play,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  KeyRound,
  Sparkles,
  Square,
  Trash2,
  Wand2,
  X
} from 'lucide-react';
import galaxyUrl from './assets/galaxy-background.png';
import ArchivePicker from './ArchivePicker';
import CompressView, { type CompressRequest } from './CompressView';
import BrowseView, { type BrowseRequest } from './BrowseView';
import ToolsView, { type ToolsRequest } from './ToolsView';
import RecoverView from './RecoverView';
import SettingsDialog from './SettingsDialog';
import { LANGUAGE_NAMES, LanguageProvider, useT, type Translate } from './i18n';
import type {
  ActivityLog,
  AppCommand,
  AppInfo,
  AppSettings,
  ArchiveItem,
  ArchiveStatus,
  ExtractionEvent,
  Language,
  ScanOptions
} from './types';

export type AddLog = (level: ActivityLog['level'], message: string) => void;
type Tab = 'extract' | 'compress' | 'browse' | 'tools' | 'recover';

const STATUS_KEYS: Record<ArchiveStatus, string> = {
  ready: 'status.ready',
  queued: 'status.queued',
  extracting: 'status.extracting',
  'awaiting-password': 'status.awaitingPassword',
  done: 'status.done',
  skipped: 'status.skipped',
  error: 'status.error'
};

const STATUS_ICONS: Record<ArchiveStatus, typeof Clock3> = {
  ready: Clock3,
  queued: Clock3,
  extracting: LoaderCircle,
  'awaiting-password': LockKeyhole,
  done: CheckCircle2,
  skipped: CircleDashed,
  error: CircleAlert
};

const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  explorerMenu: false,
  openFolderAfter: false,
  propagateZone: true,
  trashAfterExtract: false
};

function createWelcomeLog(t: Translate): ActivityLog {
  return {
    id: 'welcome',
    time: new Date().toLocaleTimeString(),
    level: 'info',
    message: t('log.welcome')
  };
}

export function parentOf(filePath: string) {
  const index = filePath.replace(/[\\/]+$/, '').search(/[\\/][^\\/]*$/);
  return index > 0 ? filePath.slice(0, index) : filePath;
}

export function formatBytes(bytes: number) {
  if (bytes === 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(2)} ${units[index]}`;
}

function statusIcon(status: ArchiveStatus) {
  const Icon = STATUS_ICONS[status];
  return <Icon className={status === 'extracting' ? 'spin' : ''} size={18} aria-hidden="true" />;
}

function logGlyph(level: ActivityLog['level']) {
  if (level === 'done') {
    return <Check size={14} />;
  }
  if (level === 'skipped') {
    return <CircleDashed size={14} />;
  }
  if (level === 'error') {
    return <CircleAlert size={14} />;
  }
  return <Sparkles size={14} />;
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    void window.quickExtract.getSettings().then(setSettings);
  }, []);

  useEffect(() => {
    document.documentElement.lang = settings.language;
  }, [settings.language]);

  return (
    <LanguageProvider language={settings.language}>
      <Workspace settings={settings} onSettingsChange={setSettings} />
    </LanguageProvider>
  );
}

interface WorkspaceProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

function Workspace({ settings, onSettingsChange }: WorkspaceProps) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('extract');
  const [folderPath, setFolderPath] = useState('');
  const [archives, setArchives] = useState<ArchiveItem[]>([]);
  const [selectedArchivePaths, setSelectedArchivePaths] = useState<string[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>(() => [createWelcomeLog(t)]);
  const [isScanning, setIsScanning] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [useMainFolder, setUseMainFolder] = useState(false);
  const [newMainFolder, setNewMainFolder] = useState(false);
  const [smartExtract, setSmartExtract] = useState(false);
  const [outputFolder, setOutputFolder] = useState('');
  const [lastFolderScanWasDeep, setLastFolderScanWasDeep] = useState(false);
  const [lastOutputFolderPath, setLastOutputFolderPath] = useState('');
  const [notice, setNotice] = useState('');
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [compressRequest, setCompressRequest] = useState<CompressRequest | null>(null);
  const [browseRequest, setBrowseRequest] = useState<BrowseRequest | null>(null);
  const [toolsRequest, setToolsRequest] = useState<ToolsRequest | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const extractingRef = useRef(false);
  const commandQueue = useRef<AppCommand[]>([]);
  const commandRunning = useRef(false);
  const commandHandler = useRef<(command: AppCommand) => Promise<void>>(async () => {});

  useEffect(() => {
    extractingRef.current = isExtracting;
  }, [isExtracting]);

  useEffect(() => {
    void window.quickExtract.getAppInfo().then(setAppInfo);
  }, []);

  // Keep the welcome line in the chosen language when nothing else has happened yet.
  useEffect(() => {
    setLogs((current) => current.map((entry) => (entry.id === 'welcome' ? createWelcomeLog(t) : entry)));
  }, [t]);

  useEffect(() => {
    return window.quickExtract.onExtractionEvent((event: ExtractionEvent) => {
      if (event.type === 'job-update' && event.id && event.patch) {
        setArchives((current) =>
          current.map((archive) => (archive.id === event.id ? { ...archive, ...event.patch } : archive))
        );
      }

      if (event.type === 'log' && event.entry) {
        setLogs((current) => [event.entry!, ...current].slice(0, 200));
        setNotice(event.entry.message);
      }

      if (event.type === 'batch-complete') {
        setIsExtracting(false);
        extractingRef.current = false;
        if (event.summary?.openFolderPath) {
          setLastOutputFolderPath(event.summary.openFolderPath);
        }
        setNotice('');
      }
    });
  }, []);

  const selectedCount = useMemo(() => archives.filter((archive) => archive.selected).length, [archives]);
  const selectedReadyIds = useMemo(
    () =>
      archives
        .filter((archive) => archive.selected && archive.status !== 'done' && archive.status !== 'skipped')
        .map((archive) => archive.id),
    [archives]
  );
  const stats = useMemo(() => {
    const statusCount = archives.reduce(
      (acc, archive) => {
        acc[archive.status] += 1;
        return acc;
      },
      { ready: 0, queued: 0, extracting: 0, 'awaiting-password': 0, done: 0, skipped: 0, error: 0 } as Record<ArchiveStatus, number>
    );

    return {
      total: archives.length,
      selected: selectedCount,
      totalSize: archives.reduce((sum, archive) => sum + archive.size, 0),
      ...statusCount
    };
  }, [archives, selectedCount]);

  const sourceLabel = useMemo(() => {
    if (selectedArchivePaths.length > 0) {
      return t('extract.selectedSource', { count: selectedArchivePaths.length, folder: folderPath });
    }

    return folderPath || t('extract.noSource');
  }, [folderPath, selectedArchivePaths.length, t]);

  const addLog: AddLog = useCallback((level, message) => {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      time: new Date().toLocaleTimeString(),
      level,
      message
    };
    setLogs((current) => [entry, ...current].slice(0, 200));
    setNotice(message);
  }, []);

  const buildScanOptions = (
    nextUseMainFolder = useMainFolder,
    nextNewMainFolder = newMainFolder,
    deepScan = false,
    nextOutputFolder = outputFolder
  ): ScanOptions => ({
    useMainFolder: nextUseMainFolder,
    newMainFolder: nextUseMainFolder && nextNewMainFolder,
    deepScan,
    smart: smartExtract,
    outputFolder: nextOutputFolder || undefined
  });

  const scanFolder = async (
    nextFolderPath = folderPath,
    nextUseMainFolder = useMainFolder,
    nextNewMainFolder = newMainFolder,
    deepScan = false,
    nextOutputFolder = outputFolder
  ) => {
    if (!nextFolderPath) {
      addLog('error', t('log.selectFolderFirst'));
      return;
    }

    setIsScanning(true);
    setLastOutputFolderPath('');
    setNotice(t(deepScan ? 'notice.deepScanning' : 'notice.scanning'));
    try {
      const result = await window.quickExtract.scanArchives(
        nextFolderPath,
        // Folder and deep scans always extract beside each source archive, ignoring "Save to".
        buildScanOptions(nextUseMainFolder, nextNewMainFolder, deepScan, '')
      );
      setSelectedArchivePaths([]);
      setLastFolderScanWasDeep(deepScan);
      setArchives(result);
      addLog('done', t(deepScan ? 'log.deepScanFound' : 'log.found', { count: result.length }));
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : t('log.scanFailed'));
    } finally {
      setIsScanning(false);
      setNotice('');
    }
  };

  const chooseFolder = async () => {
    const selected = await window.quickExtract.selectFolder();
    if (!selected) {
      return;
    }

    setFolderPath(selected);
    setArchives([]);
    setLastOutputFolderPath('');
    addLog('info', t('log.scanningFolder', { folder: selected }));
    await scanFolder(selected, useMainFolder, newMainFolder, false);
  };

  const deepScanFolder = async () => {
    if (isScanning || isExtracting) {
      return;
    }

    let selected = folderPath;
    if (!selected) {
      const picked = await window.quickExtract.selectFolder();
      if (!picked) {
        return;
      }

      selected = picked;
      setFolderPath(picked);
      setArchives([]);
      setLastOutputFolderPath('');
    }

    addLog('info', t('log.deepScanningFolder', { folder: selected }));
    await scanFolder(selected, useMainFolder, newMainFolder, true);
  };

  const chooseArchiveFiles = async (archivePaths: string[], options = buildScanOptions()) => {
    if (isScanning || extractingRef.current) {
      return null;
    }

    setIsScanning(true);
    setNotice(t('notice.selecting'));
    try {
      const result = await window.quickExtract.selectArchiveFiles(options, archivePaths);
      if (!result) {
        return null;
      }

      setFolderPath(result.folderPath);
      setSelectedArchivePaths(result.archivePaths);
      setLastFolderScanWasDeep(false);
      setArchives(result.archives);
      setLastOutputFolderPath('');
      addLog('done', t('log.selectedArchives', { count: result.archives.length }));
      setIsPickerOpen(false);
      return result;
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : t('log.selectionFailed'));
      throw error;
    } finally {
      setIsScanning(false);
      setNotice('');
    }
  };

  const toggleArchive = (archiveId: string) => {
    if (isExtracting) {
      return;
    }

    setArchives((current) =>
      current.map((archive) =>
        archive.id === archiveId && archive.status !== 'done' && archive.status !== 'skipped'
          ? { ...archive, selected: !archive.selected }
          : archive
      )
    );
  };

  const runExtraction = async (rootFolder: string, ids: string[], paths: string[] | undefined, options: ScanOptions) => {
    setIsExtracting(true);
    extractingRef.current = true;
    setArchives((current) =>
      current.map((archive) => (ids.includes(archive.id) ? { ...archive, status: 'queued', progress: 0 } : archive))
    );

    try {
      const result = await window.quickExtract.extractAll(rootFolder, ids, paths, options);
      if (result.openFolderPath) {
        setLastOutputFolderPath(result.openFolderPath);
      }
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : t('log.extractionFailed'));
      setIsExtracting(false);
      extractingRef.current = false;
    }
  };

  const extractAll = async () => {
    if (!folderPath) {
      addLog('error', t('log.selectFolderFirst'));
      return;
    }

    if (selectedReadyIds.length === 0) {
      addLog('skipped', t('log.nothingSelected'));
      return;
    }

    await runExtraction(
      folderPath,
      selectedReadyIds,
      selectedArchivePaths.length > 0 ? selectedArchivePaths : undefined,
      // "Save to" applies only to explicitly chosen files; scanned folders extract beside each archive.
      buildScanOptions(useMainFolder, newMainFolder, lastFolderScanWasDeep, selectedArchivePaths.length > 0 ? outputFolder : '')
    );
  };

  const openCurrentFolder = async () => {
    if (!folderPath) {
      addLog('error', t('log.selectFolderFirst'));
      return;
    }

    const folderToOpen = lastOutputFolderPath || folderPath;
    const result = await window.quickExtract.openFolder(folderToOpen);
    if (result) {
      addLog('error', result);
    }
  };

  const clearAll = () => {
    if (isExtracting) {
      addLog('error', t('log.waitBeforeClear'));
      return;
    }

    setFolderPath('');
    setArchives([]);
    setSelectedArchivePaths([]);
    setLogs([createWelcomeLog(t)]);
    setIsScanning(false);
    setUseMainFolder(false);
    setNewMainFolder(false);
    setSmartExtract(false);
    setOutputFolder('');
    setLastFolderScanWasDeep(false);
    setLastOutputFolderPath('');
    setPasswordDrafts({});
    setNotice('');
  };

  const rescan = (nextUseMainFolder: boolean, nextNewMainFolder: boolean, nextOutputFolder = outputFolder) => {
    if (selectedArchivePaths.length > 0) {
      void rescanSelectedFiles(selectedArchivePaths, nextUseMainFolder, nextNewMainFolder, nextOutputFolder);
      return;
    }

    if (folderPath) {
      void scanFolder(folderPath, nextUseMainFolder, nextNewMainFolder, lastFolderScanWasDeep, nextOutputFolder);
    }
  };

  const chooseOutputFolder = async () => {
    const firstArchive = archives[0]?.archivePath;
    const picked = await window.quickExtract.selectFolder({
      purpose: 'destination',
      defaultPath: outputFolder || (firstArchive ? parentOf(firstArchive) : folderPath) || undefined
    });
    if (!picked) return;
    setOutputFolder(picked);
    addLog('info', t('log.destinationSet', { folder: picked }));
    rescan(useMainFolder, newMainFolder, picked);
  };

  const resetOutputFolder = () => {
    setOutputFolder('');
    addLog('info', t('log.destinationReset'));
    rescan(useMainFolder, newMainFolder, '');
  };

  const toggleMainFolder = () => {
    if (isExtracting) {
      addLog('error', t('log.waitBeforeMode'));
      return;
    }

    const nextUseMainFolder = !useMainFolder;
    const nextNewMainFolder = nextUseMainFolder ? newMainFolder : false;
    setUseMainFolder(nextUseMainFolder);
    setNewMainFolder(nextNewMainFolder);
    addLog('info', t(nextUseMainFolder ? 'log.mainOn' : 'log.mainOff'));
    rescan(nextUseMainFolder, nextNewMainFolder);
  };

  const toggleNewMainFolder = () => {
    if (isExtracting) {
      addLog('error', t('log.waitBeforeMode'));
      return;
    }

    if (!useMainFolder) {
      addLog('skipped', t('log.mainFirst'));
      return;
    }

    const nextNewMainFolder = !newMainFolder;
    setNewMainFolder(nextNewMainFolder);
    addLog('info', t(nextNewMainFolder ? 'log.newMainOn' : 'log.newMainOff'));
    rescan(useMainFolder, nextNewMainFolder);
  };

  const toggleSmart = () => {
    const next = !smartExtract;
    setSmartExtract(next);
    addLog('info', t(next ? 'log.smartOn' : 'log.smartOff'));
  };

  const rescanSelectedFiles = async (
    archivePaths: string[],
    nextUseMainFolder: boolean,
    nextNewMainFolder = newMainFolder,
    nextOutputFolder = outputFolder
  ) => {
    if (!folderPath || archivePaths.length === 0) {
      return;
    }

    setIsScanning(true);
    try {
      const result = await window.quickExtract.scanSelectedArchives(
        folderPath,
        archivePaths,
        buildScanOptions(nextUseMainFolder, nextNewMainFolder, false, nextOutputFolder)
      );
      setArchives(result);
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : t('log.rescanFailed'));
    } finally {
      setIsScanning(false);
    }
  };

  const submitPassword = async (archiveId: string) => {
    const password = passwordDrafts[archiveId];
    if (!password) return;
    try {
      await window.quickExtract.submitPassword(archiveId, password);
      setPasswordDrafts((current) => {
        const next = { ...current };
        delete next[archiveId];
        return next;
      });
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : t('log.passwordFailed'));
    }
  };

  const skipWaitingArchive = async (archiveId: string) => {
    try {
      await window.quickExtract.skipWaitingArchive(archiveId);
      setPasswordDrafts((current) => {
        const next = { ...current };
        delete next[archiveId];
        return next;
      });
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : t('log.skipFailed'));
    }
  };

  // Explorer menu commands. Each one finishes (including its extraction) before the next starts.
  const handleCommand = async (command: AppCommand) => {
    const nonce = Date.now() + Math.random();
    if (command.action === 'extract-here' || command.action === 'extract-folder' || command.action === 'extract-to') {
      setTab('extract');
      const options: ScanOptions = { smart: command.action === 'extract-here' };
      if (command.action === 'extract-to') {
        const picked = await window.quickExtract.selectFolder({ purpose: 'destination', defaultPath: parentOf(command.paths[0]) });
        if (!picked) {
          await chooseArchiveFiles(command.paths, options).catch(() => null);
          return;
        }
        options.outputFolder = picked;
      }
      setOutputFolder(options.outputFolder ?? '');
      setSmartExtract(Boolean(options.smart));
      setUseMainFolder(false);
      setNewMainFolder(false);
      const result = await chooseArchiveFiles(command.paths, options).catch(() => null);
      if (result && result.archives.length) {
        await runExtraction(result.folderPath, result.archives.map((item) => item.id), result.archivePaths, options);
      }
      return;
    }
    if (command.action === 'open') {
      if (command.paths.length === 1) {
        setTab('browse');
        setBrowseRequest({ archivePath: command.paths[0], nonce });
      } else if (!extractingRef.current) {
        setTab('extract');
        await chooseArchiveFiles(command.paths).catch(() => null);
      }
      return;
    }
    if (command.action === 'test' || command.action === 'hash') {
      setTab('tools');
      setToolsRequest({ mode: command.action, paths: command.paths, nonce });
      return;
    }
    setTab('compress');
    setCompressRequest({
      sources: command.paths,
      format: command.action === 'add-zip' ? 'zip' : command.action === 'add-7z' ? '7z' : undefined,
      autoStart: command.action === 'add-zip' || command.action === 'add-7z',
      nonce
    });
  };
  commandHandler.current = handleCommand;

  const drainCommands = async () => {
    if (commandRunning.current) return;
    commandRunning.current = true;
    try {
      let next: AppCommand | undefined;
      while ((next = commandQueue.current.shift())) {
        // Wait out a batch the user started by hand.
        while (extractingRef.current) await new Promise((resolve) => setTimeout(resolve, 200));
        try {
          await commandHandler.current(next);
        } catch (error) {
          addLog('error', error instanceof Error ? error.message : String(error));
        }
      }
    } finally {
      commandRunning.current = false;
    }
  };

  const enqueueCommand = (command: AppCommand) => {
    // Explorer may deliver files one at a time; fold them into the request still waiting.
    const waiting = commandQueue.current.at(-1);
    if (waiting && waiting.action === command.action) {
      waiting.paths.push(...command.paths.filter((item) => !waiting.paths.includes(item)));
    } else {
      commandQueue.current.push({ action: command.action, paths: [...command.paths] });
    }
    if (commandRunning.current || extractingRef.current) addLog('info', t('log.commandQueued'));
    void drainCommands();
  };

  useEffect(() => {
    const unsubscribe = window.quickExtract.onAppCommand((command) => enqueueCommand(command));
    void window.quickExtract.readyForCommands();
    return unsubscribe;
  }, []);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const paths = [...event.dataTransfer.files].map((file) => window.quickExtract.pathForFile(file)).filter(Boolean);
    if (!paths.length) return;
    if (tab === 'compress') {
      setCompressRequest({ sources: paths, append: true, nonce: Date.now() });
    } else if (tab === 'browse') {
      setBrowseRequest({ archivePath: paths[0], nonce: Date.now() });
    } else if (tab === 'tools') {
      setToolsRequest({ mode: 'hash', paths, nonce: Date.now() });
    } else {
      if (isExtracting) return;
      void chooseArchiveFiles(paths).catch(() => null);
    }
  };

  const changeLanguage = async (language: Language) => {
    const result = await window.quickExtract.updateSettings({ language });
    if (result.ok) onSettingsChange(result.value);
    else addLog('error', result.message);
  };

  const busy = isScanning || isExtracting;
  const tabs: { id: Tab; icon: typeof Archive; label: string }[] = [
    { id: 'extract', icon: Archive, label: t('tab.extract') },
    { id: 'compress', icon: PackagePlus, label: t('tab.compress') },
    { id: 'browse', icon: FolderSearch, label: t('tab.browse') },
    { id: 'tools', icon: ShieldCheck, label: t('tab.tools') },
    { id: 'recover', icon: KeyRound, label: t('tab.recover') }
  ];

  return (
    <main
      className="app-shell"
      style={{ '--galaxy': `url(${galaxyUrl})` } as CSSProperties}
      onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setIsDragging(false); }}
      onDrop={onDrop}
    >
      <div className="stars-layer" aria-hidden="true" />
      <section className="window-frame" aria-label={t('app.ariaLabel')}>
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">
              <Archive size={28} />
            </div>
            <div>
              <h1>Quick Extract <em>Ultra</em>{appInfo?.version && <small className="app-version">v{appInfo.version}</small>}</h1>
              <span>{notice || t('notice.ready')}</span>
              <div className="kofi-row">
                <button
                  className="kofi-button"
                  type="button"
                  onClick={() => void window.quickExtract.openToolPage('https://ko-fi.com/nyannyankuro')}
                  title="ko-fi.com/nyannyankuro"
                >
                  <Heart size={15} aria-hidden="true" />
                  {t('support.button')}
                </button>
                <span className="kofi-caption">{t('support.caption')}</span>
              </div>
            </div>
          </div>
          <nav className="tab-bar" aria-label={t('tab.label')}>
            {tabs.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                type="button"
                className={`tab-button ${tab === id ? 'active' : ''} ${id === 'recover' ? 'tab-special' : ''}`}
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => setTab(id)}
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </button>
            ))}
          </nav>
          <div className="topbar-actions">
            <label className="language-select">
              <Languages size={18} aria-hidden="true" />
              <span className="visually-hidden">{t('settings.language')}</span>
              <select value={settings.language} onChange={(event) => void changeLanguage(event.target.value as Language)}>
                {(Object.keys(LANGUAGE_NAMES) as Language[]).map((code) => (
                  <option key={code} value={code}>{LANGUAGE_NAMES[code]}</option>
                ))}
              </select>
            </label>
            <button className="icon-button" type="button" onClick={() => setIsSettingsOpen(true)} aria-label={t('settings.title')} title={t('settings.title')}>
              <SettingsIcon size={20} />
            </button>
          </div>
        </header>

        <div className={`view view-${tab}`}>
          {tab === 'extract' && (
            <>
              <section className="folder-panel" aria-label={t('extract.source')}>
                <span className="folder-label">{t('extract.source')}</span>
                <div className="folder-controls">
                  <div className="path-display source-display" id="folderPath" role="status" aria-live="polite">
                    <Folder size={24} aria-hidden="true" />
                    <span>{sourceLabel}</span>
                  </div>
                  <button className="secondary-button" type="button" data-action="choose-files" onClick={() => setIsPickerOpen(true)} disabled={busy}>
                    <Files size={20} aria-hidden="true" />
                    {t('extract.chooseFiles')}
                  </button>
                  <button className="secondary-button" type="button" onClick={chooseFolder} disabled={busy}>
                    <FolderOpen size={20} aria-hidden="true" />
                    {t('extract.scanFolder')}
                  </button>
                  <button className="secondary-button" type="button" onClick={deepScanFolder} disabled={busy}>
                    <Search size={20} aria-hidden="true" />
                    {t('extract.deepScan')}
                  </button>
                  <div className="control-divider" />
                  <div className={`destination-control ${outputFolder ? 'active' : ''}`}>
                    <button
                      className="secondary-button destination-button"
                      type="button"
                      data-action="choose-destination"
                      onClick={() => void chooseOutputFolder()}
                      disabled={busy}
                      title={outputFolder || t('extract.destinationHint')}
                    >
                      <FolderOutput size={20} aria-hidden="true" />
                      <span className="destination-label">{t('extract.saveTo')}</span>
                      <span className="destination-value">{outputFolder || t('extract.besideArchive')}</span>
                    </button>
                    {outputFolder && (
                      <button className="icon-button small" type="button" onClick={resetOutputFolder} disabled={busy} aria-label={t('extract.resetDestination')} title={t('extract.resetDestination')}>
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <button
                    className={`secondary-button mode-button ${smartExtract ? 'active' : ''}`}
                    type="button"
                    onClick={toggleSmart}
                    disabled={busy}
                    title={t('extract.smartHint')}
                  >
                    <Wand2 size={20} aria-hidden="true" />
                    {t('extract.smart')}
                    <span className={`mode-state ${smartExtract ? 'on' : 'off'}`}>{smartExtract ? t('common.on') : t('common.off')}</span>
                  </button>
                  <button
                    className={`secondary-button mode-button ${useMainFolder ? 'active' : ''}`}
                    type="button"
                    onClick={toggleMainFolder}
                    disabled={busy}
                    title={t('extract.mainFolderHint')}
                  >
                    <FolderArchive size={20} aria-hidden="true" />
                    {t('extract.mainFolder')}
                    <span className={`mode-state ${useMainFolder ? 'on' : 'off'}`}>{useMainFolder ? t('common.on') : t('common.off')}</span>
                  </button>
                  <button
                    className={`secondary-button mode-button ${newMainFolder ? 'active' : ''}`}
                    type="button"
                    onClick={toggleNewMainFolder}
                    disabled={busy || !useMainFolder}
                    title={t('extract.newMainHint')}
                  >
                    <FolderArchive size={20} aria-hidden="true" />
                    {t('extract.newMain')}
                    <span className={`mode-state ${newMainFolder ? 'on' : 'off'}`}>{newMainFolder ? t('common.on') : t('common.off')}</span>
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    data-action="extract-all"
                    onClick={extractAll}
                    disabled={busy || selectedReadyIds.length === 0}
                  >
                    <Play size={19} aria-hidden="true" />
                    {t('extract.extractAll')}
                  </button>
                  <button className="secondary-button" type="button" onClick={openCurrentFolder} disabled={!folderPath || isExtracting}>
                    <FolderOpen size={20} aria-hidden="true" />
                    {t('extract.openFolder')}
                  </button>
                  <button className="secondary-button clear-all-action" type="button" onClick={clearAll} disabled={isExtracting}>
                    <Trash2 size={20} aria-hidden="true" />
                    {t('extract.clearAll')}
                  </button>
                </div>
              </section>

              <section className="table-panel" aria-label={t('extract.tableLabel')}>
                <div className="archive-table header-row" role="row">
                  <span />
                  <span>{t('extract.colArchive')}</span>
                  <span>{t('extract.colTarget')}</span>
                  <span>{t('extract.colStatus')}</span>
                  <span>{t('extract.colProgress')}</span>
                  <span>{t('extract.colSize')}</span>
                </div>

                <div className="table-body">
                  {archives.length === 0 ? (
                    <div className="empty-state">
                      <Sparkles size={34} />
                      <strong>{t('extract.emptyTitle')}</strong>
                      <span>{t('extract.emptyHint')}</span>
                    </div>
                  ) : (
                    archives.map((archive) => (
                      <div className={`archive-table data-row status-${archive.status}`} role="row" key={archive.id}>
                        <button
                          className={`check-button ${archive.selected ? 'checked' : ''}`}
                          type="button"
                          onClick={() => toggleArchive(archive.id)}
                          disabled={archive.status === 'done' || archive.status === 'skipped' || isExtracting}
                          aria-label={t(archive.selected ? 'extract.deselect' : 'extract.select', { name: archive.fileName })}
                        >
                          {archive.selected ? <Check size={17} /> : <Square size={17} />}
                        </button>
                        <div className="archive-name">
                          <span className={`format-icon format-${archive.format.replace('.', '-')}`}>{archive.format.toUpperCase()}</span>
                          <span title={archive.archivePath}>{archive.fileName}</span>
                        </div>
                        <span className="target-name" title={archive.targetPath}>
                          {archive.targetFolder}
                        </span>
                        <span className="status-pill" title={archive.message || t(STATUS_KEYS[archive.status])}>
                          {statusIcon(archive.status)}
                          {t(STATUS_KEYS[archive.status])}
                        </span>
                        <span className="progress-cell">
                          <span className="progress-track">
                            <span className="progress-fill" style={{ width: `${archive.progress}%` }} />
                          </span>
                          <span>{archive.progress}%</span>
                        </span>
                        <span>{formatBytes(archive.size)}</span>
                        {archive.status === 'awaiting-password' && (
                          <form className="password-row" onSubmit={(event) => { event.preventDefault(); void submitPassword(archive.id); }}>
                            <label htmlFor={`password-${archive.id}`}>{t('password.label')}</label>
                            <input
                              id={`password-${archive.id}`}
                              type="password"
                              value={passwordDrafts[archive.id] || ''}
                              onChange={(event) => setPasswordDrafts((current) => ({ ...current, [archive.id]: event.target.value }))}
                              placeholder={t('password.placeholder')}
                              autoComplete="off"
                              aria-label={t('password.for', { name: archive.fileName })}
                            />
                            <button type="submit" disabled={!passwordDrafts[archive.id]}>{t('password.continue')}</button>
                            <button type="button" onClick={() => void skipWaitingArchive(archive.id)}>{t('password.skip')}</button>
                            <span role="status">{archive.message}</span>
                          </form>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="summary-strip" aria-label={t('summary.label')}>
                <SummaryItem icon={Archive} label={t('summary.total')} value={stats.total} />
                <SummaryItem icon={Check} label={t('summary.selected')} value={stats.selected} />
                <SummaryItem icon={Clock3} label={t('summary.queued')} value={stats.queued} />
                <SummaryItem icon={LoaderCircle} label={t('summary.extracting')} value={stats.extracting} accent="cyan" />
                <SummaryItem icon={LockKeyhole} label={t('summary.waiting')} value={stats['awaiting-password']} accent="amber" />
                <SummaryItem icon={CheckCircle2} label={t('summary.done')} value={stats.done} accent="green" />
                <SummaryItem icon={CircleDashed} label={t('summary.skipped')} value={stats.skipped} accent="amber" />
                <SummaryItem icon={CircleAlert} label={t('summary.error')} value={stats.error} accent="red" />
                <SummaryItem icon={HardDrive} label={t('summary.totalSize')} value={formatBytes(stats.totalSize)} />
              </section>
            </>
          )}
          {/* Views stay mounted so switching tabs keeps their work. */}
          <div hidden={tab !== 'compress'} className="view-pane"><CompressView request={compressRequest} addLog={addLog} formats={appInfo?.createFormats ?? []} /></div>
          <div hidden={tab !== 'browse'} className="view-pane"><BrowseView request={browseRequest} addLog={addLog} /></div>
          <div hidden={tab !== 'tools'} className="view-pane"><ToolsView request={toolsRequest} addLog={addLog} algorithms={appInfo?.hashAlgorithms ?? []} /></div>
          <div hidden={tab !== 'recover'} className="view-pane"><RecoverView addLog={addLog} /></div>
        </div>

        <section className="activity-panel" aria-label={t('activity.title')}>
          <div className="activity-header">
            <h2>{t('activity.title')}</h2>
            <button className="clear-button" type="button" onClick={() => setLogs([])}>
              <Trash2 size={16} />
              {t('activity.clear')}
            </button>
          </div>
          <div className="log-list">
            {logs.map((entry) => (
              <div className={`log-line log-${entry.level}`} key={entry.id}>
                <span>[{entry.time}]</span>
                <span>{logGlyph(entry.level)}</span>
                <p>{entry.message}</p>
              </div>
            ))}
          </div>
        </section>
      </section>
      {isDragging && (
        <div className="drop-overlay" aria-hidden="true">
          <PackagePlus size={64} />
          <strong>{t(`drop.${tab}`)}</strong>
        </div>
      )}
      {isPickerOpen && <ArchivePicker initialFolderPath={folderPath} onChoose={async (paths) => { await chooseArchiveFiles(paths); }} onClose={() => setIsPickerOpen(false)} />}
      {isSettingsOpen && (
        <SettingsDialog
          settings={settings}
          appInfo={appInfo}
          onChange={onSettingsChange}
          onClose={() => setIsSettingsOpen(false)}
          addLog={addLog}
        />
      )}
    </main>
  );
}

interface SummaryItemProps {
  icon: typeof Archive;
  label: string;
  value: string | number;
  accent?: 'cyan' | 'green' | 'amber' | 'red';
}

function SummaryItem({ icon: Icon, label, value, accent = 'cyan' }: SummaryItemProps) {
  return (
    <div className={`summary-item accent-${accent}`}>
      <span className="summary-icon">
        <Icon size={22} aria-hidden="true" />
      </span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
