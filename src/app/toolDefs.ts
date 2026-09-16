/**
 * Definitions for every drawing tool exposed in the toolbar.
 * Static data only — no React. Icon rendering lives in `./toolIcons`.
 */

import type { CanvasShapeKind } from '@moldraw/domain';

export type ToolCategory = 'bonds' | 'rings' | 'stereo' | 'edit';
export type ToolGroup = 'select_edit' | 'bond_types' | 'rings' | 'stereo' | 'annotate' | 'templates';

/** Unified shape-menu values (annotation draw kinds). */
export type ShapeMenuValue = CanvasShapeKind;

/** SRU bracket repeat-label presets (subscript text). */
export type SruBracketSubscript = 'n' | 'm' | '(CH2)n' | '-(CH2)n-';

export const SRU_BRACKET_SUBSCRIPT_OPTIONS: { value: SruBracketSubscript; label: string }[] = [
  { value: 'n', label: 'Polymer (n)' },
  { value: '(CH2)n', label: '(CH₂)n' },
  { value: '-(CH2)n-', label: '-(CH₂)n-' },
  { value: 'm', label: 'Copolymer (m)' },
];

export interface ToolDef {
  id: string;
  label: string;
  shortLabel?: string;
  title: string;
  category: ToolCategory;
  group: ToolGroup;
}

