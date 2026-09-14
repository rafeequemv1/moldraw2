/**
 * Editable keyboard shortcut registry.
 * Defaults power both the Settings → Shortcuts UI and `useKeyboardShortcuts`.
 */

/** Stable action ids persisted in AppSettings.shortcuts.bindings */
export type ShortcutActionId =
  | 'undo'
  | 'redo'
  | 'selectAll'
  | 'copy'
  | 'paste'
  | 'save'
  | 'delete'
  | 'openShortcuts'
  | 'cleanup3d'
  | 'togglePerspective'
  | 'toolSingleBond'
  | 'toolDoubleBond'
  | 'toolTripleBond'
  | 'toolBenzene'
  | 'elementC'
  | 'elementN'
  | 'elementO'
  | 'elementS'
  | 'elementP'
  | 'elementF'
  | 'elementH'
  | 'elementCl'
  | 'elementBr'
  | 'elementI'
  | 'tempSelect'
  | 'zoomIn'
  | 'zoomOut'
  | 'resetZoom'
  | 'fitView'
  | 'cancel'
  | 'toolHand'
  | 'toolSelect'
  | 'toolLasso'
  | 'toolErase'
  | 'selectDeselect'
  | 'selectInvert'
  | 'selectConnected'
  | 'selectGrow'
  | 'selectSameAs'
  | 'selectAllRings'
  | 'selectHeteroatoms'
  | 'selectChain'
  | 'selectLongestPath'
  | 'selectSideChains'
  | 'selectRing5'
  | 'selectRing6'
  | 'selectAromatic'
  | 'selectCharged'
  | 'selectStereoWedgeDash'
  | 'selectStereoCip'
  | 'selectAliases'
  | 'selectBondsInSelection'
  | 'selectAllBonds';

