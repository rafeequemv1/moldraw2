/**
 * Top-bar Select menu: tools + frequent actions on top; nested submenus for the rest.
 * Submenus portal to document.body with fixed coords so they are not clipped by
 * the parent menu's overflow.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { anchoredMenuStyle, placeAnchoredMenu, type AnchoredMenuPos } from '../menuPlacement';
import { ChevronDown, ChevronRight, MousePointer2 } from 'lucide-react';
import type { Molecule } from '@moldraw/domain';
import {
  presentElements,
  type QuickSelectActionId,
  type QuickSelectOptions,
} from '../selection/quickSelect';
import {
  formatPrimaryShortcut,
  primaryToolShortcutLabel,
  quickSelectShortcutActionId,
  resolveShortcutBindings,
  type ShortcutBindingsMap,
} from '../keyboard/shortcutBindings';

export type SelectToolId = 'select' | 'lasso_select';

type ActionItem = {
  id: QuickSelectActionId;
  label: string;
  hint: string;
  options?: QuickSelectOptions;
  /** Disable when selection is empty. */
  needsSelection?: boolean;
};

type SubmenuId = 'element' | 'structure' | 'stereo' | 'bonds';

type MenuRow =
  | { kind: 'tool'; id: SelectToolId; label: string; hint: string }
  | { kind: 'action'; item: ActionItem }
  | { kind: 'submenu'; id: SubmenuId; label: string; hint: string }
  | { kind: 'sep' };

const TOP_ROWS: MenuRow[] = [
  {
    kind: 'tool',
    id: 'select',
    label: 'Select atoms',
    hint: 'Click atoms/bonds; drag empty canvas for marquee',
  },
  {
    kind: 'tool',
    id: 'lasso_select',
    label: 'Lasso',
    hint: 'Freehand lasso selection',
  },
  { kind: 'sep' },
  {
    kind: 'action',
    item: {
      id: 'all_atoms',
      label: 'Select all',
      hint: 'Select every object on the canvas',
    },
  },
  {
    kind: 'action',
    item: {
      id: 'deselect',
      label: 'Deselect',
      hint: 'Clear the current selection',
    },
  },
  {
    kind: 'action',
    item: {
      id: 'invert',
      label: 'Invert selection',
      hint: 'Select atoms that are currently unselected',
    },
  },
  {
    kind: 'action',
    item: {
      id: 'connected',
      label: 'Select connected',
      hint: 'Expand to whole fragment(s) containing the selection',
    },
  },
  {
    kind: 'action',
    item: {
      id: 'grow',
      label: 'Grow selection',
      hint: 'Add neighboring atoms',
      needsSelection: true,
    },
  },
  {
    kind: 'action',
    item: {
      id: 'same_as_selection',
      label: 'Same as selection',
      hint: 'Match element or alias of the current pick',
      needsSelection: true,
    },
  },
  { kind: 'sep' },
  {
    kind: 'action',
    item: {
      id: 'all_rings',
      label: 'Select all rings',
      hint: 'Union of all SSSR rings',
    },
  },
  {
    kind: 'action',
    item: {
      id: 'heteroatoms',
      label: 'Select heteroatoms',
      hint: 'Non-carbon, non-hydrogen atoms',
    },
  },
  { kind: 'sep' },
  {
    kind: 'submenu',
    id: 'element',
    label: 'By element',
    hint: 'Select all atoms of one element',
  },
  {
    kind: 'submenu',
    id: 'structure',
    label: 'Structure…',
    hint: 'Chains, ring sizes, aromatic, charged',
  },
  {
    kind: 'submenu',
    id: 'stereo',
    label: 'Stereo & labels…',
    hint: 'Wedge/dash, CIP R/S, aliases / R-groups',
  },
  {
    kind: 'submenu',
    id: 'bonds',
    label: 'Bonds…',
    hint: 'Bond selection helpers',
  },
];

const STRUCTURE_ITEMS: ActionItem[] = [
  {
    id: 'chain',
    label: 'Chain atoms',
    hint: 'Atoms not in any ring',
  },
  {
    id: 'longest_path',
    label: 'Longest path',
    hint: 'Longest simple path heuristic',
  },
  {
    id: 'side_chains',
    label: 'Side chains',
    hint: 'Acyclic substituents attached to rings',
  },
  {
    id: 'ring_size',
    label: 'All 3-rings',
    hint: 'Atoms in 3-membered rings',
    options: { ringSize: 3 },
  },
  {
    id: 'ring_size',
    label: 'All 4-rings',
    hint: 'Atoms in 4-membered rings',
    options: { ringSize: 4 },
  },
  {
    id: 'ring_size',
    label: 'All 5-rings',
    hint: 'Atoms in 5-membered rings',
    options: { ringSize: 5 },
  },
  {
    id: 'ring_size',
    label: 'All 6-rings',
    hint: 'Atoms in 6-membered rings',
    options: { ringSize: 6 },
  },
  {
    id: 'ring_size',
    label: 'All 7-rings',
    hint: 'Atoms in 7-membered rings',
    options: { ringSize: 7 },
  },
  {
    id: 'ring_size',
    label: 'All 8-rings',
    hint: 'Atoms in 8-membered rings',
    options: { ringSize: 8 },
  },
  {
    id: 'aromatic',
    label: 'Aromatic',
    hint: 'Atoms on aromatic bonds',
  },
  {
    id: 'charged',
    label: 'Charged',
    hint: 'Atoms with a formal charge',
  },
];

