import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUp,
  Check,
  File,
  Folder,
  FolderOpen,
  FolderSearch,
  LoaderCircle,
  LockKeyhole,
  Search,
  ShieldCheck,
  Square,
  Download
} from 'lucide-react';
import { useT } from './i18n';
import { formatBytes, type AddLog } from './App';
import type { ArchiveListing } from './types';

export interface BrowseRequest {
  archivePath: string;
  nonce: number;
}

interface Props {
  request: BrowseRequest | null;
  addLog: AddLog;
}

interface Row {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  packedSize: number;
  modified: string;
  encrypted: boolean;
}

type PendingAction = { kind: 'list' } | { kind: 'extract'; entries: string[] } | { kind: 'test' };

export default function BrowseView({ request, addLog }: Props) {
  const t = useT();
  const [archivePath, setArchivePath] = useState('');
  const [listing, setListing] = useState<ArchiveListing | null>(null);
  const [currentDir, setCurrentDir] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [passwordDraft, setPasswordDraft] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [testState, setTestState] = useState<'ok' | 'failed' | null>(null);
  const [lastOutput, setLastOutput] = useState('');
  const [pendingDestination, setPendingDestination] = useState('');

  useEffect(() => window.quickExtract.onTaskProgress((event) => {
    if (event.task === 'browse' || event.task === 'test') setProgress(event.progress);
  }), []);

  const needPassword = (action: PendingAction, code: string) => {
    setPending(action);
    setPasswordMessage(t(code === 'PASSWORD_INCORRECT' ? 'browse.passwordWrong' : 'browse.passwordNeeded'));
  };

  const load = async (target: string, secret = '') => {
    setBusy(true);
    setError('');
    setTestState(null);
    setLastOutput('');
    const response = await window.quickExtract.listArchive(target, secret);
    setBusy(false);
    setArchivePath(target);
    if (response.ok) {
      setListing(response.value);
      setPassword(secret);
      setPending(null);
      setCurrentDir('');
      setSelected([]);
      setQuery('');
    } else if (response.code.startsWith('PASSWORD')) {
      setListing(null);
      needPassword({ kind: 'list' }, response.code);
    } else {
      setListing(null);
      setError(response.message);
      addLog('error', t('browse.openFailed', { message: response.message }));
    }
  };

  useEffect(() => {
    if (request) {
      setPassword('');
      void load(request.archivePath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.nonce]);

  const openArchive = async () => {
    const [picked] = await window.quickExtract.selectPaths({ archives: true });
    if (picked) {
      setPassword('');
      await load(picked);
    }
  };

  const rows = useMemo<Row[]>(() => {
    if (!listing) return [];
    const needle = query.trim().toLowerCase();
    if (needle) {
      return listing.entries
        .filter((entry) => entry.path.toLowerCase().includes(needle))
        .map((entry) => ({ ...entry, name: entry.path }));
    }
    const prefix = currentDir ? `${currentDir}/` : '';
    const map = new Map<string, Row>();
    for (const entry of listing.entries) {
      if (!entry.path.startsWith(prefix) || entry.path === currentDir) continue;
      const rest = entry.path.slice(prefix.length);
      const [head] = rest.split('/');
      const childPath = prefix + head;
      const isNested = rest.includes('/');
      const existing = map.get(childPath);
      if (!existing) {
        map.set(childPath, {
          name: head,
          path: childPath,
          isDirectory: isNested || entry.isDirectory,
          size: entry.isDirectory ? 0 : entry.size,
          packedSize: entry.packedSize,
          modified: isNested ? '' : entry.modified,
          encrypted: entry.encrypted
        });
      } else {
        existing.isDirectory ||= isNested || entry.isDirectory;
        if (!entry.isDirectory) existing.size += entry.size;
        existing.packedSize += entry.packedSize;
        existing.encrypted ||= entry.encrypted;
        if (!isNested && entry.modified) existing.modified = entry.modified;
      }
    }
    return [...map.values()].sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));
  }, [listing, currentDir, query]);

  const expandSelection = (paths: string[]) => {
    if (!listing) return [];
    const result = new Set<string>();
    for (const item of paths) {
      for (const entry of listing.entries) {
        if (entry.path === item || entry.path.startsWith(`${item}/`)) result.add(entry.path);
      }
    }
    return [...result];
  };

  const extract = async (entries: string[], secret = password) => {
    const destination = await window.quickExtract.selectFolder();
    if (!destination) return;
    await runExtract(entries, destination, secret);
  };

  const runExtract = async (entries: string[], destination: string, secret: string) => {
    setBusy(true);
    setProgress(0);
    setError('');
    const response = await window.quickExtract.extractEntries(archivePath, entries, destination, secret);
    setBusy(false);
    if (response.ok) {
      setPassword(secret);
      setPending(null);
      setLastOutput(response.value);
    } else if (response.code.startsWith('PASSWORD')) {
      setPendingDestination(destination);
      needPassword({ kind: 'extract', entries }, response.code);
    } else {
      setError(response.message);
      addLog('error', t('browse.extractFailed', { message: response.message }));
    }
  };
  const test = async (secret = password) => {
    setBusy(true);
    setProgress(0);
    setError('');
    setTestState(null);
    const response = await window.quickExtract.testArchive(archivePath, secret);
    setBusy(false);
    if (response.ok) {
      setPassword(secret);
      setPending(null);
      setTestState('ok');
    } else if (response.code.startsWith('PASSWORD')) {
      needPassword({ kind: 'test' }, response.code);
    } else {
      setTestState('failed');
      setError(response.message);
      addLog('error', t('browse.testFailed', { name: listing?.fileName ?? archivePath, message: response.message }));
    }
  };

  const submitPassword = async () => {
    if (!pending || !passwordDraft) return;
    const secret = passwordDraft;
    setPasswordDraft('');
    if (pending.kind === 'list') await load(archivePath, secret);
    else if (pending.kind === 'extract') await runExtract(pending.entries, pendingDestination, secret);
    else await test(secret);
  };

  const toggle = (rowPath: string) => setSelected((current) =>
    current.includes(rowPath) ? current.filter((item) => item !== rowPath) : [...current, rowPath]);

  const crumbs = currentDir ? currentDir.split('/') : [];
  const totalSize = listing?.entries.reduce((sum, entry) => sum + entry.size, 0) ?? 0;
  const fileCount = listing?.entries.filter((entry) => !entry.isDirectory).length ?? 0;

  return (
    <div className="browse-view">
      <section className="tool-panel browse-header">
        <div className="browse-title">
          <FolderSearch size={26} className="accent-icon" />
          <div>
            <h2>{listing?.fileName || t('browse.title')}</h2>
            <span className="muted">
              {listing
                ? t('browse.info', { type: listing.info.type, files: fileCount, size: formatBytes(totalSize), packed: formatBytes(listing.size) })
                : t('browse.hint')}
              {listing?.info.solid ? ` · ${t('browse.solid')}` : ''}
              {listing?.info.method ? ` · ${listing.info.method}` : ''}
            </span>
          </div>
        </div>
        <div className="panel-actions">
          <button className="secondary-button compact" type="button" onClick={() => void openArchive()} disabled={busy}><FolderOpen size={18} />{t('browse.open')}</button>
          <button className="secondary-button compact" type="button" onClick={() => void test()} disabled={busy || !listing}><ShieldCheck size={18} />{t('browse.test')}</button>
          <button className="secondary-button compact" type="button" onClick={() => void extract(expandSelection(selected))} disabled={busy || !listing || !selected.length}><Download size={18} />{t('browse.extractSelected', { count: selected.length })}</button>
          <button className="primary-button compact" type="button" onClick={() => void extract([])} disabled={busy || !listing}><Download size={18} />{t('browse.extractAll')}</button>
        </div>
      </section>

      {pending && (
        <form className="tool-panel password-row standalone" onSubmit={(event) => { event.preventDefault(); void submitPassword(); }}>
          <LockKeyhole size={18} />
          <label htmlFor="browse-password">{t('password.label')}</label>
          <input id="browse-password" type="password" value={passwordDraft} onChange={(event) => setPasswordDraft(event.target.value)} placeholder={t('password.placeholder')} autoComplete="off" autoFocus />
          <button type="submit" disabled={!passwordDraft}>{t('password.continue')}</button>
          <button type="button" onClick={() => { setPending(null); setPasswordDraft(''); }}>{t('common.cancel')}</button>
          <span role="status">{passwordMessage}</span>
        </form>
      )}

      {(busy || testState || lastOutput || error) && (
        <div className={`tool-panel status-banner ${testState === 'failed' || error ? 'bad' : 'good'}`} role="status">
          {busy && <><LoaderCircle size={18} className="spin" /><span>{t('browse.working')}</span>
            <span className="progress-track"><span className="progress-fill" style={{ width: `${progress}%` }} /></span><span>{progress}%</span></>}
          {!busy && testState === 'ok' && <><ShieldCheck size={18} /><span>{t('browse.testOk')}</span></>}
          {!busy && lastOutput && <><Check size={18} /><span title={lastOutput}>{t('browse.extracted', { path: lastOutput })}</span>
            <button className="secondary-button compact" type="button" onClick={() => void window.quickExtract.showItemInFolder(lastOutput)}><FolderOpen size={16} />{t('common.showInFolder')}</button></>}
          {!busy && error && <span className="error-text">{error}</span>}
        </div>
      )}

      <section className="tool-panel browse-table-panel">
        <div className="browse-toolbar">
          <button className="icon-button small" type="button" disabled={!currentDir || Boolean(query)} onClick={() => setCurrentDir(crumbs.slice(0, -1).join('/'))} aria-label={t('browse.up')}><ArrowUp size={18} /></button>
          <nav className="crumbs" aria-label={t('browse.location')}>
            <button type="button" onClick={() => setCurrentDir('')}>{listing?.fileName || '—'}</button>
            {crumbs.map((part, index) => (
              <span key={index}>/ <button type="button" onClick={() => setCurrentDir(crumbs.slice(0, index + 1).join('/'))}>{part}</button></span>
            ))}
          </nav>
          <label className="search-box">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('browse.search')} disabled={!listing} />
          </label>
        </div>
        <div className="browse-table header-row">
          <span />
          <span>{t('browse.colName')}</span>
          <span>{t('browse.colSize')}</span>
          <span>{t('browse.colPacked')}</span>
          <span>{t('browse.colModified')}</span>
        </div>
        <div className="table-body">
          {!listing && !busy && (
            <div className="empty-state">
              <FolderSearch size={34} />
              <strong>{t('browse.emptyTitle')}</strong>
              <span>{t('browse.emptyHint')}</span>
            </div>
          )}
          {rows.map((row) => (
            <div
              key={row.path}
              className={`browse-table data-row ${selected.includes(row.path) ? 'row-selected' : ''}`}
              onDoubleClick={() => { if (row.isDirectory && !query) setCurrentDir(row.path); }}
            >
              <button className={`check-button ${selected.includes(row.path) ? 'checked' : ''}`} type="button" onClick={() => toggle(row.path)} aria-label={t(selected.includes(row.path) ? 'extract.deselect' : 'extract.select', { name: row.name })}>
                {selected.includes(row.path) ? <Check size={17} /> : <Square size={17} />}
              </button>
              <span className="entry-name" title={row.path}>
                {row.isDirectory ? <Folder size={18} className="folder-glyph" /> : <File size={18} />}
                {row.isDirectory && !query
                  ? <button type="button" className="link-button" onClick={() => setCurrentDir(row.path)}>{row.name}</button>
                  : <span>{row.name}</span>}
                {row.encrypted && <LockKeyhole size={14} className="lock-glyph" aria-label={t('browse.encrypted')} />}
              </span>
              <span>{formatBytes(row.size)}</span>
              <span className="muted">{formatBytes(row.packedSize)}</span>
              <span className="muted">{row.modified.replace(/\.\d+$/, '')}</span>
            </div>
          ))}
        </div>
      </section>
      {listing && <p className="muted footnote">{t('browse.destinationHint')}</p>}
    </div>
  );
}
