import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleAlert,
  ClipboardCopy,
  Cpu,
  Download,
  DownloadCloud,
  ExternalLink,
  FileKey,
  FolderOpen,
  HelpCircle,
  Key,
  KeyRound,
  LoaderCircle,
  Pause,
  Play,
  ShieldAlert,
  Square,
  Wrench,
  X,
  Zap
} from 'lucide-react';
import { useT, type Translate } from './i18n';
import { formatBytes, type AddLog } from './App';
import type { Charset, RecoveryEvent, RecoveryOptions, ToolInfo, ToolList, ZipInspection } from './types';

interface Props {
  addLog: AddLog;
}

type Phase = 'idle' | 'running' | 'paused' | 'found' | 'exhausted' | 'error';
const CHARSET_KEYS: (keyof Charset)[] = ['lower', 'upper', 'digits', 'symbols'];

function formatSpeed(speed: number | null, t: Translate) {
  if (!speed) return '—';
  const units = [[1e9, 'G'], [1e6, 'M'], [1e3, 'K']] as const;
  for (const [factor, suffix] of units) {
    if (speed >= factor) return t('recover.speedValue', { value: `${(speed / factor).toFixed(2)} ${suffix}` });
  }
  return t('recover.speedValue', { value: String(speed) });
}

function formatEta(seconds: number | null, text: string | null | undefined, t: Translate) {
  if (text) return text;
  if (seconds == null) return '—';
  if (seconds > 60 * 60 * 24 * 365) return t('recover.etaForever');
  const parts: string[] = [];
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!days && !hours) parts.push(`${secs}s`);
  return parts.join(' ');
}

