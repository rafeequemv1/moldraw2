/**
 * Download dropdown on the top bar — PNG, MOL, ChemDraw, PDF, etc.
 */
import { DOWNLOAD_FORMAT_ITEMS } from '../downloadFormats';
import type { DownloadFormat } from '../types';

export interface ExportMenuProps {
  open: boolean;
  onToggle: () => void;
  onSaveAs: (format: DownloadFormat) => void;
}

export function ExportMenu({ open, onToggle, onSaveAs }: ExportMenuProps) {
  return (
    <div className="app-top-bar__export-wrap">
      <button type="button" className="app-top-bar__export-btn" onClick={onToggle}>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Download
      </button>
      {open && (
        <div className="app-top-bar__export-menu" role="menu">
          {DOWNLOAD_FORMAT_ITEMS.map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              className="app-top-bar__export-menu-item"
              role="menuitem"
              onClick={() => onSaveAs(key)}
            >
              {icon(13)}
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