export const TOOL_DEFS: ToolDef[] = [
  { id: 'hand', label: 'Hand', title: 'Pan canvas — drag to move the view', category: 'edit', group: 'select_edit' },
  { id: 'select', label: 'Select', title: 'Select (Spacebar temporarily). Shift+drag on empty canvas: lasso; drag without Shift: rectangle.', category: 'edit', group: 'select_edit' },
  { id: 'lasso_select', label: 'Lasso', title: 'Lasso Select', category: 'edit', group: 'select_edit' },
  { id: 'erase', label: 'Erase', title: 'Erase', category: 'edit', group: 'select_edit' },
  { id: 'single_bond', label: 'Single', title: 'Single Bond', category: 'bonds', group: 'bond_types' },
  { id: 'double_bond', label: 'Double', title: 'Double Bond', category: 'bonds', group: 'bond_types' },
  { id: 'triple_bond', label: 'Triple', title: 'Triple Bond', category: 'bonds', group: 'bond_types' },
  {
    id: 'aromatic_bond',
    label: 'Aromatic',
    shortLabel: 'Arom',
    title: 'Aromatic bond (molfile type 4; solid inner circle in rings)',
    category: 'bonds',
    group: 'bond_types',
  },
  { id: 'wedge_bond', label: 'Wedge up', shortLabel: 'Up', title: 'Wedge up (solid stereo)', category: 'stereo', group: 'bond_types' },
  { id: 'dash_bond', label: 'Hash down', shortLabel: 'Down', title: 'Hashed wedge down', category: 'stereo', group: 'bond_types' },
  {
    id: 'either_bond',
    label: 'Wedge/hash',
    shortLabel: 'Up/Dn',
    title: 'Wedge/hash unknown stereo (either tetrahedral)',
    category: 'stereo',
    group: 'bond_types',
  },
  { id: 'wavy_bond', label: 'Wavy', shortLabel: 'Wavy', title: 'Wavy / either stereo (unknown)', category: 'stereo', group: 'bond_types' },
  {
    id: 'cis_trans_bond',
    label: 'Cis/trans',
    shortLabel: 'E/Z',
    title: 'Cis/trans double — unspecified E/Z (crossed double)',
    category: 'stereo',
    group: 'bond_types',
  },
  {
    id: 'dative_bond',
    label: 'Dative',
    shortLabel: 'Dat',
    title: 'Dative / coordinate bond (dashed arrow; metal ligands)',
    category: 'bonds',
    group: 'bond_types',
  },
  {
    id: 'any_bond',
    label: 'Any',
    shortLabel: 'Any',
    title: 'Any bond (query, molfile type 8)',
    category: 'bonds',
    group: 'bond_types',
  },
  {
    id: 'single_double_bond',
    label: 'Single/double',
    shortLabel: '1/2',
    title: 'Single or double (query, molfile type 5)',
    category: 'bonds',
    group: 'bond_types',
  },
  {
    id: 'single_aromatic_bond',
    label: 'Single/arom.',
    shortLabel: '1/arom',
    title: 'Single or aromatic (query, molfile type 6)',
    category: 'bonds',
    group: 'bond_types',
  },
  {
    id: 'double_aromatic_bond',
    label: 'Double/arom.',
    shortLabel: '2/arom',
    title: 'Double or aromatic (query, molfile type 7)',
    category: 'bonds',
    group: 'bond_types',
  },
  {
    id: 'dotted_bond',
    label: 'H-bond',
    shortLabel: 'H',
    title: 'Hydrogen bond / weak interaction (dotted; does not use valency)',
    category: 'bonds',
    group: 'bond_types',
  },
  {
    id: 'bold_bond',
    label: 'Thick',
    shortLabel: 'Thick',
    title: 'Thick foreground bond (chair front edge; display-only)',
    category: 'bonds',
    group: 'bond_types',
  },
  {
    id: 'perspective',
    label: '3D View',
    shortLabel: '3D',
    title: 'Structure Perspective: drag to rotate a 3D Clean Up pose on the canvas',
    category: 'edit',
    group: 'select_edit',
  },
  { id: 'chain', label: 'Chain', title: 'Alkyl Chain', category: 'bonds', group: 'bond_types' },
  { id: 'charge_plus', label: '+', title: 'Positive Charge (+): plain mark without circle; click again for +2, +3…', category: 'edit', group: 'select_edit' },
  { id: 'charge_minus', label: '−', title: 'Negative Charge (−): plain mark without circle; click again for −2, −3…', category: 'edit', group: 'select_edit' },
  {
    id: 'oplus',
    label: '⊕',
    title: 'Carbocation (⊕): circled positive charge on atom; click again to clear',
    category: 'edit',
    group: 'select_edit',
  },
  {
    id: 'ominus',
    label: '⊖',
    title: 'Carbanion (⊖): circled negative charge on atom; click again to clear',
    category: 'edit',
    group: 'select_edit',
  },
  {
    id: 'radical_cation',
    label: '•+',
    shortLabel: '•+',
    title: 'Radical cation (•+): click atom to set unpaired electron + formal +1; click again to clear',
    category: 'edit',
    group: 'select_edit',
  },
  {
    id: 'radical_anion',
    label: '•−',
    shortLabel: '•−',
    title: 'Radical anion (•−): click atom to set unpaired electron + formal −1; click again to clear',
    category: 'edit',
    group: 'select_edit',
  },
  { id: 'lone_pair', label: 'Lone Pair', shortLabel: 'LP', title: 'Lone Pair: click atom to add lone pair', category: 'edit', group: 'select_edit' },
  {
    id: 'orbital_p',
    label: 'p orbital',
    shortLabel: 'p',
    title: 'p orbital (diagonal): click an atom or empty canvas to place',
    category: 'edit',
    group: 'select_edit',
  },
  {
    id: 'orbital_s',
    label: 's orbital',
    shortLabel: 's',
    title: 's orbital: click an atom or empty canvas to place',
    category: 'edit',
    group: 'select_edit',
  },
  {
    id: 'orbital_p2',
    label: 'p orbital',
    shortLabel: 'p′',
    title: 'p orbital (opposite diagonal): click an atom or empty canvas to place',
    category: 'edit',
    group: 'select_edit',
  },
  {
    id: 'orbital_d',
    label: 'd orbital',
    shortLabel: 'd',
    title: 'd orbital (cloverleaf): click an atom or empty canvas to place',
    category: 'edit',
    group: 'select_edit',
  },
  {
    id: 'orbital_dz2',
    label: 'dz² orbital',
    shortLabel: 'dz²',
    title: 'dz² orbital: click an atom or empty canvas to place',
    category: 'edit',
    group: 'select_edit',
  },
  { id: 'delta_plus', label: 'δ+', title: 'Partial positive (δ+): click atom to add/clear; drag to place', category: 'edit', group: 'select_edit' },
  { id: 'delta_minus', label: 'δ−', title: 'Partial negative (δ−): click atom to add/clear; drag to place', category: 'edit', group: 'select_edit' },
  {
    id: 'stamp_delta',
    label: 'Δ',
    title: 'Place heat symbol (Δ) — click empty canvas',
    category: 'edit',
    group: 'select_edit',
  },
  {
    id: 'stamp_delta_tri',
    label: '△',
    title: 'Place heat triangle (△) — click empty canvas',
    category: 'edit',
    group: 'select_edit',
  },
  {
    id: 'stamp_nu',
    label: 'ν',
    title: 'Place ν (e.g. hν) — click empty canvas',
    category: 'edit',
    group: 'select_edit',
  },
  {
    id: 'stamp_ts',
    label: '‡',
    title: 'Place transition-state symbol (‡) — click empty canvas',
    category: 'edit',
    group: 'select_edit',
  },
  {
    id: 'stamp_celsius',
    label: '°C',
    title: 'Place °C — click empty canvas',
    category: 'edit',
    group: 'select_edit',
  },
  {
    id: 'free_radical',
    label: 'Radical',
    shortLabel: '•',
    title: 'Free radical: click atom to add/remove a single unpaired electron',
    category: 'edit',
    group: 'select_edit',
  },
  {
    id: 'add_explicit_h',
    label: 'Add explicit H',
    shortLabel: 'H+',
    title:
      'Add explicit H: select atom(s) then click, or activate and click an atom (e.g. aldehyde H on carbonyl C)',
    category: 'edit',
    group: 'select_edit',
  },
  { id: 'cyclopropane', label: 'Cyclopropane', shortLabel: 'C3', title: 'Cyclopropane', category: 'rings', group: 'rings' },
  { id: 'cyclobutane', label: 'Cyclobutane', shortLabel: 'C4', title: 'Cyclobutane', category: 'rings', group: 'rings' },
  { id: 'cyclopentane', label: 'Cyclopentane', shortLabel: 'C5', title: 'Cyclopentane', category: 'rings', group: 'rings' },
  { id: 'cyclopentadiene', label: 'Cyclopentadiene', shortLabel: 'C5=', title: 'Cyclopentadiene', category: 'rings', group: 'rings' },
  { id: 'benzene', label: 'Benzene', title: 'Benzene Ring', category: 'rings', group: 'rings' },
  {
    id: 'hexagon',
    label: 'Hexagon',
    shortLabel: 'C6',
    title: 'Cyclohexane (flat hexagon ring)',
    category: 'rings',
    group: 'rings',
  },
  {
    id: 'cyclohexane',
    label: 'Chair',
    shortLabel: 'Chair',
    title: 'Cyclohexane chair conformation',
    category: 'rings',
    group: 'rings',
  },
  { id: 'boat_cyclohexane', label: 'Boat C6', shortLabel: 'Boat', title: 'Boat Cyclohexane', category: 'rings', group: 'rings' },
  { id: 'cycloheptane', label: 'Cycloheptane', shortLabel: 'C7', title: 'Cycloheptane', category: 'rings', group: 'rings' },
  { id: 'cyclooctane', label: 'Cyclooctane', shortLabel: 'C8', title: 'Cyclooctane', category: 'rings', group: 'rings' },
  { id: 'pencil', label: 'Pencil', title: 'Pencil / Annotate', category: 'edit', group: 'annotate' },
  {
    id: 'smart_draw',
    label: 'Smart Draw',
    shortLabel: 'Smart',
    title: 'Smart Draw — sketch bonds, rings, and labels; pause ~1.2s or press Enter to convert',
    category: 'edit',
    group: 'annotate',
  },
  { id: 'text', label: 'Text', title: 'Text: click empty canvas to place; click existing text to move (select or text tool)', category: 'edit', group: 'annotate' },
  { id: 'atom_label', label: 'Atom Label', shortLabel: 'Label', title: 'Atom label (A): click an atom — type R, Me, Ph, CH3, COOH, etc. R/R1/R2 are generic substituents on C or heteroatoms.', category: 'edit', group: 'annotate' },
  { id: 'reaction_arrow', label: 'Reaction Arrow', shortLabel: 'Arrow', title: 'Drag tail→head on canvas. Use the menu beside the tool to pick arrow type (Electron flow / Mechanism snaps to lone pairs, bonds, and atoms). SMILES react>>prod uses the first arrow that is not equilibrium / half-equilibrium / resonance.', category: 'edit', group: 'annotate' },
  { id: 'shape', label: 'Shape', title: 'Click and drag to draw an annotation shape. Use the menu beside the tool for rectangle, line, circle, triangle, or star.', category: 'edit', group: 'annotate' },
  {
    id: 'glassware',
    label: 'Glassware',
    shortLabel: 'Glass',
    title:
      'Click and drag to place lab glassware. Use the menu for conical flask or beaker (liquid color in the Color menu).',
    category: 'edit',
    group: 'annotate',
  },
  {
    id: 'sru_bracket',
    label: 'Polymer',
    shortLabel: 'SRU',
    title:
      'Polymer (n): select a fragment or drag a box over the repeat unit, then set n. Click the subscript on the canvas to edit.',
    category: 'edit',
    group: 'annotate',
  },
  { id: 'image', label: 'Image', title: 'Add a PNG/JPEG/WebP/GIF image annotation to the canvas', category: 'edit', group: 'annotate' },
  {
    id: 'template_library',
    label: 'Library',
    shortLabel: 'Lib',
    title: 'Library — R-groups, ligands, structures, COFs, reactions…',
    category: 'edit',
    group: 'templates',
  },
  {
    id: 'functional_groups',
    label: 'R-groups',
    shortLabel: 'R',
    title: 'Functional groups — common substituents (COOMe, Ph, Boc, …)',
    category: 'edit',
    group: 'templates',
  },
  {
    id: 'ligands',
    label: 'Ligands',
    shortLabel: 'L',
    title: 'Coordination ligands — NH₃, CO, PPh₃, bpy, Cp, H₂O…',
    category: 'edit',
    group: 'templates',
  },
];

