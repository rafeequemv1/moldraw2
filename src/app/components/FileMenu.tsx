/**
 * File menu — New, Open, Place, Save Moldraw, Save as (other formats).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, FileUp, FilePlus, CopyPlus, Save, FileDown, ChevronRight } from 'lucide-react';
import { OPEN_CANVAS_FILE_ACCEPT } from '@moldraw/core/io/resolveMoleculeFile';
import { FILE_SAVE_AS_MENU_ITEMS } from '../downloadFormats';
import {
  formatPrimaryShortcut,
  resolveShortcutBindings,
  type ShortcutBindingsMap,
} from '../keyboard/shortcutBindings';
import type { DownloadFormat } from '../types';
import { MobileBottomSheet } from './MobileBottomSheet';
import { useI18n } from '../i18n';
import {
  anchoredMenuStyle,
  placeAnchoredMenu,
  placeSideFlyout,
  sideFlyoutStyle,
  type AnchoredMenuPos,
  type SideFlyoutPos,
} from '../menuPlacement';

const SAVE_AS_CLOSE_MS = 140;

export interface FileMenuProps {
  openFileBusy: boolean;
  openFileError: string | null;
  onDismissOpenError: () => void;
  onOpenFile: (file: File) => void;
  /** Add a file beside whatever is already on the canvas. */
  onPlaceFile?: (file: File) => void;
  onNewProject?: () => void;
  /** File → Save Moldraw — native .moldraw (entire canvas). */
  onSave?: () => void;
  /** File → Save as — exchange / image formats (not .moldraw). */
  onSaveAs?: (format: DownloadFormat) => void;
  /** Phone/tablet: open as a bottom sheet (dropdown is clipped by the compact top bar). */
  preferSheet?: boolean;
  shortcutOverrides?: ShortcutBindingsMap | null;
}

