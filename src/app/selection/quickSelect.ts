/**
 * Pure helpers for top-bar quick selection actions (atoms / rings / filters).
 */
import type { Molecule } from '@moldraw/domain';
import type { MoleculeSelection } from '@moldraw/core/editor';
import { buildGraph, connectedComponents, degree } from '@moldraw/engine/graph';
import { perceiveRings, ringAtomIds } from '@moldraw/engine/chem/rings';

export type QuickSelectActionId =
  | 'all_atoms'
  | 'deselect'
  | 'invert'
  | 'connected'
  | 'grow'
  | 'same_as_selection'
  | 'same_element'
  | 'all_rings'
  | 'ring_size'
  | 'heteroatoms'
  | 'charged'
  | 'aromatic'
  | 'chain'
  | 'longest_path'
  | 'side_chains'
  | 'stereo_wedge_dash'
  | 'stereo_cip'
  | 'aliases'
  | 'bonds_in_selection'
  | 'all_bonds';

export type QuickSelectOptions = {
  /** Required for `same_element`. */
  element?: string;
  /** Required for `ring_size` (e.g. 5, 6). */
  ringSize?: number;
  /** Atom ids that currently have CIP R/S (from Indigo tags). */
  cipAtomIds?: ReadonlySet<string>;
};

export type QuickSelectResult = {
  atomIds: string[];
  bondIds: string[];
};

const emptyResult = (): QuickSelectResult => ({ atomIds: [], bondIds: [] });

const withBonds = (mol: Molecule, atomIds: string[]): QuickSelectResult => ({
  atomIds,
  bondIds: bondsFullyInAtoms(mol, atomIds),
});

const bondsFullyInAtoms = (mol: Molecule, atomIds: Iterable<string>): string[] => {
  const set = new Set(atomIds);
  return mol.bonds
    .filter(b => set.has(b.fromAtomId) && set.has(b.toAtomId))
    .map(b => b.id);
};

/** Every selectable object on the canvas (atoms, bonds, arrows, text, shapes, …). */
export const selectAllDocumentObjects = (mol: Molecule): Partial<MoleculeSelection> => {
  const atomIds = mol.atoms.map(a => a.id);
  const sruIds = (mol.sruBrackets ?? []).map(b => b.id);
  return {
    atomIds,
    bondIds: bondsFullyInAtoms(mol, atomIds),
    reactionArrowIds: (mol.reactionArrows ?? []).map(a => a.id),
    canvasTextIds: (mol.canvasTexts ?? []).map(t => t.id),
    canvasShapeIds: (mol.canvasShapes ?? []).map(s => s.id),
    canvasImageIds: (mol.canvasImages ?? []).map(img => img.id),
    strokeIds: (mol.strokes ?? []).map(s => s.id),
    canvasOrbitalIds: (mol.orbitals ?? []).map(o => o.id),
    // Selection model currently tracks one SRU focus id; prefer the first when many.
    sruBracketId: sruIds[0] ?? null,
    canvasTextId: null,
    reactionArrowId: null,
    canvasImageId: null,
    colorEditStrokeId: null,
    colorEditCanvasShapeId: null,
  };
};

export const documentHasSelectableObjects = (mol: Molecule): boolean =>
  mol.atoms.length > 0 ||
  mol.bonds.length > 0 ||
  (mol.reactionArrows?.length ?? 0) > 0 ||
  (mol.canvasTexts?.length ?? 0) > 0 ||
  (mol.canvasShapes?.length ?? 0) > 0 ||
  (mol.canvasImages?.length ?? 0) > 0 ||
  (mol.strokes?.length ?? 0) > 0 ||
  (mol.orbitals?.length ?? 0) > 0 ||
  (mol.sruBrackets?.length ?? 0) > 0;

/** Expand atom ids to every connected component that intersects the seed. */
export const expandToConnectedFragments = (
  mol: Molecule,
  seedAtomIds: string[],
): string[] => {
  if (seedAtomIds.length === 0) {
    return mol.atoms.map(a => a.id);
  }
  const seed = new Set(seedAtomIds);
  const out = new Set<string>();
  for (const comp of connectedComponents(mol)) {
    if (comp.some(id => seed.has(id))) {
      for (const id of comp) out.add(id);
    }
  }
  return [...out];
};

