/**
 * Canonical SMILES writer.
 *
 * Produces a Kekulé SMILES (double/triple bonds written explicitly as `=`/`#`)
 * with a canonical atom ordering derived from a Morgan-style relaxation. Kekulé
 * output is always valid and round-trips through other toolkits; aromatic
 * lowercase output can be layered on later.
 *
 * Organic-subset atoms with a standard valence and no charge/isotope are written
 * bare (C, N, O, Cl…); everything else uses a bracket atom with an explicit H
 * count.
 */
import type { Bond, Molecule } from '@moldraw/domain';
import { buildGraph, connectedComponents, explicitBondOrderSum, type MoleculeGraph } from '../graph';
import { kekulize } from '../chem/aromaticity';
import { implicitHForAtom } from '../chem/valence';
import { atomicNumber, ORGANIC_SUBSET, normalizeElementSymbol } from '../data/periodicTable';

/** Morgan-style canonical ranking (stable, deterministic). */
const canonicalRanks = (mol: Molecule, g: MoleculeGraph): Map<string, number> => {
  const invariant = new Map<string, string>();
  for (const a of mol.atoms) {
    const node = g.nodes.get(a.id)!;
    const bondSum = explicitBondOrderSum(g, a.id);
    invariant.set(
      a.id,
      [node.neighbors.length, atomicNumber(a.element), (a.charge ?? 0) + 8, a.isotope ?? 0, bondSum].join('.'),
    );
  }

  const toRanks = (inv: Map<string, string>): Map<string, number> => {
    const sorted = [...new Set(inv.values())].sort();
    const rankOf = new Map<string, number>();
    sorted.forEach((v, idx) => rankOf.set(v, idx));
    const ranks = new Map<string, number>();
    for (const [id, v] of inv) ranks.set(id, rankOf.get(v)!);
    return ranks;
  };

  let ranks = toRanks(invariant);
  let distinct = new Set(ranks.values()).size;
  for (let iter = 0; iter < mol.atoms.length + 2; iter++) {
    const next = new Map<string, string>();
    for (const a of mol.atoms) {
      const node = g.nodes.get(a.id)!;
      const neigh = node.neighbors.map(n => ranks.get(n)!).sort((x, y) => x - y);
      next.set(a.id, `${ranks.get(a.id)}:${neigh.join(',')}`);
    }
    const newRanks = toRanks(next);
    const newDistinct = new Set(newRanks.values()).size;
    ranks = newRanks;
    if (newDistinct === distinct) break;
    distinct = newDistinct;
  }
  return ranks;
};

const bondSymbol = (b: Bond): string => (b.order === 2 ? '=' : b.order === 3 ? '#' : '');

const writeAtomToken = (g: MoleculeGraph, atomId: string): string => {
  const a = g.atomById.get(atomId)!;
  const el = normalizeElementSymbol(a.element);
  const charge = a.charge ?? 0;
  const isotope = a.isotope ?? 0;
  const bondSum = explicitBondOrderSum(g, atomId);
  const implH = implicitHForAtom(el, charge, bondSum);

  if (ORGANIC_SUBSET.has(el) && charge === 0 && isotope === 0 && el !== 'H') {
    return el;
  }
  const chargeStr =
    charge === 0 ? '' : charge > 0 ? `+${charge > 1 ? charge : ''}` : `-${charge < -1 ? -charge : ''}`;
  const hStr = implH > 0 ? (implH > 1 ? `H${implH}` : 'H') : '';
  const isoStr = isotope > 0 ? String(isotope) : '';
  return `[${isoStr}${el}${hStr}${chargeStr}]`;
};

const labelStr = (n: number): string => (n > 9 ? `%${n}` : String(n));

const writeComponent = (mol: Molecule, g: MoleculeGraph, atomIds: string[]): string => {
  const ranks = canonicalRanks(mol, g);
  const inComp = new Set(atomIds);
  let root = atomIds[0];
  for (const id of atomIds) if (ranks.get(id)! < ranks.get(root)!) root = id;

  const orderedNeighbors = (atomId: string): { bondId: string; toId: string }[] => {
    const node = g.nodes.get(atomId)!;
    const list: { bondId: string; toId: string }[] = [];
    for (let k = 0; k < node.neighbors.length; k++) {
      const toId = node.neighbors[k];
      if (inComp.has(toId)) list.push({ bondId: node.bonds[k], toId });
    }
    list.sort((a, b) => ranks.get(a.toId)! - ranks.get(b.toId)!);
    return list;
  };

  // Pass 1: choose spanning tree; leftover edges become ring closures.
  const treeUsed = new Set<string>();
  const ringLabelForBond = new Map<string, number>();
  let ringCounter = 0;
  {
    const seen = new Set<string>();
    const dfs = (atomId: string): void => {
      seen.add(atomId);
      for (const { bondId, toId } of orderedNeighbors(atomId)) {
        if (treeUsed.has(bondId) || ringLabelForBond.has(bondId)) continue;
        if (seen.has(toId)) {
          ringCounter += 1;
          ringLabelForBond.set(bondId, ringCounter);
        } else {
          treeUsed.add(bondId);
          dfs(toId);
        }
      }
    };
    dfs(root);
  }

  // Pass 2: emit.
  const visited = new Set<string>();
  const emit = (atomId: string, incoming: Bond | null): string => {
    visited.add(atomId);
    let out = (incoming ? bondSymbol(incoming) : '') + writeAtomToken(g, atomId);

    const node = g.nodes.get(atomId)!;
    for (const bId of node.bonds) {
      if (ringLabelForBond.has(bId)) {
        const b = g.bondById.get(bId)!;
        out += `${bondSymbol(b)}${labelStr(ringLabelForBond.get(bId)!)}`;
      }
    }

    const children = orderedNeighbors(atomId).filter(
      c => treeUsed.has(c.bondId) && !visited.has(c.toId),
    );
    for (let idx = 0; idx < children.length; idx++) {
      const { bondId, toId } = children[idx];
      if (visited.has(toId)) continue;
      const b = g.bondById.get(bondId)!;
      const sub = emit(toId, b);
      out += idx < children.length - 1 ? `(${sub})` : sub;
    }
    return out;
  };

  return emit(root, null);
};

export const moleculeToSmiles = (mol: Molecule): string => {
  const kek = kekulize(mol);
  const g = buildGraph(kek);
  return connectedComponents(kek)
    .map(ids => writeComponent(kek, g, ids))
    .join('.');
};
