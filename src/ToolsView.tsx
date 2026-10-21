import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, ClipboardCopy, Fingerprint, FilePlus2, LoaderCircle, LockKeyhole, ShieldCheck, Trash2 } from 'lucide-react';
import { useT } from './i18n';
import { formatBytes, type AddLog } from './App';
import type { HashResult } from './types';

export interface ToolsRequest {
  mode: 'test' | 'hash';
  paths: string[];
  nonce: number;
}

interface Props {
  request: ToolsRequest | null;
  addLog: AddLog;
  algorithms: string[];
}

type TestStatus = 'ready' | 'running' | 'ok' | 'failed' | 'password';
interface TestRow { path: string; status: TestStatus; message: string }

const baseName = (filePath: string) => filePath.split(/[\\/]/).pop() || filePath;

export default function ToolsView({ request, addLog, algorithms }: Props) {
  const t = useT();
  const [testRows, setTestRows] = useState<TestRow[]>([]);
  const [testPassword, setTestPassword] = useState('');
  const [testing, setTesting] = useState(false);
  const [hashPaths, setHashPaths] = useState<string[]>([]);
  const [hashResults, setHashResults] = useState<HashResult[]>([]);
  const [chosen, setChosen] = useState<string[]>(['crc32', 'sha256']);
  const [hashing, setHashing] = useState(false);
  const [hashProgress, setHashProgress] = useState(0);
  const [expected, setExpected] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => window.quickExtract.onTaskProgress((event) => {
    if (event.task === 'hash') setHashProgress(event.progress);
  }), []);

  const runTests = async (rows: TestRow[]) => {
    setTesting(true);
    const next = rows.map((row) => ({ ...row }));
    for (const row of next) {
      if (row.status === 'ok') continue;
      row.status = 'running';
      setTestRows([...next]);
      const response = await window.quickExtract.testArchive(row.path, testPassword);
      if (response.ok) {
        row.status = 'ok';
        row.message = '';
      } else if (response.code.startsWith('PASSWORD')) {
        row.status = 'password';
        row.message = t(response.code === 'PASSWORD_INCORRECT' ? 'browse.passwordWrong' : 'browse.passwordNeeded');
      } else {
        row.status = 'failed';
        row.message = response.message;
        addLog('error', t('browse.testFailed', { name: baseName(row.path), message: response.message }));
      }
      setTestRows([...next]);
    }
    setTesting(false);
  };

  const runHashes = async (paths: string[], picked = chosen) => {
    setHashing(true);
    const results: HashResult[] = [];
    for (const filePath of paths) {
      setHashProgress(0);
      const response = await window.quickExtract.hashFile(filePath, picked);
      if (response.ok) results.push(response.value);
      else addLog('error', t('tools.hashFailed', { name: baseName(filePath), message: response.message }));
      setHashResults([...results]);
    }
    setHashing(false);
  };

  useEffect(() => {
    if (!request) return;
    void (async () => {
      const items = await window.quickExtract.statPaths(request.paths);
      const files = items.filter((item) => !item.isDirectory).map((item) => item.path);
      if (request.mode === 'test') {
        const rows = files.map((path) => ({ path, status: 'ready' as TestStatus, message: '' }));
        setTestRows(rows);
        await runTests(rows);
      } else {
        setHashPaths(files);
        await runHashes(files);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.nonce]);

  const addTestFiles = async () => {
    const paths = await window.quickExtract.selectPaths({ archives: true });
    if (paths.length) setTestRows((current) => [...current, ...paths.filter((path) => !current.some((row) => row.path === path)).map((path) => ({ path, status: 'ready' as TestStatus, message: '' }))]);
  };

  const addHashFiles = async () => {
    const paths = await window.quickExtract.selectPaths({});
    if (paths.length) setHashPaths((current) => [...new Set([...current, ...paths])]);
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(''), 1500);
  };

  const normalizedExpected = expected.trim().toLowerCase();
  const statusIcon = (status: TestStatus) => {
    if (status === 'running') return <LoaderCircle size={18} className="spin" />;
    if (status === 'ok') return <CheckCircle2 size={18} className="good-text" />;
    if (status === 'password') return <LockKeyhole size={18} className="warn-text" />;
    if (status === 'failed') return <CircleAlert size={18} className="error-text" />;
    return <ShieldCheck size={18} className="muted" />;
  };

  return (
    <div className="tool-layout tools-view">
      <section className="tool-panel" aria-label={t('tools.testTitle')}>
        <div className="panel-header">
          <h2><ShieldCheck size={20} className="accent-icon" />{t('tools.testTitle')}</h2>
          <div className="panel-actions">
            <button className="secondary-button compact" type="button" onClick={() => void addTestFiles()} disabled={testing}><FilePlus2 size={18} />{t('tools.addArchives')}</button>
            <button className="secondary-button compact" type="button" onClick={() => setTestRows([])} disabled={testing || !testRows.length}><Trash2 size={18} />{t('compress.clear')}</button>
          </div>
        </div>
        <p className="muted">{t('tools.testHint')}</p>
        <div className="field-row">
          <input type="password" value={testPassword} onChange={(event) => setTestPassword(event.target.value)} placeholder={t('tools.passwordIfNeeded')} autoComplete="off" />
          <button className="primary-button compact" type="button" data-action="test-archives" onClick={() => void runTests(testRows)} disabled={testing || !testRows.length}>
            {testing ? <LoaderCircle size={18} className="spin" /> : <ShieldCheck size={18} />}{t('tools.runTest')}
          </button>
        </div>
        <div className="source-list">
          {testRows.length === 0 && <div className="empty-state small"><ShieldCheck size={30} /><span>{t('tools.testEmpty')}</span></div>}
          {testRows.map((row) => (
            <div className={`source-row test-${row.status}`} key={row.path}>
              {statusIcon(row.status)}
              <span title={row.path}>{baseName(row.path)}</span>
              <span className="muted" title={row.message}>{row.status === 'ok' ? t('tools.testOk') : row.message || t(`tools.status.${row.status}`)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="tool-panel" aria-label={t('tools.hashTitle')}>
        <div className="panel-header">
          <h2><Fingerprint size={20} className="accent-icon" />{t('tools.hashTitle')}</h2>
          <div className="panel-actions">
            <button className="secondary-button compact" type="button" onClick={() => void addHashFiles()} disabled={hashing}><FilePlus2 size={18} />{t('compress.addFiles')}</button>
            <button className="secondary-button compact" type="button" onClick={() => { setHashPaths([]); setHashResults([]); }} disabled={hashing || !hashPaths.length}><Trash2 size={18} />{t('compress.clear')}</button>
          </div>
        </div>
        <div className="algo-list">
          {(algorithms.length ? algorithms : ['crc32', 'sha256']).map((name) => (
            <label key={name} className="check-field">
              <input type="checkbox" checked={chosen.includes(name)} onChange={(event) => setChosen((current) => event.target.checked ? [...current, name] : current.filter((item) => item !== name))} />
              <span>{name.toUpperCase()}</span>
            </label>
          ))}
          <button className="primary-button compact" type="button" data-action="hash-files" onClick={() => void runHashes(hashPaths)} disabled={hashing || !hashPaths.length || !chosen.length}>
            {hashing ? <LoaderCircle size={18} className="spin" /> : <Fingerprint size={18} />}{hashing ? `${hashProgress}%` : t('tools.calculate')}
          </button>
        </div>
        <input className="compare-input" value={expected} onChange={(event) => setExpected(event.target.value)} placeholder={t('tools.compare')} />
        <div className="source-list hash-list">
          {hashPaths.length === 0 && <div className="empty-state small"><Fingerprint size={30} /><span>{t('tools.hashEmpty')}</span></div>}
          {hashPaths.map((filePath) => {
            const result = hashResults.find((item) => item.path === filePath);
            return (
              <div className="hash-card" key={filePath}>
                <strong title={filePath}>{baseName(filePath)} {result && <span className="muted">· {formatBytes(result.size)}</span>}</strong>
                {result && Object.entries(result.hashes).map(([name, value]) => (
                  <div className={`hash-line ${normalizedExpected && value.toLowerCase() === normalizedExpected ? 'match' : ''}`} key={name}>
                    <span className="hash-algo">{name.toUpperCase()}</span>
                    <code>{value}</code>
                    <button type="button" className="row-remove" onClick={() => void copy(value)} aria-label={t('tools.copy')} title={t('tools.copy')}>
                      {copied === value ? <CheckCircle2 size={16} /> : <ClipboardCopy size={16} />}
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {normalizedExpected && hashResults.length > 0 && (
          <p className={hashResults.some((result) => Object.values(result.hashes).some((value) => value.toLowerCase() === normalizedExpected)) ? 'good-text' : 'error-text'}>
            {hashResults.some((result) => Object.values(result.hashes).some((value) => value.toLowerCase() === normalizedExpected)) ? t('tools.match') : t('tools.noMatch')}
          </p>
        )}
      </section>
    </div>
  );
}
