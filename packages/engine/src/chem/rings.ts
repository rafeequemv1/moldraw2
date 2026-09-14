/**
 * Ring perception — Smallest Set of Smallest Rings (SSSR).
 *
 * Replaces the old "smallest ring per bond" heuristic. The SSSR size is
 * |E| − |V| + (number of connected components) per the cyclomatic number.
 * We enumerate candidate small rings (shortest cycle through each bond) and
 * greedily select a linearly independent set (over GF(2) on the bond space)
 * until we reach the ring count. This handles fused and bridged systems
 * (naphthalene, steroids, norbornane) far better than the previous approach.
 */
import type { Molecule } from '@moldraw/domain';
import { buildGraph, type MoleculeGraph } from '../graph';
import type { Ring } from '../types';

const shortestCycleThroughBond = (
  g: MoleculeGraph,
  fromId: string,
  toId: string,
  skipBondId: string,
): string[] | null => {
  // BFS from `fromId` to `toId` with `skipBondId` removed → shortest alt path.
  const prev = new Map<string, string>();
  const visited = new Set<string>([fromId]);
  const queue: string[] = [fromId];
  while (queue.length) {
    const u = queue.shift()!;
    if (u === toId) break;
    const node = g.nodes.get(u);
    if (!node) continue;
    for (let i = 0; i < node.neighbors.length; i++) {
      if (node.bonds[i] === skipBondId) continue;
      const v = node.neighbors[i];
      if (visited.has(v)) continue;
      visited.add(v);
      prev.set(v, u);
      queue.push(v);
    }
  }
  if (!visited.has(toId)) return null;
  const path: string[] = [toId];
  let cur = toId;
  while (cur !== fromId) {
    const p = prev.get(cur);
    if (p === undefined) return null;
    path.push(p);
    cur = p;
  }
  return path.reverse(); // fromId ... toId
};

/** Bond-id set for a ring given its ordered atom ids. */
const ringBondIds = (g: MoleculeGraph, atomIds: string[]): string[] => {
  const ids: string[] = [];
  for (let i = 0; i < atomIds.length; i++) {
    const a = atomIds[i];
    const b = atomIds[(i + 1) % atomIds.length];
    const bid = g.bondByPair.get(a < b ? `${a}|${b}` : `${b}|${a}`);
    if (bid) ids.push(bid);
  }
  return ids;
};

/** XOR two sorted bond-id sets (GF(2) symmetric difference). */
const xorSet = (a: Set<string>, b: Set<string>): Set<string> => {
  const out = new Set(a);
  for (const x of b) {
    if (out.has(x)) out.delete(x);
    else out.add(x);
  }
  return out;
};

/** Is `candidate` independent of the already-chosen basis (Gaussian elim over sets)? */
const isIndependent = (candidate: Set<string>, basis: Set<string>[]): boolean => {
  let cur = new Set(candidate);
  for (const b of basis) {
    // reduce by any basis element sharing a "pivot" bond
    const pivot = [...b][0];
    if (cur.has(pivot)) cur = xorSet(cur, b);
  }
  return cur.size > 0;
};

export const perceiveRings = (mol: Molecule): Ring[] => {
  const g = buildGraph(mol);
  const V = mol.atoms.length;
  const E = mol.bonds.length;
  // components
  const seen = new Set<string>();
  let comps = 0;
  for (const a of mol.atoms) {
    if (seen.has(a.id)) continue;
    comps++;
    const stack = [a.id];
    seen.add(a.id);
    while (stack.length) {
      const u = stack.pop()!;
      for (const n of g.nodes.get(u)?.neighbors ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
  }
  const ringCount = E - V + comps;
  if (ringCount <= 0) return [];

  // Candidate smallest rings: shortest alt-cycle through each bond.
  const candidates: { atomIds: string[]; bondIds: string[]; bondSet: Set<string> }[] = [];
  const seenSig = new Set<string>();
  for (const b of mol.bonds) {
    const path = shortestCycleThroughBond(g, b.fromAtomId, b.toAtomId, b.id);
    if (!path || path.length < 3) continue;
    const bondIds = ringBondIds(g, path);
    if (bondIds.length !== path.length) continue;
    const sig = [...bondIds].sort().join(',');
    if (seenSig.has(sig)) continue;
    seenSig.add(sig);
    candidates.push({ atomIds: path, bondIds, bondSet: new Set(bondIds) });
  }
  candidates.sort((a, b) => a.atomIds.length - b.atomIds.length);

  const basis: Set<string>[] = [];
  const chosen: Ring[] = [];
  for (const cand of candidates) {
    if (chosen.length >= ringCount) break;
    if (!isIndependent(cand.bondSet, basis)) continue;
    basis.push(new Set(cand.bondSet));
    chosen.push({
      atomIds: cand.atomIds,
      bondIds: cand.bondIds,
      size: cand.atomIds.length,
      aromatic: false,
    });
  }
  return chosen;
};

/** Atom ids that belong to at least one perceived ring. */
export const ringAtomIds = (mol: Molecule): Set<string> => {
  const out = new Set<string>();
  for (const r of perceiveRings(mol)) for (const id of r.atomIds) out.add(id);
  return out;
};
