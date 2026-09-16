/**
 * Valence & implicit-hydrogen model for the native engine.
 *
 * Implicit H is computed on a Kekulé structure (explicit integer bond orders);
 * callers should `kekulize` aromatic systems first so aromatic atoms get the
 * right H count. This keeps the H logic simple and correct.
 */
import type { Molecule } from '@moldraw/domain';
import { buildGraph, explicitBondOrderSum, type MoleculeGraph } from '../graph';
import { CHARGE_ADDS_VALENCE, NORMAL_VALENCES, normalizeElementSymbol } from '../data/periodicTable';

/**
 * Charge-adjusted normal valence tiers for an element.
 * Right-side elements (N, O, halogens…) gain valence with +charge;
 * C / Si lose valence with |charge|. Boron is signed: B 3, B− 4 (BH4−), B+ 2.
 */
export const chargeAdjustedValences = (element: string, charge: number): number[] => {
  const el = normalizeElementSymbol(element);
  const base = NORMAL_VALENCES[el];
  if (!base) return [];
  const q = charge || 0;
  const shift = el === 'B' ? -q : CHARGE_ADDS_VALENCE.has(el) ? q : -Math.abs(q);
  return base.map(v => Math.max(0, v + shift));
};

/**
 * Implicit hydrogens on a single atom given its explicit bond-order sum.
 * Uses the smallest normal valence tier ≥ bond order sum.
 *
 * `explicitH` (e.g. from a SMILES bracket like [nH]) is subtracted from the
 * remaining capacity.
 */
export const implicitHForAtom = (
  element: string,
  charge: number,
  bondOrderSum: number,
  explicitH = 0,
): number => {
  const tiers = chargeAdjustedValences(element, charge);
  if (tiers.length === 0) return 0;
  let target = tiers[tiers.length - 1];
  for (const t of tiers) {
    if (t >= bondOrderSum + explicitH) {
      target = t;
      break;
    }
  }
  return Math.max(0, target - bondOrderSum - explicitH);
};

/** Implicit H count per atom id for a whole molecule (assumes Kekulé form). */
export const implicitHydrogensForMolecule = (
  mol: Molecule,
  g: MoleculeGraph = buildGraph(mol),
): Map<string, number> => {
  const out = new Map<string, number>();
  for (const a of mol.atoms) {
    const bondSum = explicitBondOrderSum(g, a.id);
    out.set(a.id, implicitHForAtom(a.element, a.charge ?? 0, bondSum));
  }
  return out;
};

/**
 * Implicit H for 3D embedding: ignore explicit H atoms in the graph (terminal
 * drawing/import artifacts) so each heavy atom still receives its full implicit
 * complement.
 */
export const implicitHydrogensForEmbedding = (
  mol: Molecule,
  g: MoleculeGraph = buildGraph(mol),
): Map<string, number> => {
  const out = new Map<string, number>();
  for (const a of mol.atoms) {
    if (a.element === 'H') continue;
    const node = g.nodes.get(a.id);
    if (!node) continue;
    let bondSum = 0;
    for (let i = 0; i < node.neighbors.length; i++) {
      const nb = g.atomById.get(node.neighbors[i]);
      if (!nb || nb.element === 'H') continue;
      const b = g.bondById.get(node.bonds[i]);
      if (!b) continue;
      // Dative / dotted bonds carry no covalent valence (ligand donors keep H).
      if (b.dative || b.dotted) continue;
      bondSum += b.aromatic ? 1.5 : b.order;
    }
    out.set(a.id, implicitHForAtom(a.element, a.charge ?? 0, bondSum));
  }
  return out;
};
