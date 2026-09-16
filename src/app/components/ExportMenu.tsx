/**
 * Download dropdown on the top bar — PNG, MOL, ChemDraw, PDF, etc.
 * Phone/tablet: format list opens as a bottom sheet instead of a clipped flyout.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Download } from 'lucide-react';
import { DOWNLOAD_FORMAT_ITEMS } from '../downloadFormats';
import { useCompactViewport } from '../hooks/useCompactViewport';
import type { DownloadFormat } from '../types';
import { useI18n } from '../i18n';
import { anchoredMenuStyle, placeAnchoredMenu, type AnchoredMenuPos } from '../menuPlacement';
import { MobileBottomSheet } from './MobileBottomSheet';
import { useChromeOverlay } from '../chromeDismiss';

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
  /** Phone/tablet: open formats as a bottom sheet. Defaults to compact viewport. */
  preferSheet?: boolean;
}

export function ExportMenu({ open, onToggle, onSaveAs, preferSheet }: ExportMenuProps) {
  const { t } = useI18n();
  const compactViewport = useCompactViewport();
  const useSheet = preferSheet ?? compactViewport;
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<AnchoredMenuPos | null>(null);
  useChromeOverlay(open && !useSheet, () => {
    if (open) onToggle();
  });

  useLayoutEffect(() => {
    if (!open || useSheet || !wrapRef.current) {
      setMenuPos(null);
      return;
    }
    const rect = wrapRef.current.getBoundingClientRect();
    setMenuPos(placeAnchoredMenu(rect, { menuWidth: 118, menuHeight: 280, align: 'right' }));
  }, [open, useSheet]);

  useEffect(() => {
    if (!open || useSheet) return undefined;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onToggle();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onToggle, useSheet]);

  const pickFormat = (key: DownloadFormat) => {
    onSaveAs(key);
  };

  return (
    <div className="tb-menu-dropdown tb-menu-dropdown--download" ref={wrapRef}>
      <button
        type="button"
        className={`tb-btn tb-btn-download${useSheet ? ' tb-btn-download--icon' : ''}`}
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup={useSheet ? 'dialog' : 'menu'}
        aria-label={useSheet ? t('export.download') : undefined}
        title={t('export.download')}
      >
        <Download size={12} strokeWidth={2.4} aria-hidden />
        {useSheet ? null : (
          <>
            {t('export.download')}
            <ChevronDown size={11} strokeWidth={2.5} aria-hidden />
          </>
        )}
      </button>
      {useSheet ? (
        <MobileBottomSheet
          open={open}
          onClose={onToggle}
          title={t('export.download')}
          size="auto"
          className="mobile-sheet--menu"
          ariaLabel={t('export.downloadFormatAria')}
        >
          <div className="mobile-sheet-list" role="menu" aria-label={t('export.downloadFormatAria')}>
            {DOWNLOAD_FORMAT_ITEMS.map(({ key, label, ext, icon }) => (
              <button
                key={key}
                type="button"
                className="mobile-sheet-list__btn"
                role="menuitem"
                onClick={() => pickFormat(key)}
              >
                {icon(14)}
                <span className="app-top-bar__file-menu-flyout-label">{compactDownloadLabel(key, label)}</span>
                <span className="app-top-bar__file-submenu-ext">{ext}</span>
              </button>
            ))}
          </div>
        </MobileBottomSheet>
      ) : open && menuPos ? (
        createPortal(
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
                onClick={() => pickFormat(key)}
              >
                {compactDownloadLabel(key, label)}
              </button>
            ))}
          </div>,
          document.body,
        )
      ) : null}
    </div>
  );
}