/** Groups in the order they appear in the desktop toolbar. */
export const TOOL_GROUP_ORDER: ToolGroup[] = ['select_edit', 'bond_types', 'rings', 'stereo', 'annotate', 'templates'];

/** Left rail: pointer tools, ending at erase (divider sits below). */
export const TOOL_IDS_LEFT_SELECT: readonly string[] = [
  'hand',
  'select',
  'lasso_select',
  'erase',
];

/** Left rail: charge / lone pair, after the erase divider. */
export const TOOL_IDS_LEFT_MARKS: readonly string[] = [
  'charge_plus',
  'lone_pair',
];

/** Left rail: bonds including wedge (rings live on the bottom dock). */
export const TOOL_GROUPS_LEFT_STRUCTURE: ToolGroup[] = ['bond_types'];

/** Bottom dock: ring tools (horizontal island), Library last. Orbitals live on the left rail. */
export const TOOL_IDS_BOTTOM_RINGS: readonly string[] = [
  'cyclopropane',
  'cyclobutane',
  'cyclopentane',
  'cyclopentadiene',
  'benzene',
  'hexagon',
  'cyclohexane',
  'boat_cyclohexane',
  'cycloheptane',
  'cyclooctane',
  'template_library',
];

/** Shown in the Draw tab flyout beside the left rail. */
export const TOOL_IDS_DRAW_PANEL: readonly string[] = ['pencil', 'shape', 'image', 'glassware'];

