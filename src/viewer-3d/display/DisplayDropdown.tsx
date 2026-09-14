import { useEffect, useId, useRef, useState } from 'react';
import {
  DISPLAY_MODE_OPTIONS,
  type ViewerDisplayMode,
  type ViewerDisplaySettings,
} from './types';

type DisplayDropdownProps = {
  settings: ViewerDisplaySettings;
  onChange: (next: ViewerDisplaySettings) => void;
  /** When provided, hydrogens are controlled by the parent (App) as today. */
  onToggleHydrogens?: (show: boolean) => void;
};

export function DisplayDropdown({
  settings,
  onChange,
  onToggleHydrogens,
}: DisplayDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const setMode = (mode: ViewerDisplayMode) => {
    onChange({ ...settings, mode });
  };

  const setHydrogens = (showHydrogens: boolean) => {
    onChange({ ...settings, showHydrogens });
    onToggleHydrogens?.(showHydrogens);
  };

  const modeLabel =
    DISPLAY_MODE_OPTIONS.find(o => o.id === settings.mode)?.label ?? 'Display';

  return (
    <div className="viewer3d-menu" ref={rootRef}>
      <button
        type="button"
        className={`viewer3d-menu__trigger${open ? ' is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(v => !v)}
        title="Atom display style and hydrogens"
      >
        Display
        <span className="viewer3d-menu__trigger-hint">{modeLabel}</span>
      </button>
      {open ? (
        <div className="viewer3d-menu__panel" id={menuId} role="menu">
          <label className="viewer3d-menu__row viewer3d-menu__row--check">
            <input
              type="checkbox"
              checked={settings.showHydrogens}
              onChange={e => setHydrogens(e.target.checked)}
            />
            <span>Show hydrogens</span>
          </label>
          <div className="viewer3d-menu__section-label">Style</div>
          {DISPLAY_MODE_OPTIONS.map(opt => (
            <label
              key={opt.id}
              className="viewer3d-menu__row viewer3d-menu__row--radio"
              title={opt.title}
            >
              <input
                type="radio"
                name={`${menuId}-mode`}
                checked={settings.mode === opt.id}
                onChange={() => setMode(opt.id)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
