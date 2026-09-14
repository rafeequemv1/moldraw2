/**
 * Basic structure check — valence, charge, stereo consistency (native).
 */
import type { Molecule } from '@moldraw/domain';
import { buildGraph } from '../graph';
import { implicitHydrogensForMolecule } from './valence';
import { kekulize } from './aromaticity';

export interface StructureCheckIssue {
  type: string;
  message: string;
  atomIndex?: number;
  bondIndex?: number;
}

export interface StructureCheckResult {
  ok: boolean;
  issues: StructureCheckIssue[];
}

const MAX_VALENCE: Record<string, number> = {
  H: 1,
  C: 4,
  N: 3,
  O: 2,
  F: 1,
  Cl: 1,
  Br: 1,
  I: 1,
  P: 5,
  S: 6,
};

export const checkStructure = (mol: Molecule): StructureCheckResult => {
  const issues: StructureCheckIssue[] = [];
  if (mol.atoms.length === 0) return { ok: true, issues };

  const kek = kekulize(mol);
  const g = buildGraph(kek);
  const implicitH = implicitHydrogensForMolecule(kek);

  mol.atoms.forEach((a, atomIndex) => {
    if (a.element === 'H' || a.element === 'D') return;
    const node = g.nodes.get(a.id);
    if (!node) return;
    let bondOrderSum = 0;
    for (const bid of node.bonds) {
      const b = g.bondById.get(bid);
      if (!b) continue;
      bondOrderSum += b.order;
    }
    const h = implicitH.get(a.id) ?? 0;
    const total = bondOrderSum + h;
    const maxV = MAX_VALENCE[a.element] ?? 8;
    if (total > maxV + 1) {
      issues.push({
        type: 'valence',
        message: `${a.element} atom exceeds typical valence (${total} > ${maxV})`,
        atomIndex,
      });
    }
    const charge = a.charge ?? 0;
    if (Math.abs(charge) > 2) {
      issues.push({
        type: 'charge',
        message: `Unusual formal charge ${charge} on ${a.element}`,
        atomIndex,
      });
    }
  });

  mol.bonds.forEach((b, bondIndex) => {
    if (b.stereo === 'wedge' || b.stereo === 'dash') {
      const a1 = mol.atoms.find(a => a.id === b.fromAtomId);
      const a2 = mol.atoms.find(a => a.id === b.toAtomId);
      if (a1?.element === 'H' || a2?.element === 'H') {
        issues.push({
          type: 'stereo',
          message: 'Stereo bond attached to hydrogen',
          bondIndex,
        });
      }
    }
  });

  return { ok: issues.length === 0, issues };
};