/** Add graph neighbors of the current atom selection. */
export const growAtomSelection = (mol: Molecule, selectedAtomIds: string[]): string[] => {
  if (selectedAtomIds.length === 0) return [];
  const g = buildGraph(mol);
  const out = new Set(selectedAtomIds);
  for (const id of selectedAtomIds) {
    for (const n of g.nodes.get(id)?.neighbors ?? []) out.add(n);
  }
  return [...out];
};

/** Union of all SSSR ring atom ids. */
export const allRingAtomIds = (mol: Molecule): string[] => [...ringAtomIds(mol)];

export const heteroatomIds = (mol: Molecule): string[] =>
  mol.atoms.filter(a => a.element !== 'C' && a.element !== 'H').map(a => a.id);

export const chargedAtomIds = (mol: Molecule): string[] =>
  mol.atoms.filter(a => a.charge !== 0).map(a => a.id);

export const aromaticAtomIds = (mol: Molecule): string[] => {
  const ids = new Set<string>();
  for (const b of mol.bonds) {
    if (!b.aromatic) continue;
    ids.add(b.fromAtomId);
    ids.add(b.toAtomId);
  }
  return [...ids];
};

/** Distinct element symbols present (H last if present; others A–Z). */
export const presentElements = (mol: Molecule): string[] => {
  const set = new Set(mol.atoms.map(a => a.element));
  const rest = [...set].filter(e => e !== 'H').sort((a, b) => a.localeCompare(b));
  if (set.has('H')) rest.push('H');
  return rest;
};

export const atomsWithElement = (mol: Molecule, element: string): string[] =>
  mol.atoms.filter(a => a.element === element).map(a => a.id);

/**
 * Match element and/or alias of the current pick.
 * If multiple selected, uses the first atom as the template.
 */
export const sameAsSelectionIds = (mol: Molecule, selectedAtomIds: string[]): string[] => {
  if (selectedAtomIds.length === 0) return [];
  const seed = mol.atoms.find(a => a.id === selectedAtomIds[0]);
  if (!seed) return [];
  const alias = seed.alias?.trim();
  if (alias) {
    return mol.atoms
      .filter(a => (a.alias?.trim() ?? '') === alias)
      .map(a => a.id);
  }
  return atomsWithElement(mol, seed.element);
};

export const ringSizeAtomIds = (mol: Molecule, size: number): string[] => {
  const ids = new Set<string>();
  for (const ring of perceiveRings(mol)) {
    if (ring.size !== size) continue;
    for (const id of ring.atomIds) ids.add(id);
  }
  return [...ids];
};

/** Non-ring atoms (acyclic / chain atoms). */
export const chainAtomIds = (mol: Molecule): string[] => {
  const inRing = ringAtomIds(mol);
  return mol.atoms.filter(a => !inRing.has(a.id)).map(a => a.id);
};

/**
 * Side chains: acyclic atoms reachable from a ring attachment without entering rings.
 */
export const sideChainAtomIds = (mol: Molecule): string[] => {
  const g = buildGraph(mol);
  const inRing = ringAtomIds(mol);
  if (inRing.size === 0) return [];

  const out = new Set<string>();
  const visit = (start: string) => {
    const stack = [start];
    const seen = new Set<string>([start]);
    while (stack.length) {
      const u = stack.pop()!;
      if (inRing.has(u)) continue;
      out.add(u);
      for (const n of g.nodes.get(u)?.neighbors ?? []) {
        if (seen.has(n) || inRing.has(n)) continue;
        seen.add(n);
        stack.push(n);
      }
    }
  };

  for (const id of inRing) {
    for (const n of g.nodes.get(id)?.neighbors ?? []) {
      if (!inRing.has(n)) visit(n);
    }
  }
  return [...out];
};

