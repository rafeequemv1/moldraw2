import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FolderOpen, Layers, Palette } from 'lucide-react';
import type { ProteinStyleSettings } from './types';
import { REPRESENTATION_OPTIONS, COLOR_SCHEME_OPTIONS, SURFACE_KIND_OPTIONS } from './proteinStyles';
import { exportProtein, PROTEIN_EXPORT_FORMATS, type ProteinExportFormat } from './proteinExport';
import { ColorPickerRow } from './ColorPickerRow';
import type { Viewer3DExportViewer } from '@moldraw/viewer-3d';

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  return {
    open,
    ref,
    toggle: () => setOpen(v => !v),
    close: () => setOpen(false),
  };
}

export interface ProteinToolbarProps {
  globalStyle: ProteinStyleSettings;
  onGlobalStyleChange: (next: ProteinStyleSettings) => void;
  pdbText: string | null;
  title: string;
  getViewer: () => Viewer3DExportViewer | null;
  loading?: boolean;
  onOpenFile: () => void;
  pdbIdInput: string;
  onPdbIdChange: (v: string) => void;
  onFetchPdb: () => void;
}

export function ProteinToolbar({
  globalStyle,
  onGlobalStyleChange,
  pdbText,
  title,
  getViewer,
  loading,
  onOpenFile,
  pdbIdInput,
  onPdbIdChange,
  onFetchPdb,
}: ProteinToolbarProps) {
  const displayMenu = useDropdown();
  const surfaceMenu = useDropdown();
  const exportMenu = useDropdown();
  const [exportError, setExportError] = useState<string | null>(null);
  const [hiRes, setHiRes] = useState(false);

  const patch = (partial: Partial<ProteinStyleSettings>) =>
    onGlobalStyleChange({ ...globalStyle, ...partial });

  const patchSurface = (partial: Partial<ProteinStyleSettings['surface']>) =>
    onGlobalStyleChange({
      ...globalStyle,
      surface: { ...globalStyle.surface, ...partial },
    });

  const runExport = useCallback(
    (format: ProteinExportFormat) => {
      setExportError(null);
      const result = exportProtein({
        format,
        pdbText: pdbText ?? '',
        title,
        viewer: getViewer(),
        transparentPng: true,
        hiRes,
      });
      if (!result.ok) setExportError(result.error);
      exportMenu.close();
    },
    [pdbText, title, getViewer, hiRes, exportMenu],
  );

  const closeOthers = (keep: 'display' | 'surface' | 'export') => {
    if (keep !== 'display') displayMenu.close();
    if (keep !== 'surface') surfaceMenu.close();
    if (keep !== 'export') exportMenu.close();
  };

  // Close menus on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (displayMenu.ref.current?.contains(t)) return;
      if (surfaceMenu.ref.current?.contains(t)) return;
      if (exportMenu.ref.current?.contains(t)) return;
      displayMenu.close();
      surfaceMenu.close();
      exportMenu.close();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [displayMenu, surfaceMenu, exportMenu]);

  return (
    <div className="protein-toolbar">
      <button
        type="button"
        className="protein-toolbar__open"
        onClick={onOpenFile}
        disabled={loading}
        title="Open PDB file"
      >
        <FolderOpen size={13} aria-hidden />
        <span>Open</span>
      </button>

      <div className="protein-toolbar__pdb-id">
        <input
          type="text"
          placeholder="ID"
          value={pdbIdInput}
          maxLength={4}
          onChange={e => onPdbIdChange(e.target.value.toUpperCase())}
          onKeyDown={e => {
            if (e.key === 'Enter') onFetchPdb();
          }}
        />
        <button
          type="button"
          className="protein-toolbar__fetch"
          onClick={onFetchPdb}
          disabled={loading || pdbIdInput.length < 4}
          title="Fetch from RCSB"
        >
          Go
        </button>
      </div>

      <div className="protein-toolbar__menus">
        <div className="protein-menu" ref={displayMenu.ref}>
          <button
            type="button"
            className={`protein-menu__btn${displayMenu.open ? ' is-open' : ''}`}
            onClick={() => {
              closeOthers('display');
              displayMenu.toggle();
            }}
            title="Display"
          >
            <Palette size={13} aria-hidden />
            <span>Display</span>
          </button>
          {displayMenu.open && (
            <div className="protein-menu__panel">
              {REPRESENTATION_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  className={`protein-menu__item${globalStyle.representation === o.value ? ' is-active' : ''}`}
                  onClick={() => patch({ representation: o.value })}
                >
                  {o.label}
                </button>
              ))}
              <div className="protein-menu__divider" />
              {COLOR_SCHEME_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  className={`protein-menu__item${globalStyle.colorScheme === o.value && !globalStyle.customColor ? ' is-active' : ''}`}
                  onClick={() => patch({ colorScheme: o.value, customColor: undefined })}
                >
                  {o.label}
                </button>
              ))}
              <div className="protein-menu__divider" />
              <ColorPickerRow style={globalStyle} onChange={onGlobalStyleChange} compact />
              <label className="protein-menu__slider">
                <span>Opacity {Math.round(globalStyle.opacity * 100)}%</span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={globalStyle.opacity}
                  onChange={e => patch({ opacity: parseFloat(e.target.value) })}
                />
              </label>
            </div>
          )}
        </div>

        <div className="protein-menu" ref={surfaceMenu.ref}>
          <button
            type="button"
            className={`protein-menu__btn${surfaceMenu.open ? ' is-open' : ''}`}
            onClick={() => {
              closeOthers('surface');
              surfaceMenu.toggle();
            }}
            title="Surface"
          >
            <Layers size={13} aria-hidden />
            <span>Surface</span>
          </button>
          {surfaceMenu.open && (
            <div className="protein-menu__panel">
              <button
                type="button"
                className={`protein-menu__item${globalStyle.surface.enabled ? ' is-active' : ''}`}
                onClick={() => patchSurface({ enabled: !globalStyle.surface.enabled })}
              >
                {globalStyle.surface.enabled ? 'Hide' : 'Show'}
              </button>
              {SURFACE_KIND_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  className={`protein-menu__item${globalStyle.surface.kind === o.value ? ' is-active' : ''}`}
                  onClick={() => patchSurface({ kind: o.value, enabled: true })}
                >
                  {o.label}
                </button>
              ))}
              <label className="protein-menu__slider">
                <span>Opacity {Math.round(globalStyle.surface.opacity * 100)}%</span>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={globalStyle.surface.opacity}
                  onChange={e =>
                    patchSurface({ opacity: parseFloat(e.target.value), enabled: true })
                  }
                />
              </label>
            </div>
          )}
        </div>

        <div className="protein-menu protein-menu--export" ref={exportMenu.ref}>
          <button
            type="button"
            className={`protein-menu__btn${exportMenu.open ? ' is-open' : ''}`}
            onClick={() => {
              closeOthers('export');
              exportMenu.toggle();
            }}
            disabled={!pdbText}
            title="Export"
          >
            <Download size={13} aria-hidden />
            <span>Export</span>
          </button>
          {exportMenu.open && (
            <div className="protein-menu__panel protein-menu__panel--export">
              <div className="protein-menu__export-grid">
                {PROTEIN_EXPORT_FORMATS.map(fmt => (
                  <button
                    key={fmt}
                    type="button"
                    className="protein-menu__export-chip"
                    onClick={() => runExport(fmt)}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
              <label className="protein-menu__check">
                <input type="checkbox" checked={hiRes} onChange={e => setHiRes(e.target.checked)} />
                Hi-res
              </label>
              {exportError && <p className="protein-menu__error">{exportError}</p>}
            </div>
          )}
        </div>
      </div>

      <span className="protein-toolbar__title" title={title}>
        {title}
      </span>
    </div>
  );
}
