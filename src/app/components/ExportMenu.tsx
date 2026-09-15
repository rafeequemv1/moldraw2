/**
 * Download dropdown on the top bar — PNG, MOL, ChemDraw, PDF, etc.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { DOWNLOAD_FORMAT_ITEMS } from '../downloadFormats';
import type { DownloadFormat } from '../types';
import { useI18n } from '../i18n';
import { anchoredMenuStyle, placeAnchoredMenu, type AnchoredMenuPos } from '../menuPlacement';

const COMPACT_DOWNLOAD_LABEL: Partial<Record<DownloadFormat, string>> = {
  png_white: 'PNG white',
  mol: 'MOL',
  cdxml: 'CDXML',
  cdx: 'CDX',
  rxn: 'RXN',
};

function compactDownloadLabel(key: DownloadFormat, label: string): string {
  return COMPACT_DOWNLOAD_LABEL[key] ?? label;
}

export interface ExportMenuProps {
  open: boolean;
  onToggle: () => void;
  onSaveAs: (format: DownloadFormat) => void;
}

export function ExportMenu({ open, onToggle, onSaveAs }: ExportMenuProps) {
  const { t } = useI18n();
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<AnchoredMenuPos | null>(null);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) {
      setMenuPos(null);
      return;
    }
    const rect = wrapRef.current.getBoundingClientRect();
    setMenuPos(placeAnchoredMenu(rect, { menuWidth: 118, menuHeight: 280, align: 'right' }));
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onToggle();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onToggle]);

  return (
    <div className="tb-menu-dropdown tb-menu-dropdown--download" ref={wrapRef}>
      <button type="button" className="tb-btn tb-btn-download" onClick={onToggle} aria-expanded={open}>
        {t('export.download')}
        <ChevronDown size={10} strokeWidth={2.5} aria-hidden />
      </button>
      {open && menuPos
        ? createPortal(
            <div
              ref={menuRef}
              className="tb-menu-dropdown-list tb-menu-dropdown-list--portal tb-menu-dropdown-list--compact tb-menu-dropdown-list--download"
              role="menu"
              aria-label={t('export.downloadFormatAria')}
              style={anchoredMenuStyle(menuPos)}
              onMouseDown={e => e.stopPropagation()}
            >
              {DOWNLOAD_FORMAT_ITEMS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className="tb-menu-item"
                  role="menuitem"
                  onClick={() => onSaveAs(key)}
                >
                  {compactDownloadLabel(key, label)}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
