import { useEffect, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { hideCharlaSupport, isCharlaVisible, showCharlaSupport, toggleCharlaSupport } from '../charlaSupport';
import { useI18n } from '../i18n';

/** Compact top-bar Help: shows Charla only while toggled on; closed = bubble gone. */
export function CharlaHelpButton({ compact }: { compact: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (compact) {
      hideCharlaSupport();
      setOpen(false);
      return;
    }
    showCharlaSupport();
    setOpen(isCharlaVisible());
  }, [compact]);

  if (!compact) return null;

  return (
    <button
      type="button"
      className={`app-top-bar__clip-btn app-top-bar__clip-btn--labeled${open ? ' is-open' : ''}`}
      title={open ? t('nav.helpCloseTitle') : t('nav.helpTitle')}
      aria-label={t('nav.help')}
      aria-pressed={open}
      onClick={() => setOpen(toggleCharlaSupport())}
    >
      <CircleHelp size={13} strokeWidth={2} aria-hidden />
      <span className="app-top-bar__help-label">{t('nav.help')}</span>
    </button>
  );
}