export interface KeyChord {
  /** Lowercase letter, digit, or special: 'delete' | 'backspace' | 'escape' | 'space' | '?' */
  key: string;
  /** Ctrl (Win/Linux) or ⌘ (macOS) */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface ShortcutActionDef {
  id: ShortcutActionId;
  label: string;
  group: string;
  /** Default chords (first is primary). */
  defaults: KeyChord[];
  /** When false, shown in the list but not rebindable (pointer / complex). */
  editable?: boolean;
}

export const SHORTCUT_ACTION_DEFS: ShortcutActionDef[] = [
  {
    id: 'undo',
    label: 'Undo',
    group: 'Editing',
    defaults: [{ mod: true, key: 'z' }],
  },
  {
    id: 'redo',
    label: 'Redo',
    group: 'Editing',
    defaults: [
      { mod: true, key: 'y' },
      { mod: true, shift: true, key: 'z' },
    ],
  },
  {
    id: 'selectAll',
    label: 'Select all',
    group: 'Selection',
    defaults: [{ mod: true, key: 'a' }],
  },
  {
    id: 'selectDeselect',
    label: 'Deselect',
    group: 'Selection',
    defaults: [{ mod: true, shift: true, key: 'a' }],
  },
  {
    id: 'selectInvert',
    label: 'Invert selection',
    group: 'Selection',
    defaults: [{ mod: true, shift: true, key: 'i' }],
  },
  {
    id: 'selectConnected',
    label: 'Select connected',
    group: 'Selection',
    defaults: [{ mod: true, shift: true, key: 'c' }],
  },
  {
    id: 'selectGrow',
    label: 'Grow selection',
    group: 'Selection',
    defaults: [{ mod: true, shift: true, key: 'g' }],
  },
  {
    id: 'selectSameAs',
    label: 'Same as selection',
    group: 'Selection',
    defaults: [{ mod: true, shift: true, key: 's' }],
  },
  {
    id: 'selectAllRings',
    label: 'Select all rings',
    group: 'Selection',
    defaults: [{ mod: true, shift: true, key: 'r' }],
  },
  {
    id: 'selectHeteroatoms',
    label: 'Select heteroatoms',
    group: 'Selection',
    defaults: [{ mod: true, shift: true, key: 'h' }],
  },
  {
    id: 'selectChain',
    label: 'Chain atoms',
    group: 'Selection',
    defaults: [{ alt: true, shift: true, key: 'c' }],
  },
  {
    id: 'selectLongestPath',
    label: 'Longest path',
    group: 'Selection',
    defaults: [{ alt: true, shift: true, key: 'l' }],
  },
  {
    id: 'selectSideChains',
    label: 'Side chains',
    group: 'Selection',
    defaults: [{ alt: true, shift: true, key: 's' }],
  },
  {
    id: 'selectRing5',
    label: 'All 5-rings',
    group: 'Selection',
    defaults: [{ alt: true, shift: true, key: '5' }],
  },
  {
    id: 'selectRing6',
    label: 'All 6-rings',
    group: 'Selection',
    defaults: [{ alt: true, shift: true, key: '6' }],
  },
  {
    id: 'selectAromatic',
    label: 'Aromatic atoms',
    group: 'Selection',
    defaults: [{ alt: true, shift: true, key: 'a' }],
  },
  {
    id: 'selectCharged',
    label: 'Charged atoms',
    group: 'Selection',
    defaults: [{ alt: true, shift: true, key: 'q' }],
  },
  {
    id: 'selectStereoWedgeDash',
    label: 'Wedge / dash atoms',
    group: 'Selection',
    defaults: [{ alt: true, shift: true, key: 'w' }],
  },
  {
    id: 'selectStereoCip',
    label: 'CIP R / S centers',
    group: 'Selection',
    defaults: [{ alt: true, shift: true, key: 'r' }],
  },
  {
    id: 'selectAliases',
    label: 'Aliases / R-groups',
    group: 'Selection',
    defaults: [{ alt: true, shift: true, key: 'g' }],
  },
  {
    id: 'selectBondsInSelection',
    label: 'Bonds in selection',
    group: 'Selection',
    defaults: [{ alt: true, shift: true, key: 'b' }],
  },
  {
    id: 'selectAllBonds',
    label: 'All bonds',
    group: 'Selection',
    defaults: [{ mod: true, alt: true, key: 'b' }],
  },
  {
    id: 'copy',
    label: 'Copy fragment',
    group: 'Editing',
    defaults: [{ mod: true, key: 'c' }],
  },
  {
    id: 'paste',
    label: 'Paste fragment',
    group: 'Editing',
    defaults: [{ mod: true, key: 'v' }],
  },
  {
    id: 'save',
    label: 'Save entire canvas (.moldraw)',
    group: 'Editing',
    defaults: [{ mod: true, key: 's' }],
  },
  {
    id: 'delete',
    label: 'Erase selected object',
    group: 'Editing',
    defaults: [{ key: 'delete' }, { key: 'backspace' }],
  },
  {
    id: 'openShortcuts',
    label: 'Open shortcuts panel',
    group: 'Editing',
    defaults: [{ key: '?' }],
  },
  {
    id: 'toolSingleBond',
    label: 'Single bond tool',
    group: 'Tools',
    defaults: [{ key: '1' }],
  },
  {
    id: 'toolDoubleBond',
    label: 'Double bond tool',
    group: 'Tools',
    defaults: [{ key: '2' }],
  },
  {
    id: 'toolTripleBond',
    label: 'Triple bond tool',
    group: 'Tools',
    defaults: [{ key: '3' }],
  },
  {
    id: 'toolBenzene',
    label: 'Benzene ring tool',
    group: 'Tools',
    defaults: [{ key: 'b' }],
  },
  {
    id: 'tempSelect',
    label: 'Temporary pan (hold Space, then drag)',
    group: 'Navigation',
    defaults: [{ key: 'space' }],
  },
  {
    id: 'zoomIn',
    label: 'Zoom in',
    group: 'Navigation',
    defaults: [{ mod: true, key: '=' }],
  },
  {
    id: 'zoomOut',
    label: 'Zoom out',
    group: 'Navigation',
    defaults: [{ mod: true, key: '-' }],
  },
  {
    id: 'resetZoom',
    label: 'Reset zoom (100%)',
    group: 'Navigation',
    defaults: [{ mod: true, key: '1' }],
  },
  {
    id: 'fitView',
    label: 'Fit all objects',
    group: 'Navigation',
    defaults: [{ mod: true, key: '0' }],
  },
  {
    id: 'cancel',
    label: 'Cancel / clear selection',
    group: 'Editing',
    defaults: [{ key: 'escape' }],
  },
  {
    id: 'toolHand',
    label: 'Hand (pan) tool',
    group: 'Tools',
    defaults: [],
  },
  {
    id: 'toolSelect',
    label: 'Select tool',
    group: 'Tools',
    defaults: [{ key: 'v' }],
  },
  {
    id: 'toolLasso',
    label: 'Lasso select tool',
    group: 'Tools',
    defaults: [{ key: 'l' }],
  },
  {
    id: 'toolErase',
    label: 'Erase tool',
    group: 'Tools',
    defaults: [],
  },
  {
    id: 'elementC',
    label: 'Carbon',
    group: 'Atom labels',
    defaults: [{ key: 'c' }],
  },
  {
    id: 'elementN',
    label: 'Nitrogen',
    group: 'Atom labels',
    defaults: [{ key: 'n' }],
  },
  {
    id: 'elementO',
    label: 'Oxygen',
    group: 'Atom labels',
    defaults: [{ key: 'o' }],
  },
  {
    id: 'elementS',
    label: 'Sulfur',
    group: 'Atom labels',
    defaults: [{ key: 's' }],
  },
  {
    id: 'elementP',
    label: 'Phosphorus',
    group: 'Atom labels',
    defaults: [{ key: 'p' }],
  },
  {
    id: 'elementF',
    label: 'Fluorine',
    group: 'Atom labels',
    defaults: [{ key: 'f' }],
  },
  {
    id: 'elementH',
    label: 'Hydrogen',
    group: 'Atom labels',
    defaults: [{ key: 'h' }],
  },
  {
    id: 'elementCl',
    label: 'Chlorine',
    group: 'Atom labels',
    defaults: [{ shift: true, key: 'c' }],
  },
  {
    id: 'elementBr',
    label: 'Bromine',
    group: 'Atom labels',
    defaults: [{ shift: true, key: 'b' }],
  },
  {
    id: 'elementI',
    label: 'Iodine',
    group: 'Atom labels',
    defaults: [{ shift: true, key: 'i' }],
  },
  {
    id: 'cleanup3d',
    label: '3D Clean Up (canvas pose)',
    group: '3D Perspective',
    defaults: [{ mod: true, shift: true, key: 'd' }],
  },
  {
    id: 'togglePerspective',
    label: 'Perspective tool / depth shading',
    group: '3D Perspective',
    defaults: [{ alt: true, key: 'd' }],
  },
];

/** Fixed (non-editable) pointer / complex shortcuts shown in Settings for discovery. */
export const FIXED_SHORTCUT_ROWS: { group: string; label: string; keys: string[][] }[] = [
  {
    group: 'Navigation',
    label: 'Pan canvas (hand tool)',
    keys: [['Hand', 'drag']],
  },
  {
    group: 'Navigation',
    label: 'Pan',
    keys: [['Middle-click', 'drag']],
  },
  {
    group: 'Navigation',
    label: 'Zoom toward pointer',
    keys: [['Scroll', 'wheel']],
  },
  {
    group: 'Navigation',
    label: 'Pinch zoom',
    keys: [['Two-finger', 'pinch']],
  },
  {
    group: 'Navigation',
    label: 'Two-finger pan',
    keys: [['Two-finger', 'drag']],
  },
  {
    group: 'Navigation',
    label: 'Touch pan on empty canvas',
    keys: [['Touch', 'drag']],
  },
  {
    group: 'Selection',
    label: 'Select entire connected molecule',
    keys: [['Ctrl', 'click'], ['⌘', 'click']],
  },
  {
    group: 'Selection',
    label: 'Add / toggle atom or bond in selection',
    keys: [['Shift', 'click']],
  },
  {
    group: 'Selection',
    label: 'Marquee select; Shift+drag for lasso',
    keys: [['drag'], ['Shift', 'drag']],
  },
];

export type ShortcutBindingsMap = Partial<Record<ShortcutActionId, KeyChord[]>>;

export const DEFAULT_SHORTCUT_BINDINGS: Record<ShortcutActionId, KeyChord[]> = Object.fromEntries(
  SHORTCUT_ACTION_DEFS.map(d => [d.id, d.defaults.map(c => ({ ...c }))]),
) as Record<ShortcutActionId, KeyChord[]>;

export function resolveShortcutBindings(
  overrides?: ShortcutBindingsMap | null,
): Record<ShortcutActionId, KeyChord[]> {
  const out = { ...DEFAULT_SHORTCUT_BINDINGS };
  if (!overrides) return out;
  for (const def of SHORTCUT_ACTION_DEFS) {
    const o = overrides[def.id];
    if (o && o.length > 0) out[def.id] = o.map(c => ({ ...c }));
  }
  return out;
}

export function normalizeEventKey(e: KeyboardEvent): string {
  if (e.code === 'Space') return 'space';
  if (e.key === 'Delete') return 'delete';
  if (e.key === 'Backspace') return 'backspace';
  if (e.key === 'Escape') return 'escape';
  if (e.key === '?' || (e.shiftKey && e.key === '/')) return '?';
  if (e.key.length === 1) return e.key.toLowerCase();
  return e.key.toLowerCase();
}

export function eventMatchesChord(e: KeyboardEvent, chord: KeyChord): boolean {
  const wantMod = !!chord.mod;
  const haveMod = e.ctrlKey || e.metaKey;
  if (wantMod !== haveMod) return false;
  if (!!chord.alt !== e.altKey) return false;

  const ck = chord.key.toLowerCase();
  if (ck === '?') {
    // '?' or Shift+/ — don't require chord.shift
    return e.key === '?' || (e.shiftKey && e.key === '/');
  }
  if (ck === '=' || ck === '+') {
    return e.key === '=' || e.key === '+';
  }
  if (ck === '-' || ck === '_') {
    return e.key === '-' || e.key === '_';
  }
  if (ck === 'space') return e.code === 'Space' && !!chord.shift === e.shiftKey;
  if (ck === 'delete') return e.key === 'Delete' && !!chord.shift === e.shiftKey;
  if (ck === 'backspace') return e.key === 'Backspace' && !!chord.shift === e.shiftKey;

  if (!!chord.shift !== e.shiftKey) return false;
  if (e.key.length === 1) return e.key.toLowerCase() === ck;
  return e.key.toLowerCase() === ck;
}

export function eventMatchesAction(
  e: KeyboardEvent,
  actionId: ShortcutActionId,
  bindings: Record<ShortcutActionId, KeyChord[]>,
): boolean {
  const chords = bindings[actionId] ?? [];
  return chords.some(c => eventMatchesChord(e, c));
}

/** Display labels for a chord (platform-aware mod). */
export function formatChordKeys(chord: KeyChord, mac = false): string[] {
  const parts: string[] = [];
  if (chord.mod) parts.push(mac ? '⌘' : 'Ctrl');
  if (chord.alt) parts.push(mac ? '⌥' : 'Alt');
  if (chord.shift) parts.push('Shift');
  const k = chord.key;
  if (k === 'space') parts.push('Space');
  else if (k === 'delete') parts.push('Delete');
  else if (k === 'backspace') parts.push('Backspace');
  else if (k === 'escape') parts.push('Esc');
  else if (k === '?') parts.push('?');
  else parts.push(k.length === 1 ? k.toUpperCase() : k);
  return parts;
}

export function chordFromKeyboardEvent(e: KeyboardEvent): KeyChord | null {
  const key = normalizeEventKey(e);
  if (key === 'escape') return null; // cancel capture
  // Ignore bare modifier presses
  if (['control', 'shift', 'alt', 'meta'].includes(e.key.toLowerCase())) return null;
  return {
    key,
    mod: e.ctrlKey || e.metaKey || undefined,
    shift: e.shiftKey || undefined,
    alt: e.altKey || undefined,
  };
}

/** True if two actions would fight for the same chord. */
export function findBindingConflict(
  actionId: ShortcutActionId,
  chords: KeyChord[],
  bindings: Record<ShortcutActionId, KeyChord[]>,
): ShortcutActionId | null {
  const same = (a: KeyChord, b: KeyChord) =>
    a.key === b.key && !!a.mod === !!b.mod && !!a.shift === !!b.shift && !!a.alt === !!b.alt;
  for (const def of SHORTCUT_ACTION_DEFS) {
    if (def.id === actionId) continue;
    for (const existing of bindings[def.id] ?? []) {
      if (chords.some(c => same(c, existing))) return def.id;
    }
  }
  return null;
}

export function primaryToolShortcutLabel(
  toolId: string,
  bindings: Record<ShortcutActionId, KeyChord[]>,
): string | undefined {
  const map: Record<string, ShortcutActionId> = {
    single_bond: 'toolSingleBond',
    double_bond: 'toolDoubleBond',
    triple_bond: 'toolTripleBond',
    benzene: 'toolBenzene',
    select: 'toolSelect',
    lasso_select: 'toolLasso',
  };
  const id = map[toolId];
  if (!id) return undefined;
  const chord = bindings[id]?.[0];
  if (!chord) return undefined;
  return formatChordKeys(chord).join('+');
}

/** Map Select-menu quick actions (+ options) to shortcut action ids. */
export function quickSelectShortcutActionId(
  action: string,
  options?: { ringSize?: number },
): ShortcutActionId | null {
  if (action === 'ring_size') {
    if (options?.ringSize === 5) return 'selectRing5';
    if (options?.ringSize === 6) return 'selectRing6';
    return null;
  }
  const map: Record<string, ShortcutActionId> = {
    all_atoms: 'selectAll',
    deselect: 'selectDeselect',
    invert: 'selectInvert',
    connected: 'selectConnected',
    grow: 'selectGrow',
    same_as_selection: 'selectSameAs',
    all_rings: 'selectAllRings',
    heteroatoms: 'selectHeteroatoms',
    chain: 'selectChain',
    longest_path: 'selectLongestPath',
    side_chains: 'selectSideChains',
    aromatic: 'selectAromatic',
    charged: 'selectCharged',
    stereo_wedge_dash: 'selectStereoWedgeDash',
    stereo_cip: 'selectStereoCip',
    aliases: 'selectAliases',
    bonds_in_selection: 'selectBondsInSelection',
    all_bonds: 'selectAllBonds',
  };
  return map[action] ?? null;
}

export function formatPrimaryShortcut(
  actionId: ShortcutActionId,
  bindings: Record<ShortcutActionId, KeyChord[]>,
  mac = false,
): string | undefined {
  const chord = bindings[actionId]?.[0];
  if (!chord) return undefined;
  return formatChordKeys(chord, mac).join('+');
}
