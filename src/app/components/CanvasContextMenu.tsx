/**
 * Right-click context menu shown over the canvas. Surfaces SMILES copy/paste,
 * stereochemistry tool launchers (Newman, E/Z, chair/boat, Fischer), alias
 * expand/collapse, and an export submenu.
 *
 * All handlers are passed in — this component owns no behavior beyond
 * rendering and forwarding clicks.
 */
import { useLayoutEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Copy,
  ClipboardPaste,
  CopyPlus,
  Hexagon,
  Highlighter,
  Wand2,
  FlaskConical,
  ChevronRight,
  ArrowLeftRight,
  Group,
  Ungroup,
} from 'lucide-react';
import type { Molecule } from '@moldraw/domain';
import { selectionIsGrouped } from '@moldraw/core';
import { COLOR_PRESETS } from '@moldraw/core/color/selectionColor';
import type { CopyAsFormat, DownloadFormat } from '../types';
import { DOWNLOAD_FORMAT_ITEMS } from '../downloadFormats';
import { COPY_AS_FORMAT_ITEMS } from '../copyAsFormats';
import { isSimpleCycleAtomSet } from '@moldraw/domain';
import { QUICK_ELEMENT_PALETTE, PERIODIC_TABLE_CELLS } from '@moldraw/domain';
import { MobileBottomSheet } from './MobileBottomSheet';

const FLYOUT_GAP = 4;
const FLYOUT_PAD = 8;
const FLYOUT_CLOSE_MS = 140;

type FlyoutPos = { top: number; left: number };

