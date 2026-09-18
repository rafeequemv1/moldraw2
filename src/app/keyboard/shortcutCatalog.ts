/**
 * Single source of truth for shortcut *documentation* strings (tooltips, modal).
 * Actual key handling lives in `useKeyboardShortcuts.ts`.
 * Atom-palette keys are read from `DEFAULT_SHORTCUT_BINDINGS` so tooltips and
 * the shortcuts modal cannot drift from the handler.
 */
import {
  DEFAULT_SHORTCUT_BINDINGS,
  formatChordKeys,
  type ShortcutActionId,
} from './shortcutBindings';

export interface ShortcutRow {
  label: string;
  /** Each inner array is one key chord shown as joined keys (e.g. Ctrl + Z). */
  keys: string[][];
}

export interface ShortcutGroup {
  title: string;
  rows: ShortcutRow[];
}

/** Quick-palette atoms. Order matches the shortcuts modal. Keys come from bindings. */
const ATOM_PLACEMENT: { symbol: string; action: ShortcutActionId; label: string }[] = [
  { symbol: 'C', action: 'elementC', label: 'Carbon' },
  { symbol: 'N', action: 'elementN', label: 'Nitrogen' },
  { symbol: 'O', action: 'elementO', label: 'Oxygen' },
  { symbol: 'S', action: 'elementS', label: 'Sulfur' },
  { symbol: 'P', action: 'elementP', label: 'Phosphorus' },
  { symbol: 'F', action: 'elementF', label: 'Fluorine' },
  { symbol: 'H', action: 'elementH', label: 'Hydrogen' },
  { symbol: 'Cl', action: 'elementCl', label: 'Chlorine' },
  { symbol: 'Br', action: 'elementBr', label: 'Bromine' },
  { symbol: 'I', action: 'elementI', label: 'Iodine' },
];

function atomPlacementChordLabel(action: ShortcutActionId): string[] | undefined {
  const chord = DEFAULT_SHORTCUT_BINDINGS[action]?.[0];
  if (!chord) return undefined;
  return formatChordKeys(chord);
}

const ATOM_PLACEMENT_ROWS: ShortcutRow[] = ATOM_PLACEMENT.map(({ label, action }) => {
  const keys = atomPlacementChordLabel(action);
  return { label, keys: keys ? [keys] : [] };
});

const ATOM_SHORTCUT_LABEL: Record<string, string> = Object.fromEntries(
  ATOM_PLACEMENT.flatMap(({ symbol, action }) => {
    const keys = atomPlacementChordLabel(action);
    return keys ? [[symbol, keys.join('+')]] : [];
  }),
);

