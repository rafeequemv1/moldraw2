/**
 * Toolbar cell: opens a compact grid of functional-group previews (not the template library).
 * Panel portals to document.body so top-bar / left-rail overflow cannot clip it.
 * On compact viewports, opens as a bottom sheet instead of a floating panel.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { FUNCTIONAL_GROUP_TEMPLATES } from '@moldraw/templates';
import { tooltipShortcutSuffix } from '../keyboard/shortcutCatalog';
import { FunctionalGroupPreviewCell } from './FunctionalGroupPreviewCell';
import { computeToolbarFgPanelStyle } from './toolbarFgPanelPosition';
import { isLeftRailTrigger, pinMenuAboveAnchor, pinMenuRightOfRail, shouldOpenMenuAbove } from '../menuPlacement';
import { MobileBottomSheet } from './MobileBottomSheet';
import { useChromeOverlay } from '../chromeDismiss';

const TOOL_ID = 'functional_groups';

export interface ToolbarFunctionalGroupsToolProps {
  /** Load fragment and enter canvas placement mode (click/drag to attach or place). */
  onBeginPlacement: (smiles: string, label: string, molblock?: string | null) => void;
  requestSmilesMolblock: (smiles: string) => Promise<string | null>;
  /** Prefer bottom sheet over floating portal panel (phone/tablet). */
  preferSheet?: boolean;
}

export function ToolbarFunctionalGroupsTool({
  onBeginPlacement,
  requestSmilesMolblock,
  preferSheet = false,
}: ToolbarFunctionalGroupsToolProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);
  const [dropUp, setDropUp] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useChromeOverlay(open, () => {
    setOpen(false);
    setFilter('');
  });

  useLayoutEffect(() => {
    if (!open || preferSheet || !wrapRef.current) {
      setPanelStyle(null);
      return;
    }
    const update = () => {
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const openAbove = !isLeftRailTrigger(el) && shouldOpenMenuAbove(el, rect);
      setDropUp(openAbove);
      setPanelStyle(computeToolbarFgPanelStyle(rect, el));
      const panel = panelRef.current;
      if (panel && isLeftRailTrigger(el)) pinMenuRightOfRail(panel, el, 280);
      else if (openAbove && panel) pinMenuAboveAnchor(panel, rect, 280);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, [open, preferSheet]);

  useLayoutEffect(() => {
    if (!open || preferSheet) return;
    const panel = panelRef.current;
    const el = wrapRef.current;
    if (!panel || !el) return;
    if (isLeftRailTrigger(el)) {
      pinMenuRightOfRail(panel, el, 280);
      return;
    }
    if (!dropUp) return;
    pinMenuAboveAnchor(panel, el.getBoundingClientRect(), 280);
  }, [open, preferSheet, dropUp, panelStyle]);

  useEffect(() => {
    if (!open || preferSheet) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
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
  }, [open, preferSheet]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return FUNCTIONAL_GROUP_TEMPLATES;
    return FUNCTIONAL_GROUP_TEMPLATES.filter(g => g.label.toLowerCase().includes(q));
  }, [filter]);

  const title = `Functional groups: pick a group, then click an atom to bond or click empty canvas to place.${tooltipShortcutSuffix(TOOL_ID)}`;

  const grid = (
    <>
      <input
        type="search"
        className={preferSheet ? 'mobile-sheet-fg__search' : 'toolbar-fg-tool__search'}
        placeholder="Search groups…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        aria-label="Search functional groups"
      />
      {filtered.length === 0 ? (
        <p className="toolbar-fg-tool__empty">No groups match.</p>
      ) : (
        <div className="toolbar-fg-grid">
          {filtered.map(g => (
            <FunctionalGroupPreviewCell
              key={g.id}
              label={g.label}
              smiles={g.smiles}
              requestMolblock={requestSmilesMolblock}
              onPick={mb => {
                onBeginPlacement(g.smiles, g.label, mb);
                setOpen(false);
                setFilter('');
              }}
            />
          ))}
        </div>
      )}
    </>
  );

  const panel = preferSheet ? (
    <MobileBottomSheet
      open={open}
      onClose={() => setOpen(false)}
      title="Functional groups"
      size="auto"
      className="mobile-sheet--palette"
    >
      {grid}
    </MobileBottomSheet>
  ) : open && panelStyle && typeof document !== 'undefined' ? (
    createPortal(
      <div
        ref={panelRef}
        id={menuId}
        className={`toolbar-fg-tool__panel toolbar-fg-tool__panel--portal${
          dropUp ? ' toolbar-fg-tool__panel--drop-up' : ''
        }`}
        data-placement={dropUp ? 'above' : 'right'}
        role="dialog"
        aria-label="Functional groups"
        style={panelStyle}
        onMouseDown={e => e.stopPropagation()}
      >
        {grid}
      </div>,
      document.body,
    )
  ) : null;

  return (
    <div ref={wrapRef} className={`toolbar-fg-tool${open ? ' toolbar-fg-tool--open' : ''}`}>
      <button
        type="button"
        className="toolbar-fg-tool__trigger"
        onClick={() => setOpen(v => !v)}
        title={title}
        aria-label="Functional groups"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={menuId}
      >
        <span className="toolbar-fg-tool__glyph" aria-hidden>
          R
        </span>
        <ChevronDown size={6} strokeWidth={2.5} className="toolbar-fg-tool__caret" aria-hidden />
      </button>
      {panel}
    </div>
  );
}
