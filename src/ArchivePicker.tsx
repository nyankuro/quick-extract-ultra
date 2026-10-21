import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Folder,
  FolderOpen,
  Grid2x2,
  Grid3x3,
  LayoutGrid,
  LayoutList,
  List,
  RefreshCw,
  Rows3,
  Square,
  X
} from 'lucide-react';
import type { BrowserEntry, BrowserFolder } from './types';
import { useT } from './i18n';
import { formatBytes } from './App';

interface Props {
  initialFolderPath: string;
  onChoose: (paths: string[]) => Promise<void>;
  onClose: () => void;
}

// Mirrors the layouts in Windows Explorer's View menu.
export type PickerView = 'xl' | 'large' | 'medium' | 'small' | 'list' | 'details' | 'tiles';
type SortKey = 'name' | 'modified' | 'type' | 'size';

const VIEWS: { id: PickerView; icon: typeof Grid2x2; iconSize: number }[] = [
  { id: 'xl', icon: Square, iconSize: 144 },
  { id: 'large', icon: Grid2x2, iconSize: 96 },
  { id: 'medium', icon: LayoutGrid, iconSize: 60 },
  { id: 'small', icon: Grid3x3, iconSize: 20 },
  { id: 'list', icon: List, iconSize: 18 },
  { id: 'details', icon: Rows3, iconSize: 18 },
  { id: 'tiles', icon: LayoutList, iconSize: 44 }
];
const VIEW_KEY = 'quickExtract.pickerView';
const SORT_KEY = 'quickExtract.pickerSort';

function readStored<T>(key: string, fallback: T, valid: (value: unknown) => boolean): T {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null');
    return valid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* preference only */ }
}