const STEREO_ITEMS: ActionItem[] = [
  {
    id: 'stereo_wedge_dash',
    label: 'Wedge / dash atoms',
    hint: 'Atoms on stereo wedge or dash bonds',
  },
  {
    id: 'stereo_cip',
    label: 'CIP R / S centers',
    hint: 'Uses Indigo CIP tags when available',
  },
  {
    id: 'aliases',
    label: 'Aliases / R-groups',
    hint: 'Atoms with a typed alias label',
  },
];

const BOND_ITEMS: ActionItem[] = [
  {
    id: 'bonds_in_selection',
    label: 'Bonds in selection',
    hint: 'Bonds whose both ends are selected',
    needsSelection: true,
  },
  {
    id: 'all_bonds',
    label: 'All bonds',
    hint: 'Bond selection only (clears atom selection)',
  },
];

const SUBMENU_GAP = 4;
const SUBMENU_VIEW_PAD = 8;

export interface TopBarSelectMenuProps {
  activeTool: string;
  molecule: Molecule;
  selectedAtomIds: string[];
  onSelectTool: (toolId: SelectToolId) => void;
  onQuickSelect: (action: QuickSelectActionId, options?: QuickSelectOptions) => void;
  disabled?: boolean;
  /** Phone/tablet: same menu, icon-only trigger (no “Select” label). */
  iconOnly?: boolean;
  /** Persisted Settings → Shortcuts overrides (live chords in the menu). */
  shortcutOverrides?: ShortcutBindingsMap | null;
}

