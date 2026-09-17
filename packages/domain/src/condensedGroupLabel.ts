import type { Atom, Molecule } from './types';
import { getEffectiveValencyForImplicitHydrogen } from './valency';

/**
 * Isolated H–O–H (oxygen, no heavy neighbors, two hydrogens total).
 * Must keep a bent geometry instead of a linear HOH / H–OH formula.
 */
export function isIsolatedWaterOxygen(
  atom: Atom,
  mol: Molecule,
  bondOrderSum?: number,
): boolean {
  if (atom.element !== 'O' || atom.alias?.trim() || (atom.charge ?? 0) !== 0) return false;
  let heavy = 0;
  let explicitH = 0;
  let orderSum = 0;
  for (const b of mol.bonds) {
    if (b.fromAtomId !== atom.id && b.toAtomId !== atom.id) continue;
    orderSum += b.dative ? 0 : b.order;
    const oid = b.fromAtomId === atom.id ? b.toAtomId : b.fromAtomId;
    const o = mol.atoms.find(a => a.id === oid);
    if (!o) continue;
    if (o.element === 'H') explicitH += 1;
    else heavy += 1;
  }
  if (heavy !== 0) return false;
  const sum = bondOrderSum ?? orderSum;
  const implicitH = Math.max(0, getEffectiveValencyForImplicitHydrogen('O', 0) - sum);
  return explicitH + implicitH === 2;
}

/**
 * ASCII alias fragment for {@link buildAliasDisplayRuns} (digits → subscripts).
 * Terminal / heteroatom groups only — interior chain segments stay skeletal.
 */
export function condensedGroupLabelForAtom(
  atom: Atom,
  mol: Molecule,
  bondOrderSum: number,
): string | null {
  if (atom.alias?.trim()) return null;
  const q = atom.charge ?? 0;
  if (q !== 0) return null;
  if (isIsolatedWaterOxygen(atom, mol, bondOrderSum)) return null;

  const maxH = getEffectiveValencyForImplicitHydrogen(atom.element, q);
  const implicitH = Math.max(0, maxH - bondOrderSum);
  if (implicitH <= 0) return null;

  let heavyNeighbors = 0;
  for (const b of mol.bonds) {
    if (b.fromAtomId !== atom.id && b.toAtomId !== atom.id) continue;
    const oid = b.fromAtomId === atom.id ? b.toAtomId : b.fromAtomId;
    const o = mol.atoms.find(a => a.id === oid);
    if (o && o.element !== 'H') heavyNeighbors++;
  }

  if (atom.element === 'C' && heavyNeighbors === 1) {
    if (implicitH === 3) return 'CH3';
    if (implicitH === 2) return 'CH2';
    if (implicitH === 1) return 'CH';
  }
  if (atom.element === 'N' && heavyNeighbors === 1) {
    if (implicitH === 2) return 'NH2';
    if (implicitH === 1) return 'NH';
  }
  if (atom.element === 'O' && heavyNeighbors === 1 && implicitH === 1) {
    return 'OH';
  }
  return null;
}
