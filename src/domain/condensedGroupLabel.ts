import type { Atom, Molecule } from './types';
import { getEffectiveValencyForImplicitHydrogen } from './valency';

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
