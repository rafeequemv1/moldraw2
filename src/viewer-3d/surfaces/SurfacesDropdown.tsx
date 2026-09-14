import { useEffect, useId, useRef, useState } from 'react';
import {
  SURFACE_COLOR_MODE_OPTIONS,
  SURFACE_KIND_OPTIONS,
  type ViewerSurfaceColorMode,
  type ViewerSurfaceKind,
  type ViewerSurfaceSettings,
} from './types';

type SurfacesDropdownProps = {
  settings: ViewerSurfaceSettings;
  onChange: (next: ViewerSurfaceSettings) => void;
};

export function SurfacesDropdown({ settings, onChange }: SurfacesDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
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

  const patch = (partial: Partial<ViewerSurfaceSettings>) => {
    onChange({ ...settings, ...partial });
  };

  const setKind = (kind: ViewerSurfaceKind | null) => {
    patch({ kind });
  };

  const setColorMode = (colorMode: ViewerSurfaceColorMode) => {
    patch({ colorMode });
  };

  const onCubeFile = async (file: File | null) => {
    if (!file) {
      patch({ cubeText: null, cubeName: null });
      return;
    }
    try {
      const text = await file.text();
      patch({
        cubeText: text,
        cubeName: file.name,
        colorMode: 'volumetric',
        kind: settings.kind ?? 'VDW',
      });
    } catch (err) {
      console.warn('[viewer3d] failed to read cube file', err);
    }
  };

  const summary = settings.kind ?? 'Off';

  return (
    <div className="viewer3d-menu" ref={rootRef}>
      <button
        type="button"
        className={`viewer3d-menu__trigger${open ? ' is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(v => !v)}
        title="Molecular surfaces (VDW / MS / SAS / SES)"
      >
        Surfaces
        <span className="viewer3d-menu__trigger-hint">{summary}</span>
      </button>
      {open ? (
        <div className="viewer3d-menu__panel viewer3d-menu__panel--wide" id={menuId} role="menu">
          <label className="viewer3d-menu__row viewer3d-menu__row--radio">
            <input
              type="radio"
              name={`${menuId}-kind`}
              checked={settings.kind === null}
              onChange={() => setKind(null)}
            />
            <span>Off</span>
          </label>
          <div className="viewer3d-menu__section-label">Type</div>
          {SURFACE_KIND_OPTIONS.map(opt => (
            <label
              key={opt.id}
              className="viewer3d-menu__row viewer3d-menu__row--radio"
              title={opt.title}
            >
              <input
                type="radio"
                name={`${menuId}-kind`}
                checked={settings.kind === opt.id}
                onChange={() => setKind(opt.id)}
              />
              <span>
                {opt.label}
                <span className="viewer3d-menu__muted"> — {opt.title}</span>
              </span>
            </label>
          ))}

          <div className="viewer3d-menu__section-label">Appearance</div>
          <label className="viewer3d-menu__row viewer3d-menu__row--slider">
            <span>Opacity</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={settings.opacity}
              disabled={settings.kind === null}
              onChange={e => patch({ opacity: Number(e.target.value) })}
            />
            <span className="viewer3d-menu__value">
              {Math.round(settings.opacity * 100)}%
            </span>
          </label>

          <div className="viewer3d-menu__section-label">Color</div>
          {SURFACE_COLOR_MODE_OPTIONS.map(opt => (
            <label
              key={opt.id}
              className="viewer3d-menu__row viewer3d-menu__row--radio"
              title={opt.title}
            >
              <input
                type="radio"
                name={`${menuId}-color`}
                checked={settings.colorMode === opt.id}
                disabled={settings.kind === null}
                onChange={() => setColorMode(opt.id)}
              />
              <span>{opt.label}</span>
            </label>
          ))}

          {settings.colorMode === 'solid' ? (
            <label className="viewer3d-menu__row viewer3d-menu__row--color">
              <span>Solid</span>
              <input
                type="color"
                value={settings.solidColor}
                disabled={settings.kind === null}
                onChange={e => patch({ solidColor: e.target.value })}
              />
            </label>
          ) : null}

          {settings.colorMode === 'volumetric' ? (
            <div className="viewer3d-menu__cube">
              <button
                type="button"
                className="viewer3d-menu__file-btn"
                disabled={settings.kind === null}
                onClick={() => fileRef.current?.click()}
              >
                {settings.cubeName ? 'Replace cube…' : 'Load .cube…'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".cube,.cub,text/plain"
                hidden
                onChange={e => {
                  void onCubeFile(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
              {settings.cubeName ? (
                <div className="viewer3d-menu__cube-name" title={settings.cubeName}>
                  {settings.cubeName}
                  <button
                    type="button"
                    className="viewer3d-menu__clear"
                    onClick={() => patch({ cubeText: null, cubeName: null })}
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <p className="viewer3d-menu__hint">
                  Load a Gaussian cube to color the surface by volumetric data.
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
