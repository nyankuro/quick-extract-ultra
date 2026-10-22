import { useEffect, useRef, useState } from 'react';
import { TriangleAlert, Trash2 } from 'lucide-react';
import { useT } from './i18n';

interface Props {
  // agreed: whether the user confirmed; dontShowAgain: whether to remember and skip
  // this warning (and persist the toggle) on future launches.
  onResolve: (agreed: boolean, dontShowAgain: boolean) => void;
}

// First-run confirmation before the app is allowed to permanently delete source
// archives after a successful extraction. Deletion is irreversible, so this is a
// deliberate, scary-on-purpose dialog with an opt-in "don't show again".
export default function DeleteArchiveDialog({ onResolve }: Props) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);

  return (
    <dialog
      className="archive-picker delete-warning-dialog"
      ref={dialog}
      onCancel={(event) => { event.preventDefault(); onResolve(false, false); }}
    >
      <header className="delete-warning-header">
        <span className="delete-warning-mark" aria-hidden="true"><TriangleAlert /></span>
        <h2>{t('deleteWarning.title')}</h2>
      </header>
      <div className="delete-warning-body">
        <p>{t('deleteWarning.body')}</p>
        <p className="delete-warning-note">{t('deleteWarning.note')}</p>
        <label className="delete-warning-check">
          <input
            type="checkbox"
            className="switch"
            checked={dontShow}
            onChange={(event) => setDontShow(event.target.checked)}
          />
          <span>{t('deleteWarning.dontShow')}</span>
        </label>
      </div>
      <footer className="delete-warning-actions">
        <button type="button" className="secondary-button" onClick={() => onResolve(false, false)}>
          {t('deleteWarning.cancel')}
        </button>
        <button type="button" className="primary-button delete-warning-confirm" onClick={() => onResolve(true, dontShow)}>
          <Trash2 size={18} aria-hidden="true" />
          {t('deleteWarning.agree')}
        </button>
      </footer>
    </dialog>
  );
}
