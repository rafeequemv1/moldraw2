/**
 * Top-bar Chemistry menu — compact Copy-style list + plugin submenus.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Hexagon } from 'lucide-react';
import type { MenuContribution } from '@moldraw/plugin-sdk';
import { MobileBottomSheet } from './MobileBottomSheet';

export interface ChemistryMenuProps {
  indigoLayoutReady?: boolean;
  onAromatize?: () => void;
  onDearomatize?: () => void;
  onCheckStructure?: () => void;
  showCipLabels?: boolean;
  onToggleCipLabels?: () => void;
  onAutomap?: () => void;
  onInsertAutomapDemo?: () => void;
  onInsertMechanismDemo?: () => void;
  /** Plugin-contributed chemistry menus (when spectroscopy etc. is installed). */
  pluginMenus?: MenuContribution[];
  /** Phone/tablet: open as bottom sheet from an icon button. */
  preferSheet?: boolean;
}

export function ChemistryMenu({
  indigoLayoutReady = false,
  onAromatize,
  onDearomatize,
  onCheckStructure,
  showCipLabels = false,
  onToggleCipLabels,
  onAutomap,
  onInsertAutomapDemo,
  onInsertMechanismDemo,
  pluginMenus = [],
  preferSheet = false,
}: ChemistryMenuProps) {
  const [open, setOpen] = useState(false);
  const [openPluginMenuId, setOpenPluginMenuId] = useState<string | null>(null);
  const [pluginPos, setPluginPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pluginAnchorRef = useRef<HTMLButtonElement>(null);
  const pluginMenuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      setOpenPluginMenuId(null);
      return;
    }
    if (preferSheet) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || pluginMenuRef.current?.contains(t)) return;
      setOpen(false);
      setOpenPluginMenuId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setOpenPluginMenuId(null);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, preferSheet]);

  useLayoutEffect(() => {
    if (!openPluginMenuId || preferSheet || !pluginAnchorRef.current) {
      setPluginPos(null);
      return;
    }
    const place = () => {
      const anchor = pluginAnchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const menuW = pluginMenuRef.current?.offsetWidth ?? 180;
      const menuH = pluginMenuRef.current?.offsetHeight ?? 120;
      const pad = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = rect.right + 4;
      let top = rect.top;
      if (left + menuW > vw - pad) left = Math.max(pad, rect.left - menuW - 4);
      if (left < pad) {
        left = Math.min(vw - menuW - pad, Math.max(pad, rect.left));
        top = rect.bottom + 4;
      }
      if (top + menuH > vh - pad) top = Math.max(pad, vh - menuH - pad);
      if (top < pad) top = pad;
      setPluginPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [openPluginMenuId, preferSheet]);

  const run = (fn?: () => void) => {
    setOpen(false);
    setOpenPluginMenuId(null);
    fn?.();
  };

  const activePluginMenu = pluginMenus.find(m => m.id === openPluginMenuId);

  const indigoHint = indigoLayoutReady ? undefined : 'Waiting for Indigo…';
  const itemClass = preferSheet ? 'mobile-sheet-list__btn' : 'app-top-bar__clip-menu-item';

  const chemistryItems = (
    <>
      <button
        type="button"
        className={itemClass}
        role="menuitem"
        disabled={!indigoLayoutReady || !onAromatize}
        title={indigoHint ?? 'Kekulé → aromatic bonds'}
        onClick={() => run(onAromatize)}
      >
        <span>Aromatize</span>
      </button>
      <button
        type="button"
        className={itemClass}
        role="menuitem"
        disabled={!indigoLayoutReady || !onDearomatize}
        title={indigoHint ?? 'Aromatic → Kekulé'}
        onClick={() => run(onDearomatize)}
      >
        <span>Dearomatize</span>
      </button>
      <button
        type="button"
        className={`${itemClass}${showCipLabels ? (preferSheet ? ' mobile-sheet-list__btn--on' : ' app-top-bar__clip-menu-item--active') : ''}`}
        role="menuitemcheckbox"
        aria-checked={showCipLabels}
        title="Toggle CIP R/S and E/Z labels"
        onClick={() => run(onToggleCipLabels)}
      >
        <span>{showCipLabels ? 'Hide CIP labels' : 'Show CIP labels'}</span>
      </button>
      <button
        type="button"
        className={itemClass}
        role="menuitem"
        disabled={!onInsertMechanismDemo}
        title="Insert multi-step mechanism demo"
        onClick={() => run(onInsertMechanismDemo)}
      >
        <span>Insert mechanism demo</span>
      </button>
      <button
        type="button"
        className={itemClass}
        role="menuitem"
        disabled={!indigoLayoutReady || !onInsertAutomapDemo}
        title={indigoHint ?? 'Insert SN2 automap demo'}
        onClick={() => run(onInsertAutomapDemo)}
      >
        <span>Insert SN2 demo</span>
      </button>
      <button
        type="button"
        className={itemClass}
        role="menuitem"
        disabled={!indigoLayoutReady || !onAutomap}
        title={indigoHint ?? 'Atom-to-atom mapping across reaction'}
        onClick={() => run(onAutomap)}
      >
        <span>Automap</span>
      </button>
      <button
        type="button"
        className={itemClass}
        role="menuitem"
        disabled={!indigoLayoutReady || !onCheckStructure}
        title={indigoHint ?? 'Check valence / stereo'}
        onClick={() => run(onCheckStructure)}
      >
        <span>Check structure</span>
      </button>
    </>
  );

  if (preferSheet) {
    return (
      <div className="app-top-bar__clip-copy-wrap app-top-bar__chem-wrap">
        <button
          type="button"
          className={`app-top-bar__clip-btn app-top-bar__clip-btn--icon app-top-bar__chem-btn${open ? ' is-open' : ''}`}
          onClick={() => setOpen(v => !v)}
          title="Chemistry tools"
          aria-label="Chemistry"
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <Hexagon size={14} strokeWidth={2} aria-hidden />
        </button>
        <MobileBottomSheet
          open={open}
          onClose={() => setOpen(false)}
          title="Chemistry"
          size="auto"
          className="mobile-sheet--menu"
        >
          <div className="mobile-sheet-list" role="menu" aria-label="Chemistry">
            {chemistryItems}
          </div>
          {pluginMenus.map(menu => (
            <div key={menu.id} className="mobile-sheet-arrange__section">
              <span className="mobile-sheet-arrange__label">{menu.label}</span>
              <div className="mobile-sheet-list" role="menu" aria-label={menu.label}>
                {menu.items?.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className="mobile-sheet-list__btn"
                    role="menuitem"
                    title={item.title}
                    onClick={() => run(() => void item.onClick())}
                  >
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </MobileBottomSheet>
      </div>
    );
  }

  const pluginPortal =
    activePluginMenu && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={pluginMenuRef}
            className="app-top-bar__clip-menu app-top-bar__clip-submenu--portal"
            role="menu"
            aria-label={activePluginMenu.label}
            style={
              pluginPos
                ? { position: 'fixed', top: pluginPos.top, left: pluginPos.left, zIndex: 12050 }
                : { position: 'fixed', top: 0, left: 0, visibility: 'hidden', zIndex: 12050 }
            }
            onMouseDown={e => e.stopPropagation()}
          >
            {activePluginMenu.items?.map(item => (
              <button
                key={item.id}
                type="button"
                className="app-top-bar__clip-menu-item"
                role="menuitem"
                title={item.title}
                onClick={() => run(() => void item.onClick())}
              >
                <span>{item.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapRef} className="app-top-bar__clip-copy-wrap app-top-bar__chem-wrap">
      <button
        type="button"
        className={`app-top-bar__clip-btn app-top-bar__chem-btn${open ? ' is-open' : ''}`}
        onClick={() => setOpen(v => !v)}
        title="Chemistry tools"
        aria-label="Chemistry"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
      >
        <Hexagon size={14} strokeWidth={2} aria-hidden />
        <span className="app-top-bar__chem-btn-label">Chemistry</span>
        <ChevronDown size={10} strokeWidth={2.5} aria-hidden />
      </button>
      {open ? (
        <div id={menuId} className="app-top-bar__clip-menu" role="menu" aria-label="Chemistry">
          {chemistryItems}
          {pluginMenus.map(menu => (
            <button
              key={menu.id}
              ref={openPluginMenuId === menu.id ? pluginAnchorRef : undefined}
              type="button"
              className={`app-top-bar__clip-menu-item app-top-bar__clip-menu-item--flyout${openPluginMenuId === menu.id ? ' app-top-bar__clip-menu-item--active' : ''}`}
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={openPluginMenuId === menu.id}
              title={menu.title ?? menu.label}
              onClick={() => setOpenPluginMenuId(v => (v === menu.id ? null : menu.id))}
              onMouseEnter={() => setOpenPluginMenuId(menu.id)}
            >
              <span>{menu.label}</span>
              <ChevronRight size={12} strokeWidth={2} aria-hidden />
            </button>
          ))}
        </div>
      ) : null}
      {pluginPortal}
    </div>
  );
}
