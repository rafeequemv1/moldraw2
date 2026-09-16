/**
 * Toolbar cell: compact grid of coordination ligands (NH₃, PPh₃, bpy, …).
 * Panel portals to document.body so the left rail overflow cannot clip it.
 * On compact viewports, opens as a bottom sheet.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { LIGAND_TEMPLATES } from '@moldraw/templates';
import { FunctionalGroupPreviewCell } from './FunctionalGroupPreviewCell';
import { computeToolbarFgPanelStyle } from './toolbarFgPanelPosition';
import { isLeftRailTrigger, pinMenuAboveAnchor, pinMenuRightOfRail, shouldOpenMenuAbove } from '../menuPlacement';
import { MobileBottomSheet } from './MobileBottomSheet';
import { useChromeOverlay } from '../chromeDismiss';

const TOOL_ID = 'ligands';

export interface ToolbarLigandsToolProps {
  onBeginPlacement: (id: string, molblock?: string | null) => void;
  requestSmilesMolblock: (smiles: string) => Promise<string | null>;
  preferSheet?: boolean;
}

export function ToolbarLigandsTool({
  onBeginPlacement,
  requestSmilesMolblock,
  preferSheet = false,
}: ToolbarLigandsToolProps) {
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
    if (!q) return LIGAND_TEMPLATES;
    return LIGAND_TEMPLATES.filter(
      g =>
        g.label.toLowerCase().includes(q) ||
        g.name.toLowerCase().includes(q) ||
        g.id.toLowerCase().includes(q),
    );
  }, [filter]);

  const grid = (
    <>
      <input
        type="search"
        className={preferSheet ? 'mobile-sheet-fg__search' : 'toolbar-fg-tool__search'}
        placeholder="Search ligands…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        aria-label="Search ligands"
      />
      {filtered.length === 0 ? (
        <p className="toolbar-fg-tool__empty">No ligands match.</p>
      ) : (
        <div className="toolbar-fg-grid">
          {filtered.map(g => (
            <FunctionalGroupPreviewCell
              key={g.id}
              label={g.label}
              smiles={g.smiles}
              requestMolblock={requestSmilesMolblock}
              onPick={mb => {
                onBeginPlacement(g.id, mb);
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
      title="Ligands"
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
        aria-label="Ligands"
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
        title="Ligands: NH₃, CO, PPh₃, bpy, Cp, H₂O… — click atom to attach or empty canvas to place"
        aria-label="Ligands"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={menuId}
        data-tool={TOOL_ID}
      >
        <span className="toolbar-fg-tool__glyph" aria-hidden>
          L
        </span>
        <ChevronDown size={6} strokeWidth={2.5} className="toolbar-fg-tool__caret" aria-hidden />
      </button>
      {panel}
    </div>
  );
}
