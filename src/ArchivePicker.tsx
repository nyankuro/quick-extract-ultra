import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Archive, ArrowUp, Check, Folder, FolderOpen, RefreshCw, X } from 'lucide-react';
import type { BrowserEntry, BrowserFolder } from './types';
import { useT } from './i18n';

interface Props {
  initialFolderPath: string;
  onChoose: (paths: string[]) => Promise<void>;
  onClose: () => void;
}

export default function ArchivePicker({ initialFolderPath, onChoose, onClose }: Props) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const requestId = useRef(0);
  const anchor = useRef<string | null>(null);
  const [folder, setFolder] = useState<BrowserFolder | null>(null);
  const [pathDraft, setPathDraft] = useState(initialFolderPath);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const navigate = useCallback(async (path?: string) => {
    const currentRequest = ++requestId.current;
    setBusy(true);
    setError('');
    try {
      const next = await window.quickExtract.browseArchives(path);
      if (currentRequest !== requestId.current) return;
      setFolder(next);
      setPathDraft(next.folderPath);
      setSelected([]);
      anchor.current = null;
    } catch (cause) {
      if (currentRequest === requestId.current) setError(cause instanceof Error ? cause.message : t('picker.openFailed'));
    } finally {
      if (currentRequest === requestId.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    dialog.current?.showModal();
    void navigate(initialFolderPath || undefined);
    return () => { requestId.current += 1; dialog.current?.close(); };
  }, [initialFolderPath, navigate]);

  const select = (entry: BrowserEntry, event: MouseEvent<HTMLButtonElement>) => {
    if (entry.isDirectory) return;
    const additive = event.ctrlKey || event.metaKey;
    if (event.shiftKey && anchor.current && folder) {
      const files = folder.entries.filter((item) => !item.isDirectory);
      const start = files.findIndex((item) => item.path === anchor.current);
      const end = files.findIndex((item) => item.path === entry.path);
      const range = files.slice(Math.min(start, end), Math.max(start, end) + 1).map((item) => item.path);
      setSelected((current) => additive ? [...new Set([...current, ...range])] : range);
    } else {
      setSelected((current) => additive
        ? current.includes(entry.path) ? current.filter((item) => item !== entry.path) : [...current, entry.path]
        : [entry.path]);
      anchor.current = entry.path;
    }
  };

  const choose = async (paths = selected) => {
    if (!paths.length || busy) return;
    setBusy(true);
    setError('');
    try { await onChoose(paths); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('picker.selectFailed')); }
    finally { setBusy(false); }
  };

  return (
    <dialog className="archive-picker" ref={dialog} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <header className="picker-header">
        <div><h2>{t('picker.title')}</h2><span>{t('picker.subtitle')}</span></div>
        <button type="button" onClick={onClose} disabled={busy} aria-label={t('common.close')}><X /></button>
      </header>
      <form className="picker-navigation" onSubmit={(event) => { event.preventDefault(); void navigate(pathDraft); }}>
        <button type="button" disabled={busy || !folder?.parentPath} onClick={() => void navigate(folder!.parentPath!)} aria-label={t('picker.parent')}><ArrowUp /></button>
        <input aria-label={t('picker.path')} value={pathDraft} onChange={(event) => setPathDraft(event.target.value)} disabled={busy} />
        <button type="submit" disabled={busy}>{t('picker.go')}</button>
        <button type="button" disabled={busy} onClick={() => void navigate(folder?.folderPath)} aria-label={t('picker.refresh')}><RefreshCw size={20} /></button>
        <button type="button" disabled={busy} onClick={async () => {
          try { const path = await window.quickExtract.selectFolder(); if (path) await navigate(path); }
          catch (cause) { setError(cause instanceof Error ? cause.message : t('picker.selectFailed')); }
        }}><FolderOpen size={20} />{t('picker.browseFolder')}</button>
      </form>
      {error && <p className="picker-error" role="alert">{error}</p>}
      <div className="picker-grid" aria-label={t('picker.gridLabel')} aria-busy={busy}>
        {busy && <p className="picker-empty" role="status">{t('common.loading')}</p>}
        {!busy && folder?.entries.map((entry) => (
          <button
            className={`picker-tile ${selected.includes(entry.path) ? 'selected' : ''}`}
            key={entry.path}
            type="button"
            title={entry.name}
            aria-pressed={entry.isDirectory ? undefined : selected.includes(entry.path)}
            onClick={(event) => select(entry, event)}
            onDoubleClick={() => entry.isDirectory ? void navigate(entry.path) : void choose([entry.path])}
            onKeyDown={(event) => { if (entry.isDirectory && event.key === 'Enter') { event.preventDefault(); void navigate(entry.path); } }}
          >
            {selected.includes(entry.path) && <Check className="picker-check" size={22} />}
            {entry.isDirectory ? <Folder className="picker-file-icon folder-icon" size={144} strokeWidth={1.2} /> : <Archive className="picker-file-icon" size={144} strokeWidth={1.2} />}
            <strong>{entry.name}</strong>
            <span>{new Date(entry.modifiedAt).toLocaleString()}</span>
          </button>
        ))}
        {!busy && folder && !folder.entries.length && <p className="picker-empty">{t('picker.empty')}</p>}
      </div>
      <footer className="picker-footer">
        <span>{t('picker.footer', { count: selected.length })}</span>
        <button type="button" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
        <button className="picker-select" type="button" disabled={busy || !selected.length} onClick={() => void choose()}>{t('picker.select')}</button>
      </footer>
    </dialog>
  );
}