/** Fixed-position flyout that escapes the parent menu's overflow clipping. */
function ContextMenuFlyout({
  open,
  anchorRef,
  onKeepOpen,
  onRequestClose,
  children,
  minWidth = 160,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onKeepOpen: () => void;
  onRequestClose: () => void;
  children: ReactNode;
  minWidth?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<FlyoutPos | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const panel = panelRef.current;
      const panelW = panel?.offsetWidth ?? minWidth;
      const panelH = panel?.offsetHeight ?? 120;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let left = rect.right + FLYOUT_GAP;
      if (left + panelW > vw - FLYOUT_PAD) {
        left = Math.max(FLYOUT_PAD, rect.left - FLYOUT_GAP - panelW);
      }
      let top = rect.top;
      if (top + panelH > vh - FLYOUT_PAD) {
        top = Math.max(FLYOUT_PAD, vh - FLYOUT_PAD - panelH);
      }
      setPos({ top, left });
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
  }, [open, anchorRef, minWidth]);

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      onMouseEnter={onKeepOpen}
      onMouseLeave={onRequestClose}
      className="context-menu-flyout"
      style={{
        position: 'fixed',
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        visibility: pos ? 'visible' : 'hidden',
        minWidth,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

export interface CanvasContextMenuState {
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  bondId?: string;
  atomId?: string;
  canvasTextId?: string;
  reactionArrowId?: string;
  strokeId?: string;
  canvasShapeId?: string;
  canvasImageId?: string;
  sruBracketId?: string;
  /** Input that opened the menu (`'touch'` → long-press). */
  pointerType?: string;
}

export interface CanvasContextMenuProps {
  menu: CanvasContextMenuState;
  molecule: Molecule;
  selectedAtomIds: string[];
  selectedSruBracketId?: string | null;
  detectedAliasAtCursor: string | null;

  onCopySmiles: () => void;
  /** ChemDraw-style Copy as… (SMILES / MOL / PNG / SVG). */
  onCopyAs?: (format: CopyAsFormat) => void;
  onPasteSmiles: () => void;
  onHighlightColor?: (color: string | null) => void;
  onLaunchNewman: (bondId: string) => void;
  onLaunchEZ: (bondId: string) => void;
  onLaunchChairBoat: () => void;
  onLaunchFischer: () => void;
  onExpandAlias: (atomId: string) => void;
  onCollapseToAlias: (atomId: string, alias: string) => void;
  onChangeAtomElement: (atomId: string, element: string) => void;
  onSetAtomIsotope: (atomId: string, isotope?: number) => void;
  onCustomAtomIsotope: (atomId: string) => void;
  onEditAtomAlias: (atomId: string) => void;
  onClearAtomAlias: (atomId: string) => void;
  onSelectConnectedFragment: (atomId: string) => void;
  onInvertStereoAtAtom: (atomId: string) => void;
  onSwapSelectedAtomPositions: () => void;
  onEditSruBracketSubscript: (id: string) => void;
  onDownload: (format: DownloadFormat) => void;
  /** Add one bonded H on selection / atom under cursor. */
  onAddExplicitHydrogen: () => void;
  /** Whole-molecule unfold/fold explicit hydrogens (Indigo). */
  onToggleAllExplicitHydrogens?: () => void;
  hasExplicitHydrogens?: boolean;
  unfoldHydrogensDisabled?: boolean;
  unfoldHydrogensTitle?: string;
  /** Show/hide forced "C" label on carbon(s) under cursor / selection. */
  onToggleExplicitCarbonLabel: () => void;
  onGroupSelection?: () => void;
  onUngroupSelection?: () => void;
  /** Compact: render as bottom sheet instead of anchored popup. */
  asSheet?: boolean;
  onDismiss?: () => void;
}

const EXPORT_ITEMS = DOWNLOAD_FORMAT_ITEMS;

export function CanvasContextMenu({
  menu,
  molecule,
  selectedAtomIds,
  selectedSruBracketId,
  detectedAliasAtCursor,
  onCopySmiles,
  onCopyAs,
  onPasteSmiles,
  onHighlightColor,
  onLaunchNewman,
  onLaunchEZ,
  onLaunchChairBoat,
  onLaunchFischer,
  onExpandAlias,
  onCollapseToAlias,
  onChangeAtomElement,
  onSetAtomIsotope,
  onCustomAtomIsotope,
  onEditAtomAlias,
  onClearAtomAlias,
  onSelectConnectedFragment,
  onInvertStereoAtAtom,
  onSwapSelectedAtomPositions,
  onEditSruBracketSubscript,
  onDownload,
  onAddExplicitHydrogen,
  onToggleAllExplicitHydrogens,
  hasExplicitHydrogens = false,
  unfoldHydrogensDisabled = false,
  unfoldHydrogensTitle,
  onToggleExplicitCarbonLabel,
  onGroupSelection,
  onUngroupSelection,
  asSheet = false,
  onDismiss,
}: CanvasContextMenuProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const [copyAsOpen, setCopyAsOpen] = useState(false);
  const [elementOpen, setElementOpen] = useState(false);
  const [isotopeOpen, setIsotopeOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const exportAnchorRef = useRef<HTMLDivElement>(null);
  const copyAsAnchorRef = useRef<HTMLDivElement>(null);
  const elementAnchorRef = useRef<HTMLDivElement>(null);
  const isotopeAnchorRef = useRef<HTMLDivElement>(null);
  const highlightAnchorRef = useRef<HTMLDivElement>(null);
  const flyoutCloseTimerRef = useRef<number | null>(null);
  const [anchoredPos, setAnchoredPos] = useState({ left: menu.x, top: menu.y });
  const [positionReady, setPositionReady] = useState(false);

  const clearFlyoutCloseTimer = useCallback(() => {
    if (flyoutCloseTimerRef.current != null) {
      window.clearTimeout(flyoutCloseTimerRef.current);
      flyoutCloseTimerRef.current = null;
    }
  }, []);

  type FlyoutKind = 'export' | 'copyAs' | 'element' | 'isotope' | 'highlight';

  const openFlyout = useCallback(
    (which: FlyoutKind) => {
      clearFlyoutCloseTimer();
      setExportOpen(which === 'export');
      setCopyAsOpen(which === 'copyAs');
      setElementOpen(which === 'element');
      setIsotopeOpen(which === 'isotope');
      setHighlightOpen(which === 'highlight');
    },
    [clearFlyoutCloseTimer],
  );

  const scheduleCloseFlyout = useCallback(
    (which: FlyoutKind) => {
      clearFlyoutCloseTimer();
      flyoutCloseTimerRef.current = window.setTimeout(() => {
        if (which === 'export') setExportOpen(false);
        if (which === 'copyAs') setCopyAsOpen(false);
        if (which === 'element') setElementOpen(false);
        if (which === 'isotope') setIsotopeOpen(false);
        if (which === 'highlight') setHighlightOpen(false);
        flyoutCloseTimerRef.current = null;
      }, FLYOUT_CLOSE_MS);
    },
    [clearFlyoutCloseTimer],
  );

  const canGroup = selectedAtomIds.length > 0 && Boolean(onGroupSelection);
  const canUngroup =
    selectedAtomIds.length > 0 &&
    Boolean(onUngroupSelection) &&
    selectionIsGrouped(molecule, selectedAtomIds);

  const sruTargetId = menu.sruBracketId ?? selectedSruBracketId ?? null;

  const bondIsDouble = !!menu.bondId && molecule.bonds.some(b => b.id === menu.bondId && b.order === 2);
  const atom = menu.atomId ? molecule.atoms.find(a => a.id === menu.atomId) : null;
  const atomHasAlias =
    !!menu.atomId && molecule.atoms.some(a => a.id === menu.atomId && Boolean(a.alias?.trim()));
  const sixCycleSelected = selectedAtomIds.length === 6 && isSimpleCycleAtomSet(molecule, selectedAtomIds);
  const atomStereoInvertible =
    !!atom &&
    molecule.bonds.some(
      b =>
        (b.fromAtomId === atom.id || b.toAtomId === atom.id) &&
        (b.stereo === 'wedge' || b.stereo === 'dash'),
    );
  const isotopeOptions =
    atom?.element === 'C'
      ? [12, 13, 14]
      : atom?.element === 'H'
        ? [1, 2, 3]
        : atom?.element === 'N'
          ? [14, 15]
          : atom?.element === 'O'
            ? [16, 17, 18]
            : atom?.element === 'S'
              ? [32, 33, 34]
              : [];
  const canAddExplicitH = selectedAtomIds.length > 0 || !!menu.atomId;
  const explicitCarbonIds = (() => {
    const ids = new Set<string>();
    for (const id of selectedAtomIds) {
      const a = molecule.atoms.find(x => x.id === id);
      if (a?.element === 'C' && !a.alias?.trim()) ids.add(a.id);
    }
    if (atom?.element === 'C' && !atom.alias?.trim()) ids.add(atom.id);
    return [...ids];
  })();
  const canToggleExplicitC = explicitCarbonIds.length > 0;
  const showExplicitC = explicitCarbonIds.some(
    id => !molecule.atoms.find(a => a.id === id)?.showElementLabel,
  );

  // Keep the menu inside the viewport: open upward when there is not enough space below.
  useLayoutEffect(() => {
    if (asSheet) {
      setPositionReady(true);
      return;
    }
    setPositionReady(false);
    const el = menuRef.current;
    if (!el) return;
    const pad = 8;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = menu.x;
    let top = menu.y;

    if (top + rect.height > vh - pad) {
      top = menu.y - rect.height;
    }
    if (top < pad) top = pad;
    if (top + rect.height > vh - pad) {
      top = Math.max(pad, vh - rect.height - pad);
    }

    if (left + rect.width > vw - pad) {
      left = vw - rect.width - pad;
    }
    if (left < pad) left = pad;

    setAnchoredPos({ left, top });
    setPositionReady(true);
  }, [asSheet, menu.x, menu.y, menu.atomId, menu.bondId, atomHasAlias, sixCycleSelected, bondIsDouble]);

  const menuBody = (
    <div
      ref={menuRef}
      className={asSheet ? 'context-menu-sheet' : 'context-menu--popup'}
      style={
        asSheet
          ? {
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
            }
          : {
        top: anchoredPos.top,
        left: anchoredPos.left,
        visibility: positionReady ? 'visible' : 'hidden',
            }
      }
    >
      {atom ? (
        <>
          <div style={{ padding: '3px 8px', fontSize: 11, color: '#64748b', fontWeight: 700 }}>
            Atom {atom.element}
            {atom.isotope ? `-${atom.isotope}` : ''}
          </div>

          <div
            ref={elementAnchorRef}
            style={{ width: '100%' }}
            onMouseEnter={() => openFlyout('element')}
            onMouseLeave={() => scheduleCloseFlyout('element')}
          >
            <div
              className="menu-item"
              onClick={e => {
                e.stopPropagation();
                openFlyout('element');
              }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'default' }}
            >
              <span>Change element</span>
              <ChevronRight size={14} color="#64748b" />
            </div>
            <ContextMenuFlyout
              open={elementOpen}
              anchorRef={elementAnchorRef}
              onKeepOpen={() => openFlyout('element')}
              onRequestClose={() => scheduleCloseFlyout('element')}
              minWidth={148}
            >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 42px)',
                    gap: 4,
                  padding: 2,
                  }}
                >
                  {[
                    ...QUICK_ELEMENT_PALETTE.filter(
                      (e): e is { sym: string; color: string } => e !== 'divider',
                    ),
                    ...PERIODIC_TABLE_CELLS.filter(
                      (c): c is NonNullable<typeof c> =>
                        !!c &&
                        ['P', 'F', 'Cl', 'Br', 'I', 'Fe', 'Pt', 'Pd', 'Cu', 'Zn', 'Au'].includes(
                          c.sym,
                        ),
                    ),
                  ].map(entry => (
                    <button
                      key={entry.sym}
                      type="button"
                      onClick={() => onChangeAtomElement(atom.id, entry.sym)}
                      title={`Change atom to ${entry.sym}`}
                      style={{
                        height: 28,
                        border: atom.element === entry.sym ? '1px solid #2563eb' : '1px solid #e2e8f0',
                        background: atom.element === entry.sym ? '#eff6ff' : '#ffffff',
                        color: entry.color,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {entry.sym}
                    </button>
                  ))}
                </div>
            </ContextMenuFlyout>
          </div>

          <div
            ref={isotopeAnchorRef}
            style={{ width: '100%' }}
            onMouseEnter={() => openFlyout('isotope')}
            onMouseLeave={() => scheduleCloseFlyout('isotope')}
          >
            <div
              className="menu-item"
              onClick={e => {
                e.stopPropagation();
                openFlyout('isotope');
              }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'default' }}
            >
              <span>Isotope</span>
              <span style={{ marginLeft: 'auto', color: '#64748b', paddingRight: 6 }}>
                {atom.isotope ?? 'natural'}
              </span>
              <ChevronRight size={14} color="#64748b" />
            </div>
            <ContextMenuFlyout
              open={isotopeOpen}
              anchorRef={isotopeAnchorRef}
              onKeepOpen={() => openFlyout('isotope')}
              onRequestClose={() => scheduleCloseFlyout('isotope')}
              minWidth={148}
                >
                  <button type="button" className="menu-item" onClick={() => onSetAtomIsotope(atom.id, undefined)}>
                    Natural abundance
                  </button>
                  {isotopeOptions.map(iso => (
                    <button
                      key={iso}
                      type="button"
                      className="menu-item"
                      onClick={() => onSetAtomIsotope(atom.id, iso)}
                    >
                  {atom.element === 'H' && iso === 2
                    ? 'D (²H)'
                    : atom.element === 'H' && iso === 3
                      ? 'T (³H)'
                      : `${iso}${atom.element}`}
                    </button>
                  ))}
                  <button type="button" className="menu-item" onClick={() => onCustomAtomIsotope(atom.id)}>
                    Custom...
                  </button>
            </ContextMenuFlyout>
          </div>

          <button className="menu-item" onClick={() => onEditAtomAlias(atom.id)}>
            Set alias / abbreviation
          </button>
          <button className="menu-item" disabled={!atomHasAlias} onClick={() => onClearAtomAlias(atom.id)}>
            Clear alias
          </button>
          <button className="menu-item" onClick={() => onSelectConnectedFragment(atom.id)}>
            Select connected fragment
          </button>
          {atomStereoInvertible ? (
            <button
              className="menu-item"
              onClick={() => onInvertStereoAtAtom(atom.id)}
              title="Flip wedge/hash narrow↔wide on every stereo bond at this atom"
            >
              Invert wedge/hash at this atom
            </button>
          ) : null}

          <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 0' }} />
        </>
      ) : null}

      <div
        ref={copyAsAnchorRef}
        style={{ width: '100%' }}
        onMouseEnter={() => openFlyout('copyAs')}
        onMouseLeave={() => scheduleCloseFlyout('copyAs')}
      >
        <div
          className="menu-item"
          onClick={e => {
            e.stopPropagation();
            openFlyout('copyAs');
          }}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'default' }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Copy size={16} /> Copy as
          </span>
          <ChevronRight size={14} color="#64748b" />
        </div>
        <ContextMenuFlyout
          open={copyAsOpen}
          anchorRef={copyAsAnchorRef}
          onKeepOpen={() => openFlyout('copyAs')}
          onRequestClose={() => scheduleCloseFlyout('copyAs')}
          minWidth={220}
        >
          {COPY_AS_FORMAT_ITEMS.map(item => (
            <button
              key={item.key}
              type="button"
              className="menu-item"
              disabled={!item.available}
              title={item.unavailableReason}
              onClick={() => {
                if (onCopyAs) onCopyAs(item.key);
                else if (item.key === 'smiles') onCopySmiles();
              }}
              style={{ width: '100%', justifyContent: 'flex-start' }}
            >
              {item.label}
            </button>
          ))}
        </ContextMenuFlyout>
      </div>
      {onHighlightColor ? (
        <div
          ref={highlightAnchorRef}
          style={{ width: '100%' }}
          onMouseEnter={() => openFlyout('highlight')}
          onMouseLeave={() => scheduleCloseFlyout('highlight')}
        >
          <div
            className="menu-item"
            onClick={e => {
              e.stopPropagation();
              openFlyout('highlight');
            }}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'default' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Highlighter size={16} /> Highlight
            </span>
            <ChevronRight size={14} color="#64748b" />
          </div>
          <ContextMenuFlyout
            open={highlightOpen}
            anchorRef={highlightAnchorRef}
            onKeepOpen={() => openFlyout('highlight')}
            onRequestClose={() => scheduleCloseFlyout('highlight')}
            minWidth={168}
          >
            <div className="context-menu-highlight-swatches" role="group" aria-label="Highlight color">
              {COLOR_PRESETS.map(hex => (
                <button
                  key={hex}
                  type="button"
                  className="context-menu-highlight-swatch"
                  style={{ background: hex }}
                  title={hex}
                  aria-label={`Highlight ${hex}`}
                  onClick={() => onHighlightColor(hex)}
                />
              ))}
            </div>
            <button
              type="button"
              className="menu-item"
              onClick={() => onHighlightColor(null)}
              style={{ width: '100%', justifyContent: 'flex-start' }}
            >
              None
            </button>
          </ContextMenuFlyout>
        </div>
      ) : null}
      <button className="menu-item" onClick={onPasteSmiles}>
        <ClipboardPaste size={16} /> Paste structure / coords / image
      </button>

      {onGroupSelection || onUngroupSelection ? (
        <>
          <button
            className="menu-item"
            disabled={!canGroup}
            onClick={onGroupSelection}
            title={canGroup ? 'Group selected molecules' : 'Select atoms to group'}
          >
            <Group size={16} /> Group
          </button>
          <button
            className="menu-item"
            disabled={!canUngroup}
            onClick={onUngroupSelection}
            title={
              canUngroup
                ? 'Ungroup into individual molecules'
                : 'Selection is not in a group'
            }
          >
            <Ungroup size={16} /> Ungroup
          </button>
        </>
      ) : null}

      <button
        className="menu-item"
        disabled={selectedAtomIds.length !== 2}
        onClick={onSwapSelectedAtomPositions}
        title={
          selectedAtomIds.length !== 2
            ? 'Select exactly two atoms to swap their positions'
            : 'Swap canvas positions of the two selected atoms'
        }
      >
        <ArrowLeftRight size={16} /> Swap positions (2 atoms)
      </button>

      {menu.bondId ? (
        <button className="menu-item" onClick={() => onLaunchNewman(menu.bondId!)}>
          <CopyPlus size={16} /> Newman Projection
        </button>
      ) : null}
      {bondIsDouble ? (
        <button className="menu-item" onClick={() => onLaunchEZ(menu.bondId!)}>
          <Wand2 size={16} /> E/Z Analyzer
        </button>
      ) : null}
      {sixCycleSelected ? (
        <button className="menu-item" onClick={onLaunchChairBoat}>
          <Hexagon size={16} /> Chair/Boat Cyclohexane
        </button>
      ) : null}
      {atomHasAlias ? (
        <button
          className="menu-item"
          onClick={() => onExpandAlias(menu.atomId!)}
          title="Expand this abbreviation into full atom structure"
        >
          <FlaskConical size={16} /> Show as Full Structure
        </button>
      ) : null}
      {menu.atomId && detectedAliasAtCursor ? (
        <button
          className="menu-item"
          onClick={() => onCollapseToAlias(menu.atomId!, detectedAliasAtCursor)}
          title="Collapse recognized local motif back to abbreviation"
        >
          <CopyPlus size={16} /> Collapse to {detectedAliasAtCursor}
        </button>
      ) : null}
      <button
        className="menu-item"
        disabled={selectedAtomIds.length < 3}
        onClick={onLaunchFischer}
        title={selectedAtomIds.length < 3 ? 'Select 3+ carbon atoms in a chain first' : 'Generate Fischer projection'}
      >
        <FlaskConical size={16} /> Fischer Projection
      </button>
      {sruTargetId ? (
        <button
          className="menu-item"
          onClick={() => onEditSruBracketSubscript(sruTargetId)}
          title="Edit the repeat subscript (n, m, …)"
        >
          <Wand2 size={16} /> Edit repeat subscript…
        </button>
      ) : null}

      {canAddExplicitH || onToggleAllExplicitHydrogens || canToggleExplicitC ? (
        <>
          <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 0' }} />
          {canToggleExplicitC ? (
            <button
              type="button"
              className="menu-item"
              onClick={onToggleExplicitCarbonLabel}
              title={
                showExplicitC
                  ? explicitCarbonIds.length > 1
                    ? `Show C with bonded hydrogens on ${explicitCarbonIds.length} selected carbons`
                    : 'Show C with bonded hydrogens (CH, CH₂, …) for teaching / mechanisms'
                  : explicitCarbonIds.length > 1
                    ? `Hide explicit C labels on ${explicitCarbonIds.length} selected carbons`
                    : 'Hide the explicit C label (back to skeletal vertex)'
              }
            >
              {showExplicitC
                ? explicitCarbonIds.length > 1
                  ? `Show as explicit C (${explicitCarbonIds.length})`
                  : 'Show as explicit C'
                : explicitCarbonIds.length > 1
                  ? `Hide explicit C (${explicitCarbonIds.length})`
                  : 'Hide explicit C'}
            </button>
          ) : null}
          {canAddExplicitH ? (
            <button
              type="button"
              className="menu-item"
              onClick={onAddExplicitHydrogen}
              title="Add one bonded H to the selected atom (e.g. aldehyde carbonyl)"
            >
              Add explicit H
            </button>
          ) : null}
          {onToggleAllExplicitHydrogens ? (
            <button
              type="button"
              className="menu-item"
              disabled={unfoldHydrogensDisabled}
              title={
                unfoldHydrogensTitle ??
                (hasExplicitHydrogens
                  ? 'Fold all explicit hydrogens (remove H atoms)'
                  : 'Unfold all explicit hydrogens (add H atoms everywhere)')
              }
              onClick={onToggleAllExplicitHydrogens}
            >
              {hasExplicitHydrogens ? 'Fold all hydrogens' : 'Unfold all hydrogens'}
            </button>
          ) : null}
        </>
      ) : null}

      <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 0' }} />

      {asSheet ? (
        <>
          <div className="app-top-bar__file-menu-section">Export</div>
          {EXPORT_ITEMS.map(({ key, label, ext, icon }) => (
            <button
              key={key}
              type="button"
              className="mobile-sheet-list__btn"
              onClick={() => onDownload(key)}
            >
              {icon(14)}
              <span className="app-top-bar__file-menu-flyout-label">{label}</span>
              <span className="app-top-bar__file-submenu-ext">{ext}</span>
            </button>
          ))}
        </>
      ) : (
        <div
          ref={exportAnchorRef}
          style={{ width: '100%' }}
          onMouseEnter={() => openFlyout('export')}
          onMouseLeave={() => scheduleCloseFlyout('export')}
        >
          <div
            className="menu-item"
            onClick={e => {
              e.stopPropagation();
              openFlyout('export');
            }}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'default' }}
          >
            <span>Export</span>
            <ChevronRight size={14} color="#64748b" />
          </div>
          <ContextMenuFlyout
            open={exportOpen}
            anchorRef={exportAnchorRef}
            onKeepOpen={() => openFlyout('export')}
            onRequestClose={() => scheduleCloseFlyout('export')}
            minWidth={192}
          >
            {EXPORT_ITEMS.map(({ key, label, icon }) => (
              <button
                key={key}
                type="button"
                className="menu-item"
                onClick={() => onDownload(key)}
                style={{ width: '100%', justifyContent: 'flex-start', gap: '10px' }}
              >
                {icon(16)}
                {label}
              </button>
            ))}
          </ContextMenuFlyout>
        </div>
      )}
    </div>
  );

  if (asSheet) {
    return (
      <MobileBottomSheet
        open
        onClose={onDismiss ?? (() => undefined)}
        title="Actions"
        size="auto"
        className="mobile-sheet--menu"
      >
        {menuBody}
      </MobileBottomSheet>
    );
  }
  return menuBody;
}