function typeOf(entry: BrowserEntry) {
  if (entry.isDirectory) return '';
  const lower = entry.name.toLowerCase();
  const compound = /\.tar\.(gz|bz2|xz|zst|lz)$/.exec(lower);
  return (compound ? `tar.${compound[1]}` : lower.split('.').pop() ?? '').toUpperCase();
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
  const [view, setView] = useState<PickerView>(() => readStored(VIEW_KEY, 'xl', (value) => VIEWS.some((item) => item.id === value)));
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>(() =>
    readStored(SORT_KEY, { key: 'modified', descending: true }, (value) =>
      Boolean(value) && ['name', 'modified', 'type', 'size'].includes((value as { key: string }).key)));
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
  }, [t]);

  useEffect(() => {
    dialog.current?.showModal();
    void navigate(initialFolderPath || undefined);
    return () => { requestId.current += 1; dialog.current?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFolderPath]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: globalThis.MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  // Folders and archives sort together, so the newest item is always first by default.
  const entries = useMemo(() => {
    const list = [...(folder?.entries ?? [])];
    const direction = sort.descending ? -1 : 1;
    const compare = (a: BrowserEntry, b: BrowserEntry) => {
      if (sort.key === 'name') return a.name.localeCompare(b.name, undefined, { numeric: true });
      if (sort.key === 'size') return a.size - b.size;
      if (sort.key === 'type') return typeOf(a).localeCompare(typeOf(b));
      return a.modifiedAt - b.modifiedAt;
    };
    return list.sort((a, b) => direction * compare(a, b) || a.name.localeCompare(b.name));
  }, [folder, sort]);

  const chooseView = (next: PickerView) => {
    setView(next);
    store(VIEW_KEY, next);
    setMenuOpen(false);
  };

  const sortBy = (key: SortKey) => {
    const next = { key, descending: sort.key === key ? !sort.descending : key === 'modified' || key === 'size' };
    setSort(next);
    store(SORT_KEY, next);
  };

  const select = (entry: BrowserEntry, event: MouseEvent<HTMLButtonElement>) => {
    if (entry.isDirectory) return;
    const additive = event.ctrlKey || event.metaKey;
    if (event.shiftKey && anchor.current) {
      const files = entries.filter((item) => !item.isDirectory);
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

  const current = VIEWS.find((item) => item.id === view) ?? VIEWS[0];
  const CurrentIcon = current.icon;
  const sortLabel = t(`picker.sort.${sort.key}`);
  const header = (key: SortKey) => (
    <button type="button" className="picker-column" onClick={() => sortBy(key)} aria-sort={sort.key === key ? (sort.descending ? 'descending' : 'ascending') : undefined}>
      {t(`picker.sort.${key}`)}
      {sort.key === key && (sort.descending ? <ArrowDown size={14} /> : <ArrowUp size={14} />)}
    </button>
  );

  return (
    <dialog className="archive-picker" ref={dialog} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <header className="picker-header">
        <div><h2>{t('picker.title')}</h2><span>{t(`picker.view.${view}`)} · {t('picker.sortedBy', { column: sortLabel })}</span></div>
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
        <div className="picker-view-menu" ref={menuRef}>
          <button type="button" data-action="picker-view" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            <CurrentIcon size={18} />{t('picker.viewButton')}<ChevronDown size={16} />
          </button>
          {menuOpen && (
            <div className="picker-view-popup" role="menu">
              {VIEWS.map(({ id, icon: Icon }) => (
                <button key={id} type="button" role="menuitemradio" aria-checked={view === id} data-view={id} onClick={() => chooseView(id)}>
                  <Icon size={18} />
                  <span>{t(`picker.view.${id}`)}</span>
                  {view === id && <Check size={16} className="picker-view-check" />}
                </button>
              ))}
            </div>
          )}
          {/* Kept in the DOM so keyboard users and tests can switch views without the popup. */}
          {!menuOpen && (
            <div hidden>
              {VIEWS.map(({ id }) => <button key={id} type="button" data-view={id} onClick={() => chooseView(id)} tabIndex={-1}>{id}</button>)}
            </div>
          )}
        </div>
      </form>
      {error && <p className="picker-error" role="alert">{error}</p>}
      <div className="picker-grid" data-view={view} style={{ '--picker-icon': `${current.iconSize}px` } as CSSProperties} aria-label={t('picker.gridLabel')} aria-busy={busy}>
        {view === 'details' && (
          <div className="picker-details-header" role="row">
            {header('name')}{header('modified')}{header('type')}{header('size')}
          </div>
        )}
        {busy && <p className="picker-empty" role="status">{t('common.loading')}</p>}
        {!busy && entries.map((entry) => {
          const isSelected = selected.includes(entry.path);
          const type = entry.isDirectory ? t('picker.typeFolder') : t('picker.typeArchive', { type: typeOf(entry) });
          const modified = new Date(entry.modifiedAt).toLocaleString();
          return (
            <button
              className={`picker-tile ${isSelected ? 'selected' : ''}`}
              key={entry.path}
              type="button"
              title={`${entry.name}\n${modified}${entry.isDirectory ? '' : `\n${formatBytes(entry.size)}`}`}
              aria-pressed={entry.isDirectory ? undefined : isSelected}
              onClick={(event) => select(entry, event)}
              onDoubleClick={() => entry.isDirectory ? void navigate(entry.path) : void choose([entry.path])}
              onKeyDown={(event) => { if (entry.isDirectory && event.key === 'Enter') { event.preventDefault(); void navigate(entry.path); } }}
            >
              {isSelected && <Check className="picker-check" size={18} />}
              {entry.isDirectory
                ? <Folder className="picker-file-icon folder-icon" size={current.iconSize} strokeWidth={current.iconSize > 40 ? 1.2 : 1.8} />
                : <Archive className="picker-file-icon" size={current.iconSize} strokeWidth={current.iconSize > 40 ? 1.2 : 1.8} />}
              <strong className="picker-name">{entry.name}</strong>
              <span className="picker-meta picker-date">{modified}</span>
              <span className="picker-meta picker-type">{type}</span>
              <span className="picker-meta picker-size">{entry.isDirectory ? '' : formatBytes(entry.size)}</span>
            </button>
          );
        })}
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