/** Groups rendered in the keyboard shortcuts modal (order preserved). */
export const SHORTCUT_MODAL_GROUPS: ShortcutGroup[] = [
  {
    title: 'Editing',
    rows: [
      { label: 'Cancel edit / clear selection / close menus', keys: [['Esc']] },
      { label: 'Erase selected object', keys: [['Delete'], ['Backspace']] },
      { label: 'Undo', keys: [['Ctrl', 'Z']] },
      { label: 'Redo', keys: [['Ctrl', 'Y'], ['Ctrl', 'Shift', 'Z']] },
      { label: 'Select all', keys: [['Ctrl', 'A']] },
      { label: 'Copy fragment', keys: [['Ctrl', 'C']] },
      { label: 'Paste fragment', keys: [['Ctrl', 'V']] },
      { label: 'Save entire canvas (.moldraw)', keys: [['Ctrl', 'S']] },
    ],
  },
  {
    title: 'Selection (Select menu)',
    rows: [
      { label: 'Deselect', keys: [['Ctrl', 'Shift', 'A']] },
      { label: 'Invert selection', keys: [['Ctrl', 'Shift', 'I']] },
      { label: 'Select connected', keys: [['Ctrl', 'Shift', 'C']] },
      { label: 'Grow selection', keys: [['Ctrl', 'Shift', 'G']] },
      { label: 'Same as selection', keys: [['Ctrl', 'Shift', 'S']] },
      { label: 'Select all rings', keys: [['Ctrl', 'Shift', 'R']] },
      { label: 'Select heteroatoms', keys: [['Ctrl', 'Shift', 'H']] },
      { label: 'Chain atoms', keys: [['Alt', 'Shift', 'C']] },
      { label: 'Longest path', keys: [['Alt', 'Shift', 'L']] },
      { label: 'Side chains', keys: [['Alt', 'Shift', 'S']] },
      { label: 'All 5-rings', keys: [['Alt', 'Shift', '5']] },
      { label: 'All 6-rings', keys: [['Alt', 'Shift', '6']] },
      { label: 'Aromatic atoms', keys: [['Alt', 'Shift', 'A']] },
      { label: 'Charged atoms', keys: [['Alt', 'Shift', 'Q']] },
      { label: 'Wedge / dash atoms', keys: [['Alt', 'Shift', 'W']] },
      { label: 'CIP R / S centers', keys: [['Alt', 'Shift', 'R']] },
      { label: 'Aliases / R-groups', keys: [['Alt', 'Shift', 'G']] },
      { label: 'Bonds in selection', keys: [['Alt', 'Shift', 'B']] },
      { label: 'All bonds', keys: [['Ctrl', 'Alt', 'B']] },
      { label: 'Select tool', keys: [['V']] },
      { label: 'Lasso select tool', keys: [['L']] },
    ],
  },
  {
    title: 'Navigation',
    rows: [
      { label: 'Pan canvas (hand tool)', keys: [['Hand', 'drag']] },
      { label: 'Temporary pan (hold, then drag)', keys: [['Space', 'drag']] },
      { label: 'Pan', keys: [['Middle-click', 'drag']] },
      { label: 'Pan vertically', keys: [['Scroll', 'wheel']] },
      { label: 'Pan horizontally', keys: [['Shift', 'Scroll']] },
      { label: 'Zoom toward pointer', keys: [['Ctrl', 'Scroll'], ['⌘', 'Scroll']] },
      { label: 'Zoom in', keys: [['Ctrl', '='], ['Ctrl', '+']] },
      { label: 'Zoom out', keys: [['Ctrl', '-']] },
      { label: 'Reset zoom (100%)', keys: [['Ctrl', '1']] },
      { label: 'Fit all objects', keys: [['Ctrl', '0']] },
      { label: 'Pinch zoom', keys: [['Two-finger', 'pinch']] },
      { label: 'Two-finger pan', keys: [['Two-finger', 'drag']] },
      { label: 'Touch pan on empty canvas', keys: [['Touch', 'drag']] },
    ],
  },
  {
    title: 'Tools',
    rows: [
      { label: 'Single bond', keys: [['1']] },
      { label: 'Double bond', keys: [['2']] },
      { label: 'Triple bond', keys: [['3']] },
      { label: 'Benzene ring', keys: [['B']] },
      { label: 'Select tool', keys: [['V']] },
      { label: 'Lasso select tool', keys: [['L']] },
      { label: 'Open this shortcuts panel', keys: [['?'], ['Shift', '/']] },
    ],
  },
  {
    title: 'Atom labels (placement element when no atom selected)',
    rows: ATOM_PLACEMENT_ROWS,
  },
  {
    title: 'Type-to-rename (one atom selected)',
    rows: [
      { label: 'Open inline label editor seeded with letter', keys: [['A', '–', 'Z']] },
      { label: 'Multi-char symbols (Cl, Si, Br) — keep typing', keys: [['C', '+', 'l']] },
      { label: 'Abbreviations (Me, Et, Ph, Boc, OMe, NH2, …)', keys: [['type', 'group']] },
      { label: 'Accept suggestion', keys: [['Tab'], ['Enter']] },
      { label: 'Commit current text', keys: [['Enter']] },
      { label: 'Cancel', keys: [['Esc']] },
      { label: 'Quick rename (select tool)', keys: [['Double-click', 'atom']] },
    ],
  },
  {
    title: '3D Structure Perspective',
    rows: [
      {
        label: '3D Clean Up (canvas pose — then drag to rotate)',
        keys: [['Ctrl', 'Shift', 'D'], ['⌘', 'Shift', 'D']],
      },
      {
        label: 'Perspective tool / toggle depth shading',
        keys: [['Alt', 'D']],
      },
    ],
  },
  {
    title: 'Modifiers & canvas',
    rows: [
      {
        label: 'Select entire connected molecule (atom or bond)',
        keys: [['Ctrl', 'click'], ['⌘', 'click']],
      },
      {
        label: 'Add / toggle atom or bond in selection',
        keys: [['Shift', 'click']],
      },
      {
        label: 'Esc priority: alias editor → deselect text → deselect arrow → clear atoms → close menu → select tool',
        keys: [['Esc']],
      },
      {
        label: 'Select tool on empty canvas: drag rectangle (marquee); Shift+drag for lasso',
        keys: [['Shift', 'drag']],
      },
      {
        label: 'Rebind shortcuts in Settings → Shortcuts',
        keys: [['Settings']],
      },
      { label: 'Undo / redo / copy / paste use Ctrl on Windows/Linux or ⌘ on macOS', keys: [['Ctrl']] },
    ],
  },
];

/** Primary single-key shortcut for toolbar tool ids (undefined = no dedicated key). */
export const TOOL_PRIMARY_SHORTCUT: Partial<Record<string, string>> = {
  single_bond: '1',
  double_bond: '2',
  triple_bond: '3',
  benzene: 'B',
  select: 'V',
  lasso_select: 'L',
};

/** Suffix for toolbar button title, e.g. " Keyboard: 1" */
export function tooltipShortcutSuffix(toolId: string): string {
  const k = TOOL_PRIMARY_SHORTCUT[toolId];
  return k ? ` Keyboard: ${k}` : '';
}

/** Keyboard hint for placement palette symbols (matches `useKeyboardShortcuts` and the modal). */
export function placementPaletteShortcutLabel(symbol: string): string | undefined {
  return ATOM_SHORTCUT_LABEL[symbol];
}
