/**
 * Pick which disconnected fragment to show in the 3D viewer:
 * selected component if any atoms are selected, else the newest component
 * (by latest atom insertion order in the molecule document).
 *
 * Auto-sync uses this so selecting a different *existing* molecule switches
 * the 3D view. Clicking empty canvas, or drawing a new disconnected fragment,
 * keeps the pinned view. Re-embed is gated separately by chemistry fingerprint
 * / pose cache.
 */
import type { Molecule } from '@moldraw/domain';
import { connectedComponents } from '@moldraw/engine';

export interface FocusFragmentResult {
  /** Sub-molecule for 3D (may be the full molecule). */
  fragment: Molecule;
  /** Atom ids included in the focus. */
  atomIds: string[];
  /** How the focus was chosen. */
  reason: 'selected' | 'newest' | 'single' | 'empty' | 'pinned';
  /** Total connected components in the document. */
  componentCount: number;
}

const extractFragment = (mol: Molecule, atomIds: string[]): Molecule => {
  const keep = new Set(atomIds);
  return {
    atoms: mol.atoms.filter(a => keep.has(a.id)),
    bonds: mol.bonds.filter(b => keep.has(b.fromAtomId) && keep.has(b.toAtomId)),
  };
};

/** Index of each atom id in document order (higher = more recently appended). */
const atomOrderIndex = (mol: Molecule): Map<string, number> => {
  const m = new Map<string, number>();
  mol.atoms.forEach((a, i) => m.set(a.id, i));
  return m;
};

const newestComponent = (comps: string[][], order: Map<string, number>): string[] => {
  let best = comps[0] ?? [];
  let bestScore = -1;
  for (const c of comps) {
    let score = -1;
    for (const id of c) {
      const idx = order.get(id) ?? -1;
      if (idx > score) score = idx;
    }
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
};

/**
 * Resolve the 3D focus fragment from selection + document topology.
 */
export const pickFocusFragment = (
  mol: Molecule,
  selectedAtomIds: string[],
): FocusFragmentResult => {
  if (mol.atoms.length === 0) {
    return {
      fragment: mol,
      atomIds: [],
      reason: 'empty',
      componentCount: 0,
    };
  }

  const comps = connectedComponents(mol);
  if (comps.length <= 1) {
    return {
      fragment: mol,
      atomIds: mol.atoms.map(a => a.id),
      reason: 'single',
      componentCount: comps.length,
    };
  }

  const selected = new Set(selectedAtomIds);
  if (selected.size > 0) {
    // Component with the most selected atoms wins; ties → newest among those.
    let best: string[] | null = null;
    let bestCount = 0;
    const order = atomOrderIndex(mol);
    for (const c of comps) {
      let n = 0;
      for (const id of c) if (selected.has(id)) n += 1;
      if (n === 0) continue;
      if (
        n > bestCount ||
        (n === bestCount &&
          best &&
          (order.get(c[c.length - 1]!) ?? 0) > (order.get(best[best.length - 1]!) ?? 0))
      ) {
        bestCount = n;
        best = c;
      }
    }
    if (best) {
      return {
        fragment: extractFragment(mol, best),
        atomIds: best,
        reason: 'selected',
        componentCount: comps.length,
      };
    }
  }

  const order = atomOrderIndex(mol);
  const newest = newestComponent(comps, order);
  return {
    fragment: extractFragment(mol, newest),
    atomIds: newest,
    reason: 'newest',
    componentCount: comps.length,
  };
};

const livePinnedComponent = (
  mol: Molecule,
  pinnedAtomIds: string[] | null,
): string[] | null => {
  const live = (pinnedAtomIds ?? []).filter(id => mol.atoms.some(a => a.id === id));
  if (live.length === 0) return null;
  const pin = new Set(live);
  return connectedComponents(mol).find(c => c.some(id => pin.has(id))) ?? null;
};

const pinnedFocus = (
  mol: Molecule,
  atomIds: string[],
  componentCount: number,
): FocusFragmentResult => ({
  fragment: extractFragment(mol, atomIds),
  atomIds,
  reason: 'pinned',
  componentCount,
});

/**
 * Keep showing the same fragment when the canvas is clicked empty or a new
 * disconnected molecule is drawn. Switch only when the user selects a
 * different *existing* component (or the pinned atoms are deleted).
 *
 * `previousAtomIds` is the atom-id set from before this document update so a
 * newly drawn fragment (new ids + selection) does not steal the 3D view.
 */
export const retainPinnedFocus = (
  mol: Molecule,
  picked: FocusFragmentResult,
  pinnedAtomIds: string[] | null,
  previousAtomIds?: ReadonlySet<string> | null,
): { focus: FocusFragmentResult; pin: string[] | null } => {
  if (picked.reason === 'empty') {
    return { focus: picked, pin: null };
  }
  if (picked.reason === 'single') {
    return { focus: picked, pin: picked.atomIds };
  }

  const keepPin = (): { focus: FocusFragmentResult; pin: string[] | null } => {
    const comp = livePinnedComponent(mol, pinnedAtomIds);
    if (comp) {
      return { focus: pinnedFocus(mol, comp, picked.componentCount), pin: comp };
    }
    return { focus: picked, pin: picked.atomIds };
  };

  if (picked.reason === 'selected') {
    if (!pinnedAtomIds || pinnedAtomIds.length === 0) {
      return { focus: picked, pin: picked.atomIds };
    }
    const pinSet = new Set(pinnedAtomIds);
    const overlapsPin = picked.atomIds.some(id => pinSet.has(id));
    if (overlapsPin) {
      return { focus: picked, pin: picked.atomIds };
    }
    const prev = previousAtomIds;
    const allExisted =
      !!prev && prev.size > 0 && picked.atomIds.every(id => prev.has(id));
    if (allExisted) {
      return { focus: picked, pin: picked.atomIds };
    }
    return keepPin();
  }

  return keepPin();
};
