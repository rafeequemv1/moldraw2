/**
 * Apply a bond-style toolbar tool to the current selection (ChemDraw-style).
 * Select a wedge → click Single → becomes a plain single bond.
 *
 * Restyle only when bonds were picked explicitly (bond click / bond lasso).
 * Whole-molecule or whole-fragment selection must not rewrite every bond.
 */
import type { Molecule } from '@moldraw/domain';
import { covalentBondOrderContribution, getMaxValencyForElement } from '@moldraw/domain';
import { connectedComponents } from '@moldraw/engine/graph';
import {
  BOND_TOOLS,
  bondCommandPatchForStyleTool,
  isCanvasBondTool,
  type BondToolId,
} from '@moldraw/canvas';

export const BOND_STYLE_TOOL_IDS = BOND_TOOLS;
export type BondStyleToolId = BondToolId;

export function isBondStyleToolId(toolId: string): toolId is BondStyleToolId {
  return isCanvasBondTool(toolId);
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

/** Patch sent to `molecule.updateBond` (`null` clears stereo / ramp / query). */
export function bondPatchForStyleTool(toolId: BondStyleToolId) {
  return bondCommandPatchForStyleTool(toolId);
}

/**
 * Atoms whose covalent bond-order sum exceeds the element's maximum valency.
 * Bond edits are never blocked on valency; this drives the octet hint text.
 */
export function overValentAtomIds(molecule: Molecule): string[] {
  const sum = new Map<string, number>();
  for (const b of molecule.bonds) {
    const c = covalentBondOrderContribution(b);
    if (!c) continue;
    sum.set(b.fromAtomId, (sum.get(b.fromAtomId) ?? 0) + c);
    sum.set(b.toAtomId, (sum.get(b.toAtomId) ?? 0) + c);
  }
  const out: string[] = [];
  for (const a of molecule.atoms) {
    const s = sum.get(a.id) ?? 0;
    if (s > getMaxValencyForElement(a.element, a.charge ?? 0)) out.push(a.id);
  }
  return out;
}