export function TopBarSelectMenu({
  activeTool,
  molecule,
  selectedAtomIds,
  onSelectTool,
  onQuickSelect,
  disabled = false,
  iconOnly = false,
  shortcutOverrides = null,
}: TopBarSelectMenuProps) {
  const [open, setOpen] = useState(false);
  const [openSub, setOpenSub] = useState<SubmenuId | null>(null);
  const [subPos, setSubPos] = useState<{ top: number; left: number } | null>(null);
  const [menuPos, setMenuPos] = useState<AnchoredMenuPos | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const subAnchorRefs = useRef<Partial<Record<SubmenuId, HTMLButtonElement | null>>>({});
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const hasSelection = selectedAtomIds.length > 0;

  const elements = useMemo(() => presentElements(molecule), [molecule]);
  const bindings = useMemo(
    () => resolveShortcutBindings(shortcutOverrides),
    [shortcutOverrides],
  );
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

  const shortcutForAction = (item: ActionItem): string | undefined => {
    const id = quickSelectShortcutActionId(item.id, item.options);
    if (!id) return undefined;
    return formatPrimaryShortcut(id, bindings, isMac);
  };
  const closeMenu = () => {
    setOpen(false);
    setOpenSub(null);
    setSubPos(null);
  };

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setMenuPos(null);
      return;
    }
    const placeMain = () => {
      const el = rootRef.current;
      if (!el) return;
      const measured = menuRef.current?.offsetHeight ?? 320;
      setMenuPos(placeAnchoredMenu(el.getBoundingClientRect(), { menuWidth: 200, menuHeight: measured }));
    };
    placeMain();
    const raf = window.requestAnimationFrame(placeMain);
    window.addEventListener('resize', placeMain);
    window.addEventListener('scroll', placeMain, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', placeMain);
      window.removeEventListener('scroll', placeMain, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !openSub) return;
    const anchor = subAnchorRefs.current[openSub];
    if (!anchor) return;

    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const panel = submenuRef.current;
      const panelW = panel?.offsetWidth ?? 168;
      const panelH = panel?.offsetHeight ?? 240;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let left = rect.right + SUBMENU_GAP;
      if (left + panelW > vw - SUBMENU_VIEW_PAD) {
        left = Math.max(SUBMENU_VIEW_PAD, rect.left - SUBMENU_GAP - panelW);
      }

      let top = rect.top;
      if (top + panelH > vh - SUBMENU_VIEW_PAD) {
        top = Math.max(SUBMENU_VIEW_PAD, vh - SUBMENU_VIEW_PAD - panelH);
      }
      setSubPos({ top, left });
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
  }, [open, openSub, elements.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: Event) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      if (submenuRef.current?.contains(t)) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (openSub) {
          setOpenSub(null);
          setSubPos(null);
        } else {
          closeMenu();
        }
      }
    };
    const t = window.setTimeout(() => {
      document.addEventListener('pointerdown', onDoc);
    }, 0);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, openSub]);

  const selectToolActive =
    activeTool === 'select' ||
    activeTool === 'lasso_select';

  const runAction = (item: ActionItem) => {
    if (item.needsSelection && !hasSelection) return;
    onQuickSelect(item.id, item.options);
    closeMenu();
  };

  const renderActionButton = (item: ActionItem, key: string) => {
    const disabledItem = !!(item.needsSelection && !hasSelection);
    const shortcut = shortcutForAction(item);
    return (
      <button
        key={key}
        type="button"
        role="menuitem"
        className="app-top-bar__select-item"
        title={item.hint}
        disabled={disabledItem}
        onClick={() => runAction(item)}
      >
        <span className="app-top-bar__select-item-label">{item.label}</span>
        {shortcut ? (
          <span className="app-top-bar__select-item-shortcut">{shortcut}</span>
        ) : null}
      </button>
    );
  };

  const submenuItems = (id: SubmenuId): ActionItem[] => {
    switch (id) {
      case 'structure':
        return STRUCTURE_ITEMS;
      case 'stereo':
        return STEREO_ITEMS;
      case 'bonds':
        return BOND_ITEMS;
      default:
        return [];
    }
  };

  const openSubmenuContent =
    open && openSub
      ? openSub === 'element'
        ? elements.length === 0
          ? [<div key="empty" className="app-top-bar__select-empty">No atoms</div>]
          : elements.map(el =>
              renderActionButton(
                {
                  id: 'same_element',
                  label: el,
                  hint: `Select all ${el} atoms`,
                  options: { element: el },
                },
                `el-${el}`,
              ),
            )
        : submenuItems(openSub).map((item, i) =>
            renderActionButton(
              item,
              `${openSub}-${item.id}-${item.options?.ringSize ?? i}`,
            ),
          )
      : null;

  return (
    <div className="app-top-bar__select-wrap" ref={rootRef}>
      <button
        type="button"
        className={`app-top-bar__select-trigger${iconOnly ? ' app-top-bar__select-trigger--icon' : ''}${selectToolActive ? ' is-active' : ''}${open ? ' is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        title="Selection tools and quick selects"
        aria-label="Select"
        onClick={() => (open ? closeMenu() : setOpen(true))}
      >
        {iconOnly ? (
          <MousePointer2 size={16} strokeWidth={2} aria-hidden />
        ) : (
          <>
            <span>Select</span>
            <ChevronDown size={11} strokeWidth={2} aria-hidden />
          </>
        )}
      </button>
      {open && menuPos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              className="app-top-bar__select-menu app-top-bar__select-menu--portal"
              id={menuId}
              role="menu"
              style={anchoredMenuStyle(menuPos)}
            >
              {TOP_ROWS.map((row, index) => {
                if (row.kind === 'sep') {
                  return (
                    <div key={`sep-${index}`} className="app-top-bar__select-sep" role="separator" />
                  );
                }
                if (row.kind === 'tool') {
                  const isActive = activeTool === row.id;
                  const toolShortcut = primaryToolShortcutLabel(row.id, bindings);
                  return (
                    <button
                      key={row.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isActive}
                      className={`app-top-bar__select-item${isActive ? ' is-active' : ''}`}
                      title={row.hint}
                      onClick={() => {
                        onSelectTool(row.id);
                        closeMenu();
                      }}
                    >
                      <span className="app-top-bar__select-item-label">{row.label}</span>
                      {toolShortcut ? (
                        <span className="app-top-bar__select-item-shortcut">{toolShortcut}</span>
                      ) : null}
                    </button>
                  );
                }
                if (row.kind === 'action') {
                  return renderActionButton(row.item, row.item.id);
                }
                const isSubOpen = openSub === row.id;
                return (
                  <div key={row.id} className="app-top-bar__select-subwrap">
                    <button
                      type="button"
                      role="menuitem"
                      aria-haspopup="menu"
                      aria-expanded={isSubOpen}
                      className={`app-top-bar__select-item app-top-bar__select-item--submenu${isSubOpen ? ' is-open' : ''}`}
                      title={row.hint}
                      ref={el => {
                        subAnchorRefs.current[row.id] = el;
                      }}
                      onClick={() => setOpenSub(isSubOpen ? null : row.id)}
                      onMouseEnter={() => setOpenSub(row.id)}
                    >
                      <span className="app-top-bar__select-item-label">{row.label}</span>
                      <ChevronRight size={12} strokeWidth={2} aria-hidden />
                    </button>
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
      {openSubmenuContent && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={submenuRef}
              className="app-top-bar__select-submenu"
              role="menu"
              style={
                subPos
                  ? { top: subPos.top, left: subPos.left, visibility: 'visible', zIndex: 25000 }
                  : { top: 0, left: 0, visibility: 'hidden', zIndex: 25000 }
              }
            >
              {openSubmenuContent}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
