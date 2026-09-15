/**
 * Compact 3D export control strip matching ChemDraw-style format chips.
 * Visibility is owned by the parent `viewer3d-island` minimize toggle.
 */
import { useState } from 'react';
import {
  exportViewer3D,
  type Viewer3DExportFormat,
  type Viewer3DExportViewer,
} from './exportViewer3D';

const ROW1: Viewer3DExportFormat[] = ['glb', 'png', 'jpg', 'sdf'];

export interface Viewer3DExportBarProps {
  molblock: string;
  title?: string;
  getViewer: () => Viewer3DExportViewer | null;
  disabled?: boolean;
  /** Return false to cancel (e.g. show signup before export). */
  onBeforeExport?: () => boolean;
}

export function Viewer3DExportBar({
  molblock,
  title,
  getViewer,
  disabled = false,
  onBeforeExport,
}: Viewer3DExportBarProps) {
  const [hiRes, setHiRes] = useState(false);
  const [transparentPng, setTransparentPng] = useState(true);
  const [active, setActive] = useState<Viewer3DExportFormat | null>('glb');
  const [error, setError] = useState<string | null>(null);

  const run = (format: Viewer3DExportFormat) => {
    if (onBeforeExport && onBeforeExport() === false) return;
    setActive(format);
    setError(null);
    const result = exportViewer3D({
      format,
      molblock,
      title,
      viewer: getViewer(),
      transparentPng,
      hiRes,
    });
    if (!result.ok) setError(result.error);
  };

  const chip = (format: Viewer3DExportFormat) => (
    <button
      key={format}
      type="button"
      className={`viewer3d-export__chip${active === format ? ' is-active' : ''}`}
      disabled={disabled || !molblock.trim()}
      onClick={() => run(format)}
      title={`Export ${format.toUpperCase()}`}
    >
      {format.toUpperCase()}
    </button>
  );

  return (
    <div className="viewer3d-export" aria-label="3D export">
      <div className="viewer3d-export__heading">
        Export{active ? ` · ${active.toUpperCase()}` : ''}
      </div>
      <div className="viewer3d-export__grid">
        <div className="viewer3d-export__row">{ROW1.map(chip)}</div>
        <div className="viewer3d-export__row">
          {chip('xyz')}
          <button
            type="button"
            className={`viewer3d-export__chip viewer3d-export__chip--advanced${hiRes ? ' is-active' : ''}`}
            disabled={disabled || !molblock.trim()}
            onClick={() => setHiRes(v => !v)}
            title="Advanced: 2× resolution PNG / JPEG capture"
            aria-pressed={hiRes}
          >
            ADVANCED
          </button>
          {chip('x3d')}
          {chip('obj')}
        </div>
      </div>
      <button
        type="button"
        className={`viewer3d-export__transparent${transparentPng ? ' is-on' : ''}`}
        onClick={() => setTransparentPng(v => !v)}
        title="PNG export background transparency"
        aria-pressed={transparentPng}
      >
        Transparent PNG {transparentPng ? 'ON' : 'OFF'}
      </button>
      {error ? (
        <span className="viewer3d-export__error" title={error}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
