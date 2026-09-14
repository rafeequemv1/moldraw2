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
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const openInputRef = useRef<HTMLInputElement>(null);
  const placeInputRef = useRef<HTMLInputElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!menuOpen || preferSheet) {
      setMenuPos(null);
      return;
    }
    const place = () => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMenuPos({ top: Math.round(r.bottom + 4), left: Math.round(r.left) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [menuOpen, preferSheet]);

  useEffect(() => {
    if (!menuOpen || preferSheet) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setMenuOpen(false);
      setSaveAsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setSaveAsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, preferSheet]);

  const close = () => {
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
          <span className="app-top-bar__file-menu-label">New</span>
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
        <span className="app-top-bar__file-menu-label">Open…</span>
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
          <span className="app-top-bar__file-menu-label">Place…</span>
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
            <span className="app-top-bar__file-menu-label">Save Moldraw</span>
            <span className="app-top-bar__file-menu-hint">Entire canvas (.moldraw)</span>
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
            <div className="app-top-bar__file-menu-section">Save as</div>
            {saveAsItems}
          </>
        ) : (
          <div
            className={`app-top-bar__file-menu-flyout-wrap${saveAsOpen ? ' is-open' : ''}`}
            onMouseEnter={() => setSaveAsOpen(true)}
            onMouseLeave={() => setSaveAsOpen(false)}
          >
            <button
              type="button"
              className={`${itemClass} app-top-bar__file-menu-item--flyout`}
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={saveAsOpen}
              onClick={() => setSaveAsOpen(true)}
            >
              <FileDown size={14} strokeWidth={2} aria-hidden />
              <span className="app-top-bar__file-menu-text">
                <span className="app-top-bar__file-menu-label">Save as</span>
                <span className="app-top-bar__file-menu-hint">Molfile, ChemDraw, images…</span>
              </span>
              <ChevronRight size={14} className="app-top-bar__file-menu-chevron" aria-hidden />
            </button>
            {saveAsOpen ? (
              <div className="app-top-bar__file-submenu" role="menu" aria-label="Save as">
                {saveAsItems}
              </div>
            ) : null}
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
          <button type="button" onClick={onDismissOpenError} aria-label="Dismiss">
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
          title="File"
          aria-label="File"
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
        >
          <FolderOpen size={14} strokeWidth={2} aria-hidden />
          File
        </button>
        <MobileBottomSheet open={menuOpen} onClose={close} title="File" size="auto">
          <div className="mobile-sheet-list" role="menu" aria-label="File">
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
        onClick={() => setMenuOpen(v => !v)}
        title="File"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        <FolderOpen size={13} strokeWidth={2} aria-hidden />
        File
      </button>
      {menuOpen && menuPos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              className="app-top-bar__file-menu app-top-bar__file-menu--portal"
              role="menu"
              style={{ top: menuPos.top, left: menuPos.left }}
            >
              {menuItems}
            </div>,
            document.body,
          )
        : null}
      {hiddenInputs}
    </div>
  );
}
