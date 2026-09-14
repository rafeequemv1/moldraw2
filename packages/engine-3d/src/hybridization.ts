/**
 * Hybridization / local-geometry perception for 3D embedding.
 *
 * We infer sp / sp² / sp³ from bond orders and aromaticity, then map to an
 * ideal bond angle. Lone-pair-driven bending (e.g. water's 104.5°) is
 * approximated by the standard tetrahedral/trigonal angle in Phase A; the
 * Phase B force field refines it.
 */
import type { Molecule } from '@moldraw/domain';
import { buildGraph, type MoleculeGraph } from '@moldraw/engine';

export type Hybridization = 'sp' | 'sp2' | 'sp3';

/** Ideal X–center–X bond angle in radians for each hybridization. */
export const IDEAL_ANGLE: Record<Hybridization, number> = {
  sp: Math.PI, // 180°
  sp2: (120 * Math.PI) / 180, // 120°
  sp3: (109.471 * Math.PI) / 180, // 109.47°
};

/**
 * Determine hybridization of every atom.
 *  - any triple bond, or two double bonds (allene/cumulene) → sp
 *  - one double bond, or aromatic → sp²
 *  - otherwise → sp³
 */
export const perceiveHybridization = (
  mol: Molecule,
  g: MoleculeGraph = buildGraph(mol),
): Map<string, Hybridization> => {
  const out = new Map<string, Hybridization>();
  for (const a of mol.atoms) {
    const node = g.nodes.get(a.id);
    if (!node) {
      out.set(a.id, 'sp3');
      continue;
    }
    let doubles = 0;
    let triples = 0;
    let aromatic = false;
    for (const bid of node.bonds) {
      const b = g.bondById.get(bid);
      if (!b) continue;
      if (b.aromatic) aromatic = true;
      else if (b.order === 2) doubles++;
      else if (b.order === 3) triples++;
    }
    if (triples > 0 || doubles >= 2) out.set(a.id, 'sp');
    else if (doubles === 1 || aromatic) out.set(a.id, 'sp2');
    else out.set(a.id, 'sp3');
  }
  return out;
};