export default function RecoverView({ addLog }: Props) {
  const t = useT();
  const [toolList, setToolList] = useState<ToolList | null>(null);
  const [consentTool, setConsentTool] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ phase: string; percent: number }>({ phase: '', percent: 0 });

  const [zipPath, setZipPath] = useState('');
  const [inspection, setInspection] = useState<ZipInspection | null>(null);
  const [knownPlaintext, setKnownPlaintext] = useState('');
  const [wordlistPath, setWordlistPath] = useState('');
  const [attackMode, setAttackMode] = useState<'auto' | 'wordlist' | 'bruteforce'>('auto');
  const [charset, setCharset] = useState<Charset>({ lower: true, digits: true });
  const [minLen, setMinLen] = useState(1);
  const [maxLen, setMaxLen] = useState(8);
  const [device, setDevice] = useState<'auto' | 'gpu' | 'cpu'>('auto');

  const [phase, setPhase] = useState<Phase>('idle');
  const [stage, setStage] = useState('');
  const [progress, setProgress] = useState<{ percent: number | null; speed: number | null; eta: number | null; etaText?: string | null }>({ percent: null, speed: null, eta: null });
  const [found, setFound] = useState<{ password: string | null; decryptedZipPath?: string } | null>(null);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const extractedRef = useRef('');

  const [manualChosen, setManualChosen] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [setupProgress, setSetupProgress] = useState<{ toolId: string; phase: string; percent: number } | null>(null);
  const [setupSummary, setSetupSummary] = useState('');
  const [showInfo, setShowInfo] = useState(false);

  const refreshTools = async () => {
    const result = await window.quickExtract.listTools();
    if (result.ok) {
      setToolList(result.value);
      setWordlistPath((current) => current || result.value.defaultWordlist);
    }
  };

  useEffect(() => { void refreshTools(); }, []);
  useEffect(() => window.quickExtract.onToolProgress((event) => {
    setDownloadProgress({ phase: event.phase, percent: event.percent });
    setSetupProgress({ toolId: event.toolId, phase: event.phase, percent: event.percent });
  }), []);

  useEffect(() => window.quickExtract.onRecoveryEvent((event: RecoveryEvent) => {
    switch (event.type) {
      case 'stage': setStage(t(`recover.stage.${event.stage}`, { device: event.device ?? '' })); break;
      case 'info': setMessage(event.message); break;
      case 'progress': setProgress({ percent: event.percent, speed: event.speed, eta: event.eta, etaText: event.etaText }); break;
      case 'found':
        setFound({ password: event.password, decryptedZipPath: event.decryptedZipPath });
        setPhase('found');
        addLog('done', event.password ? t('recover.foundLog') : t('recover.keysFoundLog'));
        break;
      case 'exhausted': setPhase('exhausted'); break;
      case 'paused': setPhase('paused'); break;
      case 'resumed': setPhase('running'); break;
      case 'cancelled': setPhase('idle'); setStage(''); break;
      case 'error': setPhase('error'); setMessage(event.message); addLog('error', t('recover.errorLog', { message: event.message })); break;
    }
  }), [t, addLog]);

  const tool = (id: string): ToolInfo | undefined => toolList?.tools.find((item) => item.id === id);
  const isZipCrypto = inspection?.zipCrypto ?? false;
  // The hash search needs John's zip2john even on the GPU path; bkcrack is the one exception.
  const canBkcrack = isZipCrypto && Boolean(knownPlaintext) && Boolean(tool('bkcrack')?.installed);
  const canStart = Boolean(zipPath && inspection) && phase !== 'running' && phase !== 'paused'
    && (canBkcrack || Boolean(tool('john')?.installed));

  const chooseZip = async () => {
    const [picked] = await window.quickExtract.selectPaths({ archives: true });
    if (!picked) return;
    setZipPath(picked);
    setInspection(null);
    setFound(null);
    setPhase('idle');
    setKnownPlaintext('');
    const result = await window.quickExtract.inspectZip(picked);
    if (result.ok) setInspection(result.value);
    else { setMessage(result.message); addLog('error', result.message); }
  };

  const chooseKnownPlaintext = async () => {
    const [picked] = await window.quickExtract.selectPaths({});
    if (picked) setKnownPlaintext(picked);
  };

  const chooseWordlist = async () => {
    const [picked] = await window.quickExtract.selectPaths({});
    if (picked) setWordlistPath(picked);
  };

  const download = async (toolId: string) => {
    setDownloading(toolId);
    setDownloadProgress({ phase: 'download', percent: 0 });
    const result = await window.quickExtract.downloadTool(toolId, true);
    setDownloading(null);
    setConsentTool(null);
    setConsentChecked(false);
    if (result.ok) {
      addLog('done', t('recover.downloaded', { name: toolId, checked: result.value.verified ? t('recover.checksumOk') : t('recover.checksumNone') }));
      await refreshTools();
    } else {
      const text = result.code === 'CHECKSUM_MISMATCH' ? t('recover.checksumMismatch') : result.message;
      setMessage(text);
      addLog('error', text);
    }
  };

  const autoSetup = async () => {
    setSettingUp(true);
    setSetupSummary('');
    setSetupProgress(null);
    setMessage('');
    const result = await window.quickExtract.setupAllTools(true);
    setSettingUp(false);
    if (result.ok) {
      const added = result.value.filter((r) => r.ok && !r.skipped);
      const failed = result.value.filter((r) => !r.ok);
      setSetupSummary(t('recover.setupSummary', { added: added.length, failed: failed.length }));
      if (added.length) addLog('done', t('recover.setupDone', { names: added.map((r) => r.toolId).join(', ') }));
      if (failed.length) addLog('error', t('recover.setupFailed', { names: failed.map((r) => r.toolId).join(', ') }));
      await refreshTools();
    } else {
      setMessage(result.message);
      addLog('error', result.message);
    }
  };

  const start = async () => {
    setFound(null);
    setMessage('');
    setProgress({ percent: null, speed: null, eta: null });
    extractedRef.current = '';
    const options: RecoveryOptions = {
      zipPath,
      knownPlaintextPath: isZipCrypto && knownPlaintext ? knownPlaintext : undefined,
      device,
      attack: {
        mode: attackMode,
        wordlistPath: attackMode === 'bruteforce' ? undefined : wordlistPath,
        charset,
        minLen,
        maxLen
      }
    };
    const result = await window.quickExtract.startRecovery(options);
    if (result.ok) { setPhase('running'); setStage(t('recover.stage.inspect')); }
    else { setPhase('error'); setMessage(result.message); addLog('error', result.message); }
  };

  const extractNow = async () => {
    const destination = await window.quickExtract.selectFolder({ purpose: 'destination', defaultPath: zipPath.replace(/[\\/][^\\/]*$/, '') });
    if (!destination) return;
    const result = await window.quickExtract.recoveryExtract({
      zipPath,
      password: found?.password ?? '',
      decryptedZipPath: found?.decryptedZipPath,
      destinationFolder: destination
    });
    if (result.ok) { extractedRef.current = result.value; addLog('done', t('recover.extractedLog', { path: result.value })); }
    else { setMessage(result.message); addLog('error', result.message); }
  };

  const copyPassword = async () => {
    if (!found?.password) return;
    await navigator.clipboard.writeText(found.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const toolIcon = (id: string) => (id === 'bkcrack' ? <FileKey size={20} /> : id === 'hashcat' ? <Zap size={20} /> : <Cpu size={20} />);
  const anyToolReady = Boolean(tool('john')?.installed) || canBkcrack;

  const progressPercent = progress.percent != null ? Math.max(0, Math.min(100, progress.percent)) : null;
  const anyInstalled = Boolean(toolList?.tools.some((item) => item.installed));
  const showSetup = Boolean(toolList) && !anyInstalled && !manualChosen;

  const infoModal = showInfo && (
    <div className="recover-modal-backdrop" onClick={() => setShowInfo(false)}>
      <div className="recover-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <header className="picker-header">
          <h2><HelpCircle size={20} className="accent-icon" />{t('recover.infoTitle')}</h2>
          <button type="button" onClick={() => setShowInfo(false)} aria-label={t('common.close')}><X /></button>
        </header>
        <div className="recover-modal-body">
          <h3>{t('recover.infoWhyTitle')}</h3>
          <p>{t('recover.infoWhy')}</p>
          <h3>{t('recover.infoSafetyTitle')}</h3>
          <p>{t('recover.infoSafety')}</p>
          <ul className="muted">
            {toolList?.tools.map((item) => (
              <li key={item.id}><strong>{item.name}</strong> ({item.license}) — {item.page}</li>
            ))}
          </ul>
          <p className="muted small-print">{t('recover.infoAutoNote')}</p>
        </div>
      </div>
    </div>
  );

  if (showSetup) {
    return (
      <div className="recover-view setup">
        <p className="ownership-note" role="note"><ShieldAlert size={18} />{t('recover.ownership')}</p>
        <section className="recover-setup">
          <KeyRound size={46} className="accent-icon" />
          <h2>{t('recover.setupTitle')}</h2>
          <p className="setup-intro">{t('recover.setupIntro')}</p>
          <div className="setup-choices">
            <button className="primary-button wide setup-auto" type="button" data-action="setup-auto" onClick={() => void autoSetup()} disabled={settingUp}>
              {settingUp ? <LoaderCircle size={20} className="spin" /> : <DownloadCloud size={20} />}
              {t('recover.setupAuto')}
            </button>
            <button className="secondary-button setup-manual" type="button" onClick={() => setManualChosen(true)} disabled={settingUp}>
              <Wrench size={18} />{t('recover.setupManual')}
            </button>
            <button className="icon-button info-button" type="button" onClick={() => setShowInfo(true)} aria-label={t('recover.infoTitle')} title={t('recover.infoTitle')}>
              <HelpCircle size={22} />
            </button>
          </div>
          <p className="setup-sizes muted">{toolList?.tools.map((item) => `${item.name} ~${item.approxSizeMb} MB`).join(' · ')}</p>
          <p className="setup-auto-note muted small-print">{t('recover.autoRiskNote')}</p>
          {settingUp && setupProgress && (
            <div className="setup-progress">
              <div className="status-line"><LoaderCircle size={16} className="spin" /><span>{t('recover.setupDownloading', { name: setupProgress.toolId })} · {t(`recover.phase.${setupProgress.phase || 'download'}`, { percent: String(setupProgress.percent) })}</span></div>
              <div className="progress-cell wide"><span className="progress-track"><span className="progress-fill" style={{ width: `${setupProgress.percent}%` }} /></span><span>{setupProgress.percent}%</span></div>
            </div>
          )}
          {setupSummary && <p className="good-text">{setupSummary}</p>}
          {message && <p className="picker-error" role="alert">{message}</p>}
        </section>
        {infoModal}
      </div>
    );
  }

  return (
    <div className="recover-view">
      {infoModal}
      <p className="ownership-note" role="note">
        <ShieldAlert size={18} />
        {t('recover.ownership')}
      </p>

      <div className="recover-grid">
        <section className="tool-panel recover-tools" aria-label={t('recover.toolsTitle')}>
          <div className="panel-header">
            <h2><KeyRound size={20} className="accent-icon" />{t('recover.toolsTitle')}</h2>
            <div className="panel-actions">
              {!anyInstalled && (
                <button className="secondary-button compact" type="button" onClick={() => void autoSetup()} disabled={settingUp}>
                  {settingUp ? <LoaderCircle size={18} className="spin" /> : <DownloadCloud size={18} />}{t('recover.setupAutoShort')}
                </button>
              )}
              <button className="icon-button small" type="button" onClick={() => setShowInfo(true)} aria-label={t('recover.infoTitle')} title={t('recover.infoTitle')}><HelpCircle size={18} /></button>
              <button className="secondary-button compact" type="button" onClick={() => void window.quickExtract.openToolsFolder()}>
                <FolderOpen size={18} />{t('recover.openToolsFolder')}
              </button>
            </div>
          </div>
          <p className="muted">{t('recover.toolsHint')}</p>
          {toolList?.tools.map((item) => (
            <div className="tool-row" key={item.id}>
              <div className="tool-id">
                <span className={`tool-glyph ${item.installed ? 'ready' : ''}`}>{toolIcon(item.id)}</span>
                <div>
                  <strong>{item.name} {item.version && <span className="muted">{item.version}</span>}</strong>
                  <small className="muted">{t(`recover.purpose.${item.purpose}`)} · {item.license} · ~{item.approxSizeMb} MB</small>
                </div>
              </div>
              <div className="tool-state">
                {item.installed
                  ? <span className="good-text inline-badge"><CheckCircle2 size={16} />{t('recover.installed')}</span>
                  : <span className="muted inline-badge"><CircleAlert size={16} />{t('recover.notInstalled')}</span>}
              </div>
              <div className="tool-actions">
                {!item.installed && item.autoAvailable && (
                  <button className="secondary-button compact" type="button" disabled={Boolean(downloading)} onClick={() => { setConsentTool(item.id); setConsentChecked(false); }}>
                    <Download size={16} />{t('recover.autoDownload')}
                  </button>
                )}
                <button className="secondary-button compact" type="button" onClick={() => void window.quickExtract.openToolPage(item.page)}>
                  <ExternalLink size={16} />{t('recover.manualDownload')}
                </button>
              </div>
              {consentTool === item.id && (
                <div className="consent-box">
                  {!item.autoAvailable
                    ? <p className="hint"><AlertTriangle size={16} />{item.autoNote}</p>
                    : <>
                        <p>{t('recover.consentText', { name: item.name, license: item.license, size: String(item.approxSizeMb) })}</p>
                        <p className="muted">{t('recover.consentSource')}: {item.page}</p>
                        <label className="check-field">
                          <input type="checkbox" checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)} />
                          <span>{t('recover.consentAgree')}</span>
                        </label>
                        <div className="panel-actions">
                          <button className="primary-button compact" type="button" disabled={!consentChecked || Boolean(downloading)} onClick={() => void download(item.id)}>
                            {downloading === item.id ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
                            {downloading === item.id ? t(`recover.phase.${downloadProgress.phase || 'download'}`, { percent: String(downloadProgress.percent) }) : t('recover.startDownload')}
                          </button>
                          <button className="secondary-button compact" type="button" onClick={() => setConsentTool(null)} disabled={Boolean(downloading)}>{t('common.cancel')}</button>
                        </div>
                      </>}
                  {downloading === item.id && (
                    <div className="progress-cell wide"><span className="progress-track"><span className="progress-fill" style={{ width: `${downloadProgress.percent}%` }} /></span><span>{downloadProgress.percent}%</span></div>
                  )}
                </div>
              )}
            </div>
          ))}
        </section>

        <section className="tool-panel recover-run" aria-label={t('recover.runTitle')}>
          <h2><Key size={20} className="accent-icon" />{t('recover.runTitle')}</h2>

          <div className="field-row">
            <button className="secondary-button compact" type="button" onClick={() => void chooseZip()} disabled={phase === 'running' || phase === 'paused'}>
              <FileKey size={18} />{t('recover.chooseZip')}
            </button>
            <span className="muted zip-name" title={zipPath}>{inspection?.fileName || t('recover.noZip')}</span>
          </div>

          {inspection && (
            <div className="zip-facts">
              <span className={`inline-badge ${isZipCrypto ? 'c-amber-text' : 'c-blue-text'}`}>
                {isZipCrypto ? t('recover.zipcrypto') : t('recover.aes')}
              </span>
              <span className="muted">{t('recover.entryCount', { count: inspection.encrypted.length })}</span>
            </div>
          )}

          {inspection && isZipCrypto && (
            <div className="known-plain">
              <p className="muted">{t('recover.knownHint')}</p>
              <div className="field-row">
                <button className="secondary-button compact" type="button" onClick={() => void chooseKnownPlaintext()} disabled={phase === 'running'}>
                  <FileKey size={18} />{t('recover.chooseKnown')}
                </button>
                <span className="muted zip-name" title={knownPlaintext}>{knownPlaintext ? knownPlaintext.split(/[\\/]/).pop() : t('recover.noKnown')}</span>
              </div>
              {knownPlaintext && tool('bkcrack')?.installed && <p className="good-text small-print">{t('recover.bkcrackReady')}</p>}
            </div>
          )}

          <div className="recover-attack">
            <div className="segmented">
              <button type="button" className={attackMode === 'auto' ? 'active' : ''} onClick={() => setAttackMode('auto')} disabled={phase === 'running'}>{t('recover.autoMode')}</button>
              <button type="button" className={attackMode === 'wordlist' ? 'active' : ''} onClick={() => setAttackMode('wordlist')} disabled={phase === 'running'}>{t('recover.wordlistMode')}</button>
              <button type="button" className={attackMode === 'bruteforce' ? 'active' : ''} onClick={() => setAttackMode('bruteforce')} disabled={phase === 'running'}>{t('recover.bruteMode')}</button>
            </div>

            {attackMode === 'auto' ? (
              <p className="auto-pitch muted">{t('recover.autoPitch')}</p>
            ) : attackMode === 'wordlist' ? (
              <div className="field-row">
                <input value={wordlistPath} onChange={(event) => setWordlistPath(event.target.value)} placeholder={t('recover.wordlistPlaceholder')} disabled={phase === 'running'} />
                <button className="secondary-button compact" type="button" onClick={() => void chooseWordlist()} disabled={phase === 'running'}><FolderOpen size={18} />{t('common.browse')}</button>
              </div>
            ) : (
              <div className="brute-config">
                <div className="charset-row">
                  {CHARSET_KEYS.map((key) => (
                    <label key={key} className="check-field">
                      <input type="checkbox" checked={Boolean(charset[key])} onChange={(event) => setCharset((current) => ({ ...current, [key]: event.target.checked }))} disabled={phase === 'running'} />
                      <span>{t(`recover.charset.${key}`)}</span>
                    </label>
                  ))}
                </div>
                <div className="field-grid">
                  <label className="field"><span>{t('recover.minLen')}</span>
                    <input type="number" min={1} max={12} value={minLen} onChange={(event) => setMinLen(Number(event.target.value))} disabled={phase === 'running'} /></label>
                  <label className="field"><span>{t('recover.maxLen')}</span>
                    <input type="number" min={1} max={12} value={maxLen} onChange={(event) => setMaxLen(Number(event.target.value))} disabled={phase === 'running'} /></label>
                </div>
                <p className="hint small-print">{t('recover.bruteWarn')}</p>
              </div>
            )}

            <label className="field">
              <span>{t('recover.device')}</span>
              <select value={device} onChange={(event) => setDevice(event.target.value as 'auto' | 'gpu' | 'cpu')} disabled={phase === 'running'}>
                <option value="auto">{t('recover.deviceAuto')}</option>
                <option value="gpu">{t('recover.deviceGpu')}</option>
                <option value="cpu">{t('recover.deviceCpu')}</option>
              </select>
            </label>
          </div>

          <div className="recover-controls">
            {phase !== 'running' && phase !== 'paused' && (
              <button className="primary-button wide" type="button" data-action="start-recovery" onClick={() => void start()} disabled={!canStart}>
                <Play size={19} />{t(attackMode === 'auto' ? 'recover.startAuto' : 'recover.start')}
              </button>
            )}
            {phase === 'running' && (
              <>
                <button className="secondary-button" type="button" onClick={() => void window.quickExtract.pauseRecovery()}><Pause size={18} />{t('recover.pause')}</button>
                <button className="secondary-button clear-all-action" type="button" onClick={() => void window.quickExtract.cancelRecovery()}><Square size={18} />{t('recover.cancel')}</button>
              </>
            )}
            {phase === 'paused' && (
              <>
                <button className="primary-button" type="button" onClick={() => void window.quickExtract.resumeRecovery()}><Play size={18} />{t('recover.resume')}</button>
                <button className="secondary-button clear-all-action" type="button" onClick={() => void window.quickExtract.cancelRecovery()}><Square size={18} />{t('recover.cancel')}</button>
              </>
            )}
          </div>

          {!anyToolReady && <p className="hint"><AlertTriangle size={16} />{t('recover.needTool')}</p>}

          {(phase === 'running' || phase === 'paused') && (
            <div className="recover-status" role="status">
              <div className="status-line"><LoaderCircle size={16} className={phase === 'running' ? 'spin' : ''} /><span>{stage}</span>{phase === 'paused' && <span className="c-amber-text">· {t('recover.pausedLabel')}</span>}</div>
              <div className="progress-cell wide">
                <span className="progress-track"><span className="progress-fill" style={{ width: `${progressPercent ?? 3}%` }} /></span>
                <span>{progressPercent != null ? `${progressPercent.toFixed(1)}%` : '…'}</span>
              </div>
              <div className="recover-metrics">
                <span>{t('recover.speed')}: <strong>{formatSpeed(progress.speed, t)}</strong></span>
                <span>{t('recover.eta')}: <strong>{formatEta(progress.eta, progress.etaText, t)}</strong></span>
              </div>
            </div>
          )}

          {phase === 'found' && (
            <div className="recover-result good" role="status">
              <CheckCircle2 size={22} className="good-text" />
              {found?.password != null ? (
                <>
                  <span>{t('recover.foundLabel')}</span>
                  <code className="found-password">{found.password}</code>
                  <button className="icon-button small" type="button" onClick={() => void copyPassword()} aria-label={t('tools.copy')}>{copied ? <Check size={18} /> : <ClipboardCopy size={18} />}</button>
                </>
              ) : (
                <span>{t('recover.keysFoundLabel')}</span>
              )}
              <button className="primary-button compact" type="button" onClick={() => void extractNow()}><Download size={18} />{t('recover.extractNow')}</button>
              {extractedRef.current && <span className="good-text small-print">{t('recover.extractedInline')}</span>}
            </div>
          )}
          {phase === 'exhausted' && <div className="recover-result bad" role="status"><CircleAlert size={20} />{t('recover.exhausted')}</div>}
          {phase === 'error' && message && <div className="recover-result bad" role="alert"><CircleAlert size={20} />{message}</div>}
        </section>
      </div>
    </div>
  );
}
