import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, File, FilePlus2, Folder, FolderOpen, FolderPlus, LoaderCircle, PackagePlus, Trash2, X } from 'lucide-react';
import { useT } from './i18n';
import { formatBytes, type AddLog } from './App';
import type { PathInfo } from './types';

export interface CompressRequest {
  sources: string[];
  format?: string;
  autoStart?: boolean;
  append?: boolean;
  nonce: number;
}

interface Props {
  request: CompressRequest | null;
  addLog: AddLog;
  formats: string[];
}

const LEVELS = [0, 1, 3, 5, 7, 9];
const SPLIT_PRESETS = [0, 100, 700, 1024, 4092];

function parentFolder(filePath: string) {
  const index = filePath.replace(/[\\/]+$/, '').search(/[\\/][^\\/]*$/);
  return index > 0 ? filePath.slice(0, index) : filePath;
}

function suggestedName(items: PathInfo[]) {
  if (items.length === 1) {
    const name = items[0].name;
    return items[0].isDirectory ? name : name.replace(/\.[^.]+$/, '') || name;
  }
  const folder = parentFolder(items[0]?.path ?? '');
  return folder.split(/[\\/]/).filter(Boolean).pop()?.replace(':', '') || 'Archive';
}

export default function CompressView({ request, addLog, formats }: Props) {
  const t = useT();
  const [sources, setSources] = useState<PathInfo[]>([]);
  const [archiveName, setArchiveName] = useState('');
  const [outputFolder, setOutputFolder] = useState('');
  const [format, setFormat] = useState('7z');
  const [level, setLevel] = useState(5);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [encryptNames, setEncryptNames] = useState(true);
  const [splitMb, setSplitMb] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState('');
  const autoStart = useRef(false);

  const supportsPassword = format === '7z' || format === 'zip';

  useEffect(() => window.quickExtract.onTaskProgress((event) => {
    if (event.task === 'compress') setProgress(event.progress);
  }), []);

  const addPaths = async (paths: string[], replace = false) => {
    const items = await window.quickExtract.statPaths(paths);
    if (!items.length) return [];
    let merged: PathInfo[] = [];
    setSources((current) => {
      const base = replace ? [] : current;
      merged = [...base, ...items.filter((item) => !base.some((existing) => existing.path.toLowerCase() === item.path.toLowerCase()))];
      return merged;
    });
    if (replace || !archiveName) setArchiveName(suggestedName(items));
    if (replace || !outputFolder) setOutputFolder(parentFolder(items[0].path));
    setResult(null);
    setError('');
    return items;
  };

  useEffect(() => {
    if (!request) return;
    void (async () => {
      const items = await addPaths(request.sources, !request.append);
      if (request.format) setFormat(request.format);
      if (request.autoStart && items.length) autoStart.current = true;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.nonce]);

  // Quick "Add to ZIP/7Z" from Explorer starts as soon as the fields are filled in.
  useEffect(() => {
    if (autoStart.current && sources.length && archiveName && outputFolder) {
      autoStart.current = false;
      void create();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, archiveName, outputFolder, format]);

  const pick = async (folders: boolean) => {
    const paths = await window.quickExtract.selectPaths({ folders });
    if (paths.length) await addPaths(paths);
  };

  const chooseOutput = async () => {
    const folder = await window.quickExtract.selectFolder();
    if (folder) setOutputFolder(folder);
  };

  const create = async () => {
    if (!sources.length || busy) return;
    setBusy(true);
    setProgress(0);
    setResult(null);
    setError('');
    const response = await window.quickExtract.createArchive({
      sources: sources.map((item) => item.path),
      outputFolder,
      archiveName,
      format,
      level,
      password: supportsPassword ? password : '',
      encryptNames: format === '7z' && encryptNames,
      volumeSizeMb: splitMb
    });
    setBusy(false);
    if (response.ok) {
      setProgress(100);
      setResult(response.value.outputPath);
    } else {
      const message = response.code === 'ZIP_PASSWORD_ASCII' ? t('compress.zipAsciiOnly') : response.message;
      setError(message);
      addLog('error', t('compress.failed', { message }));
    }
  };

  const totalSize = sources.reduce((sum, item) => sum + item.size, 0);

  return (
    <div className="tool-layout compress-view">
      <section className="tool-panel source-list-panel" aria-label={t('compress.sources')}>
        <div className="panel-header">
          <h2>{t('compress.sources')}</h2>
          <div className="panel-actions">
            <button className="secondary-button compact" type="button" onClick={() => void pick(false)} disabled={busy}><FilePlus2 size={18} />{t('compress.addFiles')}</button>
            <button className="secondary-button compact" type="button" onClick={() => void pick(true)} disabled={busy}><FolderPlus size={18} />{t('compress.addFolder')}</button>
            <button className="secondary-button compact" type="button" onClick={() => setSources([])} disabled={busy || !sources.length}><Trash2 size={18} />{t('compress.clear')}</button>
          </div>
        </div>
        <div className="source-list">
          {sources.length === 0 ? (
            <div className="empty-state small">
              <PackagePlus size={34} />
              <strong>{t('compress.emptyTitle')}</strong>
              <span>{t('compress.emptyHint')}</span>
            </div>
          ) : sources.map((item) => (
            <div className="source-row" key={item.path}>
              {item.isDirectory ? <Folder size={18} className="folder-glyph" /> : <File size={18} />}
              <span title={item.path}>{item.path}</span>
              <span className="muted">{item.isDirectory ? t('compress.folder') : formatBytes(item.size)}</span>
              <button type="button" className="row-remove" onClick={() => setSources((current) => current.filter((entry) => entry.path !== item.path))} disabled={busy} aria-label={t('compress.remove', { name: item.name })}><X size={16} /></button>
            </div>
          ))}
        </div>
        <footer className="panel-footer muted">{t('compress.summary', { count: sources.length, size: formatBytes(totalSize) })}</footer>
      </section>

      <section className="tool-panel options-panel" aria-label={t('compress.options')}>
        <h2>{t('compress.options')}</h2>
        <label className="field">
          <span>{t('compress.name')}</span>
          <input value={archiveName} onChange={(event) => setArchiveName(event.target.value)} disabled={busy} />
        </label>
        <label className="field">
          <span>{t('compress.output')}</span>
          <div className="field-row">
            <input value={outputFolder} onChange={(event) => setOutputFolder(event.target.value)} disabled={busy} />
            <button className="secondary-button compact" type="button" onClick={() => void chooseOutput()} disabled={busy}><FolderOpen size={18} />{t('common.browse')}</button>
          </div>
        </label>
        <div className="field-grid">
          <label className="field">
            <span>{t('compress.format')}</span>
            <select value={format} onChange={(event) => setFormat(event.target.value)} disabled={busy}>
              {(formats.length ? formats : ['7z', 'zip']).map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{t('compress.level')}</span>
            <select value={level} onChange={(event) => setLevel(Number(event.target.value))} disabled={busy}>
              {LEVELS.map((value) => <option key={value} value={value}>{t(`compress.level${value}`)}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{t('compress.split')}</span>
            <select value={splitMb} onChange={(event) => setSplitMb(Number(event.target.value))} disabled={busy}>
              {SPLIT_PRESETS.map((value) => <option key={value} value={value}>{value === 0 ? t('compress.noSplit') : t('compress.splitSize', { size: value >= 1024 ? `${(value / 1024).toFixed(value % 1024 ? 2 : 0)} GB` : `${value} MB` })}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          <span>{t('compress.password')}</span>
          <div className="field-row">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy || !supportsPassword}
              placeholder={supportsPassword ? t('compress.passwordPlaceholder') : t('compress.passwordUnsupported')}
              autoComplete="new-password"
            />
            <button className="icon-button small" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={t(showPassword ? 'compress.hidePassword' : 'compress.showPassword')}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>
        <label className={`check-field ${format !== '7z' || !password ? 'disabled' : ''}`}>
          <input type="checkbox" checked={encryptNames} onChange={(event) => setEncryptNames(event.target.checked)} disabled={busy || format !== '7z' || !password} />
          <span>{t('compress.encryptNames')}</span>
        </label>
        {format === 'zip' && password && <p className="hint">{t('compress.zipAesHint')}</p>}
        <button className="primary-button wide" type="button" data-action="create-archive" onClick={() => void create()} disabled={busy || !sources.length || !archiveName || !outputFolder}>
          {busy ? <LoaderCircle size={19} className="spin" /> : <PackagePlus size={19} />}
          {busy ? t('compress.creating') : t('compress.create')}
        </button>
        {(busy || result) && (
          <div className="progress-cell wide">
            <span className="progress-track"><span className="progress-fill" style={{ width: `${progress}%` }} /></span>
            <span>{progress}%</span>
          </div>
        )}
        {result && (
          <div className="result-box" role="status">
            <strong>{t('compress.done')}</strong>
            <span title={result}>{result}</span>
            <button className="secondary-button compact" type="button" onClick={() => void window.quickExtract.showItemInFolder(result)}><FolderOpen size={18} />{t('common.showInFolder')}</button>
          </div>
        )}
        {error && <p className="picker-error" role="alert">{error}</p>}
      </section>
    </div>
  );
}
