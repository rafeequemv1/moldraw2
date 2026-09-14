/**
 * Single source of truth for shortcut *documentation* strings (tooltips, modal).
 * Actual key handling lives in `useKeyboardShortcuts.ts` — keep behavior and labels aligned.
 */

export interface ShortcutRow {
  label: string;
  /** Each inner array is one key chord shown as joined keys (e.g. Ctrl + Z). */
  keys: string[][];
}

export interface ShortcutGroup {
  title: string;
  rows: ShortcutRow[];
}

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
      { label: 'Zoom toward pointer', keys: [['Scroll', 'wheel']] },
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
    rows: [
      { label: 'Carbon', keys: [['C']] },
      { label: 'Nitrogen', keys: [['N']] },
      { label: 'Oxygen', keys: [['O']] },
      { label: 'Sulfur', keys: [['S']] },
      { label: 'Phosphorus', keys: [['P']] },
      { label: 'Fluorine', keys: [['F']] },
      { label: 'Hydrogen', keys: [['H']] },
      { label: 'Chlorine', keys: [['Shift', 'C']] },
      { label: 'Bromine', keys: [['Shift', 'B']] },
      { label: 'Iodine', keys: [['Shift', 'I']] },
    ],
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

/** Keyboard hint for placement palette symbols (matches `useKeyboardShortcuts`). */
const PLACEMENT_KEY_BY_SYMBOL: Record<string, string> = {
  C: 'C',
  N: 'N',
  O: 'O',
  S: 'S',
  P: 'P',
  F: 'F',
  H: 'H',
  Cl: 'Shift+C',
  Br: 'Shift+B',
  I: 'Shift+I',
};

export function placementPaletteShortcutLabel(symbol: string): string | undefined {
  return PLACEMENT_KEY_BY_SYMBOL[symbol];
}