/** Left rail: atom label / arrows / brackets (pencil / shape / image live on Draw). */
export const TOOL_IDS_LEFT_ANNOTATE: readonly string[] = [
  'smart_draw',
  'atom_label',
  'reaction_arrow',
  'sru_bracket',
  'orbital_p',
];

/**
 * Home tools row: text.
 * Pencil, shapes, image, and glassware live on the Draw flyout.
 * Library / R-groups / ligands live on the ring toolbar → Library modal.
 */
export const TOOL_IDS_TOP_BAR: readonly string[] = [
  'text',
];

/** Phone/tablet category dock: Select | Draw | Rings | Bonds | Objects | More */
export type MobileToolCategory = 'select' | 'draw' | 'rings' | 'annotate' | 'objects' | 'more';

export const MOBILE_TOOL_CATEGORIES: {
  id: MobileToolCategory;
  label: string;
}[] = [
  { id: 'select', label: 'Select' },
  { id: 'draw', label: 'Draw' },
  { id: 'rings', label: 'Rings' },
  { id: 'annotate', label: 'Bonds' },
  // 'objects' is a valid category id (header objects-list button) but is not a
  // dock tab: on compact the list icon lives in the header, like desktop.
  { id: 'more', label: 'More' },
];

/** Tool ids shown in the active strip for each mobile category. */
export const MOBILE_CATEGORY_TOOL_IDS: Record<MobileToolCategory, readonly string[]> = {
  select: ['hand', 'select', 'lasso_select'],
  draw: [
    'erase',
    'pencil',
    'smart_draw',
    'charge_plus',
    'lone_pair',
    'single_bond',
    'chain',
  ],
  rings: TOOL_IDS_BOTTOM_RINGS,
  annotate: [...TOOL_IDS_DRAW_PANEL, ...TOOL_IDS_LEFT_ANNOTATE, 'text', 'glassware'],
  objects: [],
  more: [],
};