/** Longest simple path heuristic (DFS from leaves / low-degree atoms). */
export const longestPathAtomIds = (mol: Molecule): string[] => {
  if (mol.atoms.length === 0) return [];
  const g = buildGraph(mol);
  let best: string[] = [];

  const dfs = (u: string, parent: string | null, path: string[], used: Set<string>) => {
    if (path.length > best.length) best = [...path];
    for (const n of g.nodes.get(u)?.neighbors ?? []) {
      if (n === parent || used.has(n)) continue;
      used.add(n);
      path.push(n);
      dfs(n, u, path, used);
      path.pop();
      used.delete(n);
    }
  };

  const starts = mol.atoms
    .map(a => a.id)
    .sort((a, b) => degree(g, a) - degree(g, b));

  // Cap starts for large molecules (leaves first).
  for (const start of starts.slice(0, Math.min(24, starts.length))) {
    const used = new Set<string>([start]);
    dfs(start, null, [start], used);
  }
  return best;
};

export const stereoWedgeDashAtomIds = (mol: Molecule): string[] => {
  const ids = new Set<string>();
  for (const b of mol.bonds) {
    if (b.stereo !== 'wedge' && b.stereo !== 'dash') continue;
    ids.add(b.fromAtomId);
    ids.add(b.toAtomId);
  }
  return [...ids];
};

export const stereoCipAtomIds = (
  mol: Molecule,
  cipAtomIds?: ReadonlySet<string>,
): string[] => {
  if (cipAtomIds && cipAtomIds.size > 0) {
    return mol.atoms.filter(a => cipAtomIds.has(a.id)).map(a => a.id);
  }
  // Fallback without Indigo CIP: chiralParity / stereo parity care.
  return mol.atoms
    .filter(a => (a.chiralParity != null && a.chiralParity !== 0) || (a.mdlStereoCare != null && a.mdlStereoCare !== 0))
    .map(a => a.id);
};

export const aliasAtomIds = (mol: Molecule): string[] =>
  mol.atoms.filter(a => !!a.alias?.trim()).map(a => a.id);

/**
 * Compute the next atom/bond selection for a quick-select action.
 * Bond-only actions may leave atomIds empty.
 */
export const applyQuickSelectAction = (
  mol: Molecule,
  action: QuickSelectActionId,
  currentAtomIds: string[],
  options: QuickSelectOptions = {},
): QuickSelectResult => {
  switch (action) {
    case 'all_atoms':
      return withBonds(mol, mol.atoms.map(a => a.id));
    case 'deselect':
      return emptyResult();
    case 'invert': {
      const cur = new Set(currentAtomIds);
      return withBonds(
        mol,
        mol.atoms.filter(a => !cur.has(a.id)).map(a => a.id),
      );
    }
    case 'connected':
      return withBonds(mol, expandToConnectedFragments(mol, currentAtomIds));
    case 'grow':
      return withBonds(mol, growAtomSelection(mol, currentAtomIds));
    case 'same_as_selection':
      return withBonds(mol, sameAsSelectionIds(mol, currentAtomIds));
    case 'same_element': {
      const el = options.element?.trim();
      if (!el) return emptyResult();
      return withBonds(mol, atomsWithElement(mol, el));
    }
    case 'all_rings':
      return withBonds(mol, allRingAtomIds(mol));
    case 'ring_size': {
      const size = options.ringSize;
      if (!size || size < 3) return emptyResult();
      return withBonds(mol, ringSizeAtomIds(mol, size));
    }
    case 'heteroatoms':
      return withBonds(mol, heteroatomIds(mol));
    case 'charged':
      return withBonds(mol, chargedAtomIds(mol));
    case 'aromatic':
      return withBonds(mol, aromaticAtomIds(mol));
    case 'chain':
      return withBonds(mol, chainAtomIds(mol));
    case 'longest_path':
      return withBonds(mol, longestPathAtomIds(mol));
    case 'side_chains':
      return withBonds(mol, sideChainAtomIds(mol));
    case 'stereo_wedge_dash':
      return withBonds(mol, stereoWedgeDashAtomIds(mol));
    case 'stereo_cip':
      return withBonds(mol, stereoCipAtomIds(mol, options.cipAtomIds));
    case 'aliases':
      return withBonds(mol, aliasAtomIds(mol));
    case 'bonds_in_selection': {
      if (currentAtomIds.length === 0) return emptyResult();
      return {
        atomIds: [...currentAtomIds],
        bondIds: bondsFullyInAtoms(mol, currentAtomIds),
      };
    }
    case 'all_bonds':
      return {
        atomIds: [],
        bondIds: mol.bonds.map(b => b.id),
      };
    default:
      return emptyResult();
  }
};
