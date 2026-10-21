import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Heart, X } from 'lucide-react';
import { LANGUAGE_NAMES, useT } from './i18n';
import type { AddLog } from './App';
import type { AppInfo, AppSettings, Language } from './types';

export const REPOSITORY_URL = 'https://github.com/nyankuro/quick-extract-ultra';

interface Props {
  settings: AppSettings;
  appInfo: AppInfo | null;
  onChange: (settings: AppSettings) => void;
  onClose: () => void;
  addLog: AddLog;
}

export default function SettingsDialog({ settings, appInfo, onChange, onClose, addLog }: Props) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);

  const update = async (patch: Partial<AppSettings>) => {
    setSaving(true);
    setError('');
    const result = await window.quickExtract.updateSettings(patch);
    setSaving(false);
    if (result.ok) {
      onChange(result.value);
      if ('explorerMenu' in patch) addLog('done', t(result.value.explorerMenu ? 'settings.menuAdded' : 'settings.menuRemoved'));
    } else {
      setError(result.message);
      addLog('error', result.message);
    }
  };

  const toggle = (key: keyof AppSettings, label: string, hint: string) => (
    <label className="setting-row">
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <input type="checkbox" className="switch" checked={Boolean(settings[key])} disabled={saving} onChange={(event) => void update({ [key]: event.target.checked })} />
    </label>
  );

  return (
    <dialog className="archive-picker settings-dialog" ref={dialog} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <header className="picker-header">
        <div><h2>{t('settings.title')}</h2><span>Quick Extract Ultra {appInfo ? `v${appInfo.version}` : ''}</span></div>
        <button type="button" onClick={onClose} aria-label={t('common.close')}><X /></button>
      </header>
      <div className="settings-body">
        <label className="setting-row">
          <span><strong>{t('settings.language')}</strong><small>{t('settings.languageHint')}</small></span>
          <select value={settings.language} disabled={saving} onChange={(event) => void update({ language: event.target.value as Language })}>
            {(Object.keys(LANGUAGE_NAMES) as Language[]).map((code) => <option key={code} value={code}>{LANGUAGE_NAMES[code]}</option>)}
          </select>
        </label>
        {toggle('explorerMenu', t('settings.explorerMenu'), t('settings.explorerMenuHint'))}
        {toggle('openFolderAfter', t('settings.openFolderAfter'), t('settings.openFolderAfterHint'))}
        {toggle('propagateZone', t('settings.propagateZone'), t('settings.propagateZoneHint'))}
        {toggle('trashAfterExtract', t('settings.trashAfter'), t('settings.trashAfterHint'))}
        {error && <p className="picker-error" role="alert">{error}</p>}

        <section className="about-box">
          <h3>{t('settings.about')}</h3>
          <p>{t('settings.aboutText')}</p>
          <p className="muted">{t('settings.formats')}: {appInfo?.extractFormats.map((item) => item.toUpperCase()).join(', ')}</p>
          <div className="panel-actions">
            <a className="secondary-button compact" href={REPOSITORY_URL} target="_blank" rel="noreferrer"><ExternalLink size={16} />GitHub</a>
            <a className="secondary-button compact support-link" href={`${REPOSITORY_URL}#support-the-project`} target="_blank" rel="noreferrer"><Heart size={16} />{t('settings.support')}</a>
          </div>
          <p className="muted small-print">{t('settings.credits')}</p>
        </section>
      </div>
    </dialog>
  );
}