/** Charge / δ / radical-ion tools collapsed into one left-rail dropdown (primary: +). */
export const CHARGE_TOOL_IDS = [
  'charge_plus',
  'charge_minus',
  'oplus',
  'ominus',
  'radical_cation',
  'radical_anion',
  'delta_plus',
  'delta_minus',
] as const;

/** Canvas stamp symbols (Δ, ν, ‡, …) in the charge dropdown Symbols group. */
export const CHARGE_SYMBOL_TOOL_IDS = [
  'stamp_delta',
  'stamp_delta_tri',
  'stamp_nu',
  'stamp_ts',
  'stamp_celsius',
] as const;

/** All tools selectable from the charge dropdown menu. */
export const CHARGE_MENU_TOOL_IDS = [
  ...CHARGE_TOOL_IDS,
  ...CHARGE_SYMBOL_TOOL_IDS,
] as const;

/** Lone pair + free radical collapsed into one left-rail dropdown (primary: lone pair). */
export const LONE_PAIR_TOOL_IDS = ['lone_pair', 'free_radical'] as const;

/** Atomic-orbital drawings collapsed into one left-rail dropdown. */
export const ORBITAL_TOOL_IDS = [
  'orbital_p',
  'orbital_s',
  'orbital_p2',
  'orbital_d',
  'orbital_dz2',
] as const;

/** Flat / chair / boat C6 collapsed into one bottom-dock dropdown (primary: flat hexagon). */
export const C6_RING_TOOL_IDS = ['hexagon', 'cyclohexane', 'boat_cyclohexane'] as const;

/** Bond types in the single Ketcher-style dropdown (alkyl chain is separate). */
export const BOND_MENU_SECTIONS = [
  {
    id: 'main',
    tools: [
      'single_bond',
      'double_bond',
      'triple_bond',
      'aromatic_bond',
      'wedge_bond',
      'dash_bond',
      'either_bond',
      'wavy_bond',
    ],
  },
  {
    id: 'more',
    tools: ['cis_trans_bond', 'dative_bond', 'any_bond'],
  },
  {
    id: 'advanced',
    tools: [
      'single_double_bond',
      'single_aromatic_bond',
      'double_aromatic_bond',
      'dotted_bond',
      'bold_bond',
    ],
  },
] as const;

export const BOND_MENU_TOOL_IDS = BOND_MENU_SECTIONS.flatMap(s => [...s.tools]);

/** @deprecated Use BOND_MENU_TOOL_IDS. Stereo subset kept for older callers. */
export const STEREO_BOND_TOOL_IDS = [
  'wedge_bond',
  'dash_bond',
  'either_bond',
  'wavy_bond',
  'dative_bond',
] as const;

/** @deprecated Prefer TOOL_GROUPS_LEFT_STRUCTURE / TOOL_IDS_*. */
export const TOOL_GROUPS_LEFT: ToolGroup[] = ['bond_types', 'rings', 'stereo'];
/** @deprecated */
export const TOOL_GROUPS_BOTTOM_BAR: ToolGroup[] = ['select_edit', 'annotate', 'templates'];
/** @deprecated */
export const TOOL_GROUPS_STRUCTURE = TOOL_GROUPS_LEFT;
/** @deprecated */
export const TOOL_GROUPS_TOP = TOOL_GROUPS_BOTTOM_BAR;
/** @deprecated */
export const TOOL_GROUPS_BOTTOM = TOOL_GROUPS_BOTTOM_BAR;
