/**
 * Apply a bond-style toolbar tool to the current selection (ChemDraw-style).
 * Select a wedge → click Single → becomes a plain single bond.
 *
 * Restyle only when bonds were picked explicitly (bond click / bond lasso).
 * Whole-molecule or whole-fragment selection must not rewrite every bond.
 */
import type { Molecule } from '@moldraw/domain';
import { connectedComponents } from '@moldraw/engine/graph';

export const BOND_STYLE_TOOL_IDS = [
  'single_bond',
  'double_bond',
  'triple_bond',
  'wedge_bond',
  'dash_bond',
  'wavy_bond',
  'dative_bond',
  'dotted_bond',
] as const;

export type BondStyleToolId = (typeof BOND_STYLE_TOOL_IDS)[number];

export function isBondStyleToolId(toolId: string): toolId is BondStyleToolId {
  return (BOND_STYLE_TOOL_IDS as readonly string[]).includes(toolId);
}

const bondsFullyInAtoms = (mol: Molecule, atomIds: Iterable<string>): string[] => {
  const set = new Set(atomIds);
  return mol.bonds
    .filter(b => set.has(b.fromAtomId) && set.has(b.toAtomId))
    .map(b => b.id);
};

/**
 * True when the selection is a full molecule / connected fragment (Select all,
 * Select connected, box around everything) — not a bond-focused lasso.
 */
export function isFullFragmentBondSelection(
  molecule: Molecule,
  selectedAtomIds: string[],
  selectedBondIds: string[],
): boolean {
  if (selectedBondIds.length <= 1) return false;
  if (selectedAtomIds.length === 0) return false;

  const atomSet = new Set(selectedAtomIds);
  const comps = connectedComponents(molecule).filter(c => c.some(id => atomSet.has(id)));
  if (comps.length === 0) return false;

  // Every intersecting component must be fully selected.
  for (const c of comps) {
    if (!c.every(id => atomSet.has(id))) return false;
  }

  const fragAtoms = new Set(comps.flat());
  if (fragAtoms.size !== atomSet.size) return false;

  const fragBonds = bondsFullyInAtoms(molecule, fragAtoms);
  if (fragBonds.length <= 1) return false;

  const bondSet = new Set(selectedBondIds);
  return fragBonds.every(id => bondSet.has(id));
}

/**
 * Bonds to restyle from the toolbar.
 * Uses explicit `selectedBondIds` only (bond click / lasso / box of bonds).
 * Skips whole-molecule / whole-fragment selections.
 */
export function bondIdsTargetedBySelection(
  molecule: Molecule,
  selectedAtomIds: string[],
  selectedBondIds: string[],
): string[] {
  if (selectedBondIds.length === 0) {
    // Endpoint miss: one atom with exactly one incident bond.
    if (selectedAtomIds.length === 1) {
      const atomId = selectedAtomIds[0];
      const incident = molecule.bonds.filter(
        b => b.fromAtomId === atomId || b.toAtomId === atomId,
      );
      if (incident.length === 1) return [incident[0].id];
    }
    return [];
  }

  if (isFullFragmentBondSelection(molecule, selectedAtomIds, selectedBondIds)) {
    return [];
  }

  return [...selectedBondIds];
}

/** Patch sent to `molecule.updateBond` (`null` clears stereo / ramp). */
export function bondPatchForStyleTool(toolId: BondStyleToolId): {
  order?: 1 | 2 | 3;
  stereo?: 'wedge' | 'dash' | 'wavy' | null;
  dative?: boolean;
  dotted?: boolean;
  orderCycleRamp?: 'up' | 'down' | null;
} {
  switch (toolId) {
    case 'single_bond':
      return { order: 1, stereo: null, dative: false, dotted: false, orderCycleRamp: null };
    case 'double_bond':
      return { order: 2, stereo: null, dative: false, dotted: false, orderCycleRamp: 'up' };
    case 'triple_bond':
      return { order: 3, stereo: null, dative: false, dotted: false, orderCycleRamp: null };
    case 'wedge_bond':
      return { stereo: 'wedge', dative: false, dotted: false };
    case 'dash_bond':
      return { stereo: 'dash', dative: false, dotted: false };
    case 'wavy_bond':
      return { stereo: 'wavy', dative: false, dotted: false };
    case 'dative_bond':
      return { order: 1, stereo: null, dative: true, dotted: false, orderCycleRamp: null };
    case 'dotted_bond':
      return { order: 1, stereo: null, dative: false, dotted: true, orderCycleRamp: null };
  }
}