export function FileMenu({
  openFileBusy,
  openFileError,
  onDismissOpenError,
  onOpenFile,
  onPlaceFile,
  onNewProject,
  onSave,
  onSaveAs,
  preferSheet = false,
  shortcutOverrides = null,
}: FileMenuProps) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const saveAsBtnRef = useRef<HTMLButtonElement>(null);
  const saveAsMenuRef = useRef<HTMLDivElement>(null);
  const saveAsCloseTimer = useRef<number | null>(null);
  const openInputRef = useRef<HTMLInputElement>(null);
  const placeInputRef = useRef<HTMLInputElement>(null);
  const [menuPos, setMenuPos] = useState<AnchoredMenuPos | null>(null);
  const [saveAsPos, setSaveAsPos] = useState<SideFlyoutPos | null>(null);

  const clearSaveAsCloseTimer = () => {
    if (saveAsCloseTimer.current != null) {
      window.clearTimeout(saveAsCloseTimer.current);
      saveAsCloseTimer.current = null;
    }
  };

  const keepSaveAsOpen = () => {
    clearSaveAsCloseTimer();
    setSaveAsOpen(true);
  };

  const scheduleSaveAsClose = () => {
    clearSaveAsCloseTimer();
    saveAsCloseTimer.current = window.setTimeout(() => {
      setSaveAsOpen(false);
      saveAsCloseTimer.current = null;
    }, SAVE_AS_CLOSE_MS);
  };

  useLayoutEffect(() => {
    if (!menuOpen || preferSheet) {
      setMenuPos(null);
      return;
    }
    const place = () => {
      const el = wrapRef.current;
      if (!el) return;
      const measured = menuRef.current?.offsetHeight ?? 280;
      setMenuPos(placeAnchoredMenu(el.getBoundingClientRect(), { menuWidth: 180, menuHeight: measured }));
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [menuOpen, preferSheet]);

  useLayoutEffect(() => {
    if (!menuOpen || !saveAsOpen || preferSheet) {
      setSaveAsPos(null);
      return;
    }
    const place = () => {
      const anchor = saveAsBtnRef.current;
      if (!anchor) return;
      const panel = saveAsMenuRef.current;
      setSaveAsPos(
        placeSideFlyout(anchor.getBoundingClientRect(), {
          menuWidth: panel?.offsetWidth ?? 210,
          menuHeight: panel?.offsetHeight ?? 280,
        }),
      );
    };
    place();
    const raf = window.requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [menuOpen, saveAsOpen, preferSheet]);

  useEffect(() => {
    if (!menuOpen || preferSheet) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        wrapRef.current?.contains(t) ||
        menuRef.current?.contains(t) ||
        saveAsMenuRef.current?.contains(t)
      ) {
        return;
      }
      setMenuOpen(false);
      setSaveAsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (saveAsOpen) {
        setSaveAsOpen(false);
        return;
      }
      setMenuOpen(false);
      setSaveAsOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, preferSheet, saveAsOpen]);

  useEffect(() => () => clearSaveAsCloseTimer(), []);

  const close = () => {
    clearSaveAsCloseTimer();
    setMenuOpen(false);
    setSaveAsOpen(false);
  };

  const triggerOpen = () => {
    close();
    onDismissOpenError();
    openInputRef.current?.click();
  };

  const triggerPlace = () => {
    close();
    onDismissOpenError();
    placeInputRef.current?.click();
  };

  const itemClass = preferSheet ? 'mobile-sheet-list__btn' : 'app-top-bar__file-menu-item';
  const saveShortcut = useMemo(() => {
    const bindings = resolveShortcutBindings(shortcutOverrides);
    const isMac =
      typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    return formatPrimaryShortcut('save', bindings, isMac);
  }, [shortcutOverrides]);

  const pickSaveAs = (format: DownloadFormat) => {
    close();
    onSaveAs?.(format);
  };

  const saveAsItems = FILE_SAVE_AS_MENU_ITEMS.map(({ key, label, ext, icon }) => (
    <button
      key={key}
      type="button"
      className={preferSheet ? 'mobile-sheet-list__btn' : 'app-top-bar__file-submenu-item'}
      role="menuitem"
      onClick={() => pickSaveAs(key)}
    >
      {icon(14)}
      <span className="app-top-bar__file-menu-flyout-label">{label}</span>
      <span className="app-top-bar__file-submenu-ext">{ext}</span>
    </button>
  ));

  const menuItems = (
    <>
      {onNewProject ? (
        <button
          type="button"
          className={itemClass}
          role="menuitem"
          onClick={() => {
            close();
            onNewProject();
          }}
        >
          <FilePlus size={14} strokeWidth={2} aria-hidden />
          <span className="app-top-bar__file-menu-label">{t('file.new')}</span>
        </button>
      ) : null}

      <button
        type="button"
        className={itemClass}
        role="menuitem"
        disabled={openFileBusy}
        onClick={triggerOpen}
      >
        <FileUp size={14} strokeWidth={2} aria-hidden />
        <span className="app-top-bar__file-menu-label">{t('file.open')}</span>
      </button>

      {onPlaceFile ? (
        <button
          type="button"
          className={itemClass}
          role="menuitem"
          disabled={openFileBusy}
          onClick={triggerPlace}
        >
          <CopyPlus size={14} strokeWidth={2} aria-hidden />
          <span className="app-top-bar__file-menu-label">{t('file.place')}</span>
        </button>
      ) : null}

      {onSave || onSaveAs ? <div className="app-top-bar__file-menu-sep" role="separator" /> : null}

      {onSave ? (
        <button
          type="button"
          className={itemClass}
          role="menuitem"
          onClick={() => {
            close();
            onSave();
          }}
        >
          <Save size={14} strokeWidth={2} aria-hidden />
          <span className="app-top-bar__file-menu-text">
            <span className="app-top-bar__file-menu-label">{t('file.saveMoldraw')}</span>
            <span className="app-top-bar__file-menu-hint">{t('file.saveMoldrawHint')}</span>
          </span>
          {saveShortcut ? (
            <span className="app-top-bar__file-submenu-ext">{saveShortcut}</span>
          ) : null}
        </button>
      ) : null}

      {onSaveAs ? (
        preferSheet ? (
          <>
            <div className="app-top-bar__file-menu-sep" role="separator" />
            <div className="app-top-bar__file-menu-section">{t('file.saveAs')}</div>
            {saveAsItems}
          </>
        ) : (
          <div
            className={`app-top-bar__file-menu-flyout-wrap${saveAsOpen ? ' is-open' : ''}`}
            onMouseEnter={keepSaveAsOpen}
            onMouseLeave={scheduleSaveAsClose}
          >
            <button
              ref={saveAsBtnRef}
              type="button"
              className={`${itemClass} app-top-bar__file-menu-item--flyout`}
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={saveAsOpen}
              onClick={keepSaveAsOpen}
            >
              <FileDown size={14} strokeWidth={2} aria-hidden />
              <span className="app-top-bar__file-menu-text">
                <span className="app-top-bar__file-menu-label">{t('file.saveAs')}</span>
                <span className="app-top-bar__file-menu-hint">{t('file.saveAsHint')}</span>
              </span>
              <ChevronRight size={14} className="app-top-bar__file-menu-chevron" aria-hidden />
            </button>
          </div>
        )
      ) : null}
    </>
  );

  const hiddenInputs = (
    <>
      <input
        ref={openInputRef}
        type="file"
        accept={OPEN_CANVAS_FILE_ACCEPT}
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onOpenFile(file);
        }}
      />
      {onPlaceFile ? (
        <input
          ref={placeInputRef}
          type="file"
          accept={OPEN_CANVAS_FILE_ACCEPT}
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onPlaceFile(file);
          }}
        />
      ) : null}
      {openFileError ? (
        <div className="app-top-bar__file-error" role="alert">
          <span>{openFileError}</span>
          <button type="button" onClick={onDismissOpenError} aria-label={t('file.dismissError')}>
            ×
          </button>
        </div>
      ) : null}
    </>
  );

  if (preferSheet) {
    return (
      <div ref={wrapRef} className="app-top-bar__file-wrap">
        <button
          type="button"
          className={`app-top-bar__file-btn app-top-bar__clip-btn--icon${menuOpen ? ' app-top-bar__file-btn--open' : ''}`}
          onClick={() => setMenuOpen(v => !v)}
          title={t('file.menu')}
          aria-label={t('file.menu')}
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
        >
          <FolderOpen size={14} strokeWidth={2} aria-hidden />
          {t('file.menu')}
        </button>
        <MobileBottomSheet
          open={menuOpen}
          onClose={close}
          title={t('file.menu')}
          size="auto"
          className="mobile-sheet--menu"
        >
          <div className="mobile-sheet-list" role="menu" aria-label={t('file.menu')}>
            {menuItems}
          </div>
        </MobileBottomSheet>
        {hiddenInputs}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="app-top-bar__file-wrap">
      <button
        type="button"
        className={`app-top-bar__file-btn ${menuOpen ? 'app-top-bar__file-btn--open' : ''}`}
        onClick={() => {
          if (menuOpen) close();
          else setMenuOpen(true);
        }}
        title={t('file.menu')}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        <FolderOpen size={13} strokeWidth={2} aria-hidden />
        {t('file.menu')}
      </button>
      {menuOpen && menuPos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              className="app-top-bar__file-menu app-top-bar__file-menu--portal"
              role="menu"
              style={anchoredMenuStyle(menuPos)}
            >
              {menuItems}
            </div>,
            document.body,
          )
        : null}
      {onSaveAs && menuOpen && saveAsOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={saveAsMenuRef}
              className="app-top-bar__file-submenu app-top-bar__file-submenu--portal"
              role="menu"
              aria-label={t('file.saveAs')}
              style={
                saveAsPos
                  ? { ...sideFlyoutStyle(saveAsPos), visibility: 'visible' }
                  : { position: 'fixed', top: 0, left: 0, visibility: 'hidden', zIndex: 25000 }
              }
              onMouseEnter={keepSaveAsOpen}
              onMouseLeave={scheduleSaveAsClose}
            >
              {saveAsItems}
            </div>,
            document.body,
          )
        : null}
      {hiddenInputs}
    </div>
  );
}
