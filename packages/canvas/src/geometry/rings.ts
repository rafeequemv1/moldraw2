/**
 * Ring helpers used during canvas rendering — currently the smallest-cycle
 * center calculation that drives "inside" double-bond placement on rings.
 *
 * Adjacency is built once per `Molecule` reference (WeakMap) and shared by
 * every bond query; the BFS uses parent pointers and a depth cap so a lattice
 * with thousands of aromatic bonds (COF, graphene) stays O(bonds × ring size)
 * instead of O(bonds × atoms).
 */
import type { Atom, Bond, Molecule } from '@moldraw/domain';
import type { Point } from './polygons';

/**
 * Longest cycle the walk will report. Larger macrocycles are treated as
 * "not a ring" for double-bond placement, which matches how they are drawn
 * (inner line follows the free side, not a far-away centroid).
 */
const MAX_RING_WALK_DEPTH = 16;

type RingWalkIndex = {
  atomById: Map<string, Atom>;
  /** Every bond. */
  adjAll: Map<string, string[]>;
  /** C–C bonds only (lazy — most molecules never need it). */
  adjCarbon: Map<string, string[]> | null;
};

const indexByMolecule = new WeakMap<Molecule, RingWalkIndex>();

const buildAdjacency = (
  mol: Molecule,
  accept: (b: Bond) => boolean,
): Map<string, string[]> => {
  const adj = new Map<string, string[]>();
  for (const b of mol.bonds) {
    if (!accept(b)) continue;
    let f = adj.get(b.fromAtomId);
    if (!f) adj.set(b.fromAtomId, (f = []));
    f.push(b.toAtomId);
    let t = adj.get(b.toAtomId);
    if (!t) adj.set(b.toAtomId, (t = []));
    t.push(b.fromAtomId);
  }
  return adj;
};

const getIndex = (mol: Molecule): RingWalkIndex => {
  let idx = indexByMolecule.get(mol);
  if (idx) return idx;
  const atomById = new Map<string, Atom>();
  for (const a of mol.atoms) atomById.set(a.id, a);
  idx = { atomById, adjAll: buildAdjacency(mol, () => true), adjCarbon: null };
  indexByMolecule.set(mol, idx);
  return idx;
};

const carbonAdjacency = (mol: Molecule, idx: RingWalkIndex): Map<string, string[]> => {
  if (idx.adjCarbon) return idx.adjCarbon;
  const isC = (id: string) => idx.atomById.get(id)?.element === 'C';
  idx.adjCarbon = buildAdjacency(mol, b => isC(b.fromAtomId) && isC(b.toAtomId));
  return idx.adjCarbon;
};

/**
 * For aromatic C–C doubles in fused frameworks (e.g. COF lattices), walking through
 * B–O or C–O bridges finds the wrong “ring” and flips the inner line outward.
 * Restrict the walk to C–C edges when both bond ends are carbon.
 */
const shouldUseCarbonOnlyRingWalk = (bond: Bond, idx: RingWalkIndex): boolean =>
  idx.atomById.get(bond.fromAtomId)?.element === 'C' &&
  idx.atomById.get(bond.toAtomId)?.element === 'C';

/**
 * Shortest path from `bond.fromAtomId` to `bond.toAtomId` that does not use
 * `bond` itself (the direct hop is skipped at the start node). Parent-pointer
 * BFS, capped at `MAX_RING_WALK_DEPTH` hops.
 */
const shortestCyclePath = (bond: Bond, adj: Map<string, string[]>): string[] | null => {
  const start = bond.fromAtomId;
  const goal = bond.toAtomId;
  const startNbrs = adj.get(start);
  if (!startNbrs || !adj.has(goal)) return null;

  const parent = new Map<string, string | null>([[start, null]]);
  let frontier: string[] = [];
  let skippedDirect = false;
  for (const n of startNbrs) {
    // Ignore exactly one edge to the goal (the bond being placed).
    if (n === goal && !skippedDirect) {
      skippedDirect = true;
      continue;
    }
    if (parent.has(n)) continue;
    parent.set(n, start);
    frontier.push(n);
  }

  let depth = 1;
  while (frontier.length > 0 && depth < MAX_RING_WALK_DEPTH) {
    const next: string[] = [];
    for (const id of frontier) {
      if (id === goal) return unwind(parent, goal);
      for (const n of adj.get(id) ?? []) {
        if (parent.has(n)) continue;
        parent.set(n, id);
        if (n === goal) return unwind(parent, goal);
        next.push(n);
      }
    }
    frontier = next;
    depth += 1;
  }
  return null;
};

const unwind = (parent: Map<string, string | null>, goal: string): string[] => {
  const path: string[] = [];
  let cur: string | null | undefined = goal;
  while (cur) {
    path.push(cur);
    cur = parent.get(cur);
  }
  return path.reverse();
};

const centroidOfAtomIds = (idx: RingWalkIndex, ids: string[]): Point | null => {
  if (ids.length < 3) return null;
  let cx = 0;
  let cy = 0;
  let n = 0;
  for (const id of ids) {
    const atom = idx.atomById.get(id);
    if (!atom) continue;
    cx += atom.x;
    cy += atom.y;
    n += 1;
  }
  if (n < 3) return null;
  return { x: cx / n, y: cy / n };
};

/**
 * Vertices of the smallest cycle containing `bond` (excluding `bond` itself from
 * the graph walk), in path order from `bond.fromAtomId` to `bond.toAtomId`.
 */
export const getSmallestCycleAtomIds = (bond: Bond, mol: Molecule): string[] | null => {
  const idx = getIndex(mol);
  const adj = shouldUseCarbonOnlyRingWalk(bond, idx) ? carbonAdjacency(mol, idx) : idx.adjAll;
  const path = shortestCyclePath(bond, adj);
  return path && path.length > 2 ? path : null;
};

/**
 * Find the smallest cycle that contains `bond` and return its centroid in
 * world coordinates, or null if the bond isn't in any ring.
 */
export const getSmallestRingCenter = (bond: Bond, mol: Molecule): Point | null => {
  const ids = getSmallestCycleAtomIds(bond, mol);
  return ids ? centroidOfAtomIds(getIndex(mol), ids) : null;
};

/** Centroid of already-resolved cycle atoms (avoids a second walk). */
export const ringCenterForCycle = (mol: Molecule, cycleAtomIds: string[]): Point | null =>
  centroidOfAtomIds(getIndex(mol), cycleAtomIds);
