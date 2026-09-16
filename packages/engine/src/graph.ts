/**
 * Lightweight molecule-graph adjacency helpers shared by ring perception,
 * aromaticity, SMILES writing, and layout. Pure functions over `Molecule`.
 */
import type { Atom, Bond, Molecule } from '@moldraw/domain';

export interface AtomNode {
  atom: Atom;
  /** Neighbor atom ids. */
  neighbors: string[];
  /** Incident bond ids, index-aligned with `neighbors`. */
  bonds: string[];
}

export interface MoleculeGraph {
  atomById: Map<string, Atom>;
  bondById: Map<string, Bond>;
  nodes: Map<string, AtomNode>;
  /** Bond id for an unordered atom-id pair, `${a}|${b}` sorted. */
  bondByPair: Map<string, string>;
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

export const buildGraph = (mol: Molecule): MoleculeGraph => {
  const atomById = new Map<string, Atom>();
  const bondById = new Map<string, Bond>();
  const nodes = new Map<string, AtomNode>();
  const bondByPair = new Map<string, string>();

  for (const a of mol.atoms) {
    atomById.set(a.id, a);
    nodes.set(a.id, { atom: a, neighbors: [], bonds: [] });
  }
  for (const b of mol.bonds) {
    if (!atomById.has(b.fromAtomId) || !atomById.has(b.toAtomId)) continue;
    bondById.set(b.id, b);
    bondByPair.set(pairKey(b.fromAtomId, b.toAtomId), b.id);
    const from = nodes.get(b.fromAtomId)!;
    const to = nodes.get(b.toAtomId)!;
    from.neighbors.push(b.toAtomId);
    from.bonds.push(b.id);
    to.neighbors.push(b.fromAtomId);
    to.bonds.push(b.id);
  }

  return { atomById, bondById, nodes, bondByPair };
};

export const bondBetween = (g: MoleculeGraph, a: string, b: string): Bond | undefined => {
  const id = g.bondByPair.get(pairKey(a, b));
  return id ? g.bondById.get(id) : undefined;
};

/** Sum of explicit bond orders incident on an atom (aromatic counted as 1). */
export const explicitBondOrderSum = (g: MoleculeGraph, atomId: string): number => {
  const node = g.nodes.get(atomId);
  if (!node) return 0;
  let sum = 0;
  for (const bid of node.bonds) {
    const b = g.bondById.get(bid);
    if (!b) continue;
    // Dative / dotted (H-bond) bonds do not consume covalent valence on either
    // end — NH₃→M keeps three hydrogens (matches core mutations).
    if (b.dative || b.dotted || b.queryType) continue;
    sum += b.aromatic ? 1 : b.order;
  }
  return sum;
};

export const degree = (g: MoleculeGraph, atomId: string): number =>
  g.nodes.get(atomId)?.neighbors.length ?? 0;

/** Connected components as arrays of atom ids. */
export const connectedComponents = (mol: Molecule): string[][] => {
  const g = buildGraph(mol);
  const seen = new Set<string>();
  const comps: string[][] = [];
  for (const a of mol.atoms) {
    if (seen.has(a.id)) continue;
    const stack = [a.id];
    const comp: string[] = [];
    seen.add(a.id);
    while (stack.length) {
      const u = stack.pop()!;
      comp.push(u);
      for (const n of g.nodes.get(u)?.neighbors ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    comps.push(comp);
  }
  return comps;
};
