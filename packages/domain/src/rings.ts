import type { Molecule } from './types';

/** Stable key for a cycle (order-independent). Matches prior dedup separator. */
export const ringSignature = (atomIds: string[]): string => [...atomIds].sort().join('\0');

/** Atom ids belonging to tagged chair/boat rings on the molecule. */
export const lockedConformationAtomIds = (mol: Molecule): Set<string> => {
  const out = new Set<string>();
  const conf = mol.ringConformations;
  if (!conf) return out;
  for (const [sig, kind] of Object.entries(conf)) {
    if (kind !== 'chair' && kind !== 'boat') continue;
    for (const id of sig.split('\0')) {
      if (id) out.add(id);
    }
  }
  return out;
};

/** True when any chair/boat conformation is tagged. */
export const hasLockedRingConformations = (mol: Molecule): boolean =>
  lockedConformationAtomIds(mol).size > 0;

/** Chair/boat locks keyed by 0-based atom index (molblock write order). */
export type RingConformationByIndex = {
  atomIndices: number[];
  kind: 'chair' | 'boat';
};

/**
 * Serialize `ringConformations` as atom indices for molblock worker round-trips
 * (parseMolblock mints new ids, so signature keys cannot be forwarded as-is).
 */
export const ringConformationsByAtomIndex = (
  mol: Molecule,
): RingConformationByIndex[] => {
  const conf = mol.ringConformations;
  if (!conf) return [];
  const idToIndex = new Map(mol.atoms.map((a, i) => [a.id, i] as const));
  const out: RingConformationByIndex[] = [];
  for (const [sig, kind] of Object.entries(conf)) {
    if (kind !== 'chair' && kind !== 'boat') continue;
    const ids = sig.split('\0').filter(Boolean);
    const atomIndices: number[] = [];
    let ok = true;
    for (const id of ids) {
      const idx = idToIndex.get(id);
      if (idx == null) {
        ok = false;
        break;
      }
      atomIndices.push(idx);
    }
    if (ok && atomIndices.length >= 3) out.push({ atomIndices, kind });
  }
  return out;
};

/** Re-attach index-based chair/boat locks onto a freshly parsed molecule. */
export const withRingConformationsByAtomIndex = (
  mol: Molecule,
  entries: readonly RingConformationByIndex[] | undefined,
): Molecule => {
  if (!entries?.length) return mol;
  const next: Record<string, 'chair' | 'boat'> = {};
  for (const entry of entries) {
    if (entry.kind !== 'chair' && entry.kind !== 'boat') continue;
    const ids: string[] = [];
    let ok = true;
    for (const idx of entry.atomIndices) {
      const id = mol.atoms[idx]?.id;
      if (!id) {
        ok = false;
        break;
      }
      ids.push(id);
    }
    if (ok && ids.length >= 3) next[ringSignature(ids)] = entry.kind;
  }
  if (Object.keys(next).length === 0) return mol;
  return { ...mol, ringConformations: next };
};

/** Keep only conformation tags whose atoms are all in `atomIds`. */
export const ringConformationsInAtomSet = (
  mol: Molecule,
  atomIds: ReadonlySet<string>,
): Record<string, 'chair' | 'boat'> | undefined => {
  const conf = mol.ringConformations;
  if (!conf) return undefined;
  const next: Record<string, 'chair' | 'boat'> = {};
  for (const [sig, kind] of Object.entries(conf)) {
    if (kind !== 'chair' && kind !== 'boat') continue;
    const ids = sig.split('\0').filter(Boolean);
    if (ids.length >= 3 && ids.every(id => atomIds.has(id))) next[sig] = kind;
  }
  return Object.keys(next).length > 0 ? next : undefined;
};

/** Drop conformation tags whose atom set is no longer fully present. */
export const pruneRingConformations = (mol: Molecule): Molecule => {
  const conf = mol.ringConformations;
  if (!conf || Object.keys(conf).length === 0) return mol;
  const atomIds = new Set(mol.atoms.map(a => a.id));
  let changed = false;
  const next: Record<string, 'chair' | 'boat'> = {};
  for (const [sig, kind] of Object.entries(conf)) {
    const ids = sig.split('\0').filter(Boolean);
    if (ids.length >= 3 && ids.every(id => atomIds.has(id))) {
      next[sig] = kind;
    } else {
      changed = true;
    }
  }
  if (!changed && Object.keys(next).length === Object.keys(conf).length) return mol;
  if (Object.keys(next).length === 0) {
    const { ringConformations: _rc, ...rest } = mol;
    void _rc;
    return rest;
  }
  return { ...mol, ringConformations: next };
};

/**
 * Longest cycle ring perception reports (in bonds). Covers COF pores (COF-1
 * pore = 42 bonds) and cyclodextrins; larger macrocycles are not offered for
 * ring select / ring fill. Bounds the per-bond walk so a document with
 * thousands of structures stays interactive.
 */
export const MAX_PERCEIVED_RING_SIZE = 48;

type GraphIndex = {
  atomIds: Set<string>;
  /** Neighbour lists over every bond (parallel bonds appear twice). */
  adj: Map<string, string[]>;
  rings: string[][] | null;
};

/**
 * Store updates always yield a new `Molecule` reference, so identity-keyed
 * caching is safe: every ring query on the same revision shares one adjacency
 * build and one ring perception pass.
 */
const graphIndexByMolecule = new WeakMap<Molecule, GraphIndex>();

const graphIndexOf = (mol: Molecule): GraphIndex => {
  let idx = graphIndexByMolecule.get(mol);
  if (idx) return idx;
  const atomIds = new Set<string>();
  for (const a of mol.atoms) atomIds.add(a.id);
  const adj = new Map<string, string[]>();
  for (const b of mol.bonds) {
    let f = adj.get(b.fromAtomId);
    if (!f) adj.set(b.fromAtomId, (f = []));
    f.push(b.toAtomId);
    let t = adj.get(b.toAtomId);
    if (!t) adj.set(b.toAtomId, (t = []));
    t.push(b.fromAtomId);
  }
  idx = { atomIds, adj, rings: null };
  graphIndexByMolecule.set(mol, idx);
  return idx;
};

/** Atoms that survive iterative leaf pruning — only these can lie on a cycle. */
const cyclicAtomIds = (adj: Map<string, string[]>): Set<string> => {
  const deg = new Map<string, number>();
  for (const [id, nbrs] of adj) deg.set(id, nbrs.length);
  const stack: string[] = [];
  for (const [id, d] of deg) if (d <= 1) stack.push(id);
  const removed = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (removed.has(id)) continue;
    removed.add(id);
    for (const n of adj.get(id) ?? []) {
      if (removed.has(n)) continue;
      const d = (deg.get(n) ?? 0) - 1;
      deg.set(n, d);
      if (d <= 1) stack.push(n);
    }
  }
  const out = new Set<string>();
  for (const id of adj.keys()) if (!removed.has(id)) out.add(id);
  return out;
};

/**
 * Shortest `from → … → to` path that does not use the direct `from–to` edge
 * (exactly one such edge is skipped, so a parallel duplicate bond still
 * counts). Parent-pointer BFS restricted to `allowed` atoms, depth-capped.
 */
const shortestCyclePath = (
  from: string,
  to: string,
  adj: Map<string, string[]>,
  allowed: Set<string>,
): string[] | null => {
  const startNbrs = adj.get(from);
  if (!startNbrs || !allowed.has(from) || !allowed.has(to)) return null;
  const parent = new Map<string, string | null>([[from, null]]);
  let frontier: string[] = [];
  let skippedDirect = false;
  for (const n of startNbrs) {
    if (n === to && !skippedDirect) {
      skippedDirect = true;
      continue;
    }
    if (!allowed.has(n) || parent.has(n)) continue;
    parent.set(n, from);
    if (n === to) return unwindPath(parent, to);
    frontier.push(n);
  }
  let depth = 1;
  while (frontier.length && depth < MAX_PERCEIVED_RING_SIZE) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const n of adj.get(id) ?? []) {
        if (!allowed.has(n) || parent.has(n)) continue;
        parent.set(n, id);
        if (n === to) return unwindPath(parent, to);
        next.push(n);
      }
    }
    frontier = next;
    depth += 1;
  }
  return null;
};

const unwindPath = (parent: Map<string, string | null>, goal: string): string[] => {
  const path: string[] = [];
  let cur: string | null | undefined = goal;
  while (cur) {
    path.push(cur);
    cur = parent.get(cur);
  }
  return path.reverse();
};

/**
 * Unique simple cycles (one representative path per cycle): for every bond the
 * smallest ring through it, deduplicated. Cached per molecule revision.
 */
export const uniqueRingPaths = (mol: Molecule): string[][] => {
  const idx = graphIndexOf(mol);
  if (idx.rings) return idx.rings;
  const out: string[][] = [];
  const keys = new Set<string>();
  const cyclic = cyclicAtomIds(idx.adj);
  if (cyclic.size >= 3) {
    for (const b of mol.bonds) {
      if (!cyclic.has(b.fromAtomId) || !cyclic.has(b.toAtomId)) continue;
      const p = shortestCyclePath(b.fromAtomId, b.toAtomId, idx.adj, cyclic);
      if (!p || p.length < 3) continue;
      const key = ringSignature(p);
      if (keys.has(key)) continue;
      keys.add(key);
      out.push(p);
    }
  }
  idx.rings = out;
  return out;
};

export const ringsFullyInSelection = (mol: Molecule, selectedAtomIds: string[]): string[][] => {
  if (selectedAtomIds.length === 0) return [];
  const sel = new Set(selectedAtomIds);
  return uniqueRingPaths(mol).filter(ids => ids.every(id => sel.has(id)));
};

export const upsertRingFillsForRings = (
  prev: Molecule,
  ringPaths: string[][],
  color: string,
  opacity: number,
): Molecule => {
  const ringFills: Record<string, { color: string; opacity?: number }> = { ...(prev.ringFills || {}) };
  const op = Math.min(1, Math.max(0.05, opacity));
  for (const p of ringPaths) {
    ringFills[ringSignature(p)] = { color, opacity: op };
  }
  return { ...prev, ringFills };
};

export const removeRingFillsForRings = (prev: Molecule, ringPaths: string[][]): Molecule => {
  const ringFills = { ...(prev.ringFills || {}) };
  for (const p of ringPaths) {
    delete ringFills[ringSignature(p)];
  }
  if (Object.keys(ringFills).length === 0) {
    const { ringFills: _dropped, ...rest } = prev;
    void _dropped;
    return rest as Molecule;
  }
  return { ...prev, ringFills };
};

export const parseRingFillKey = (key: string): string[] =>
  key.length === 0 ? [] : key.split('\0').filter(Boolean);

/** True iff these atoms still form one simple cycle in `mol` (degree 2 in induced subgraph, connected). */
export function isSimpleCycleAtomSet(mol: Molecule, atomIds: string[]): boolean {
  const S = new Set(atomIds);
  if (S.size < 3) return false;
  const idx = graphIndexOf(mol);
  for (const id of S) {
    if (!idx.atomIds.has(id)) return false;
  }
  // Degree 2 inside the induced subgraph (parallel bonds count twice, as before).
  for (const id of S) {
    let d = 0;
    for (const n of idx.adj.get(id) ?? []) if (S.has(n)) d += 1;
    if (d !== 2) return false;
  }
  const start = [...S][0];
  const stack = [start];
  const seen = new Set<string>([start]);
  while (stack.length) {
    const u = stack.pop()!;
    for (const v of idx.adj.get(u) ?? []) {
      if (!S.has(v) || seen.has(v)) continue;
      seen.add(v);
      stack.push(v);
    }
  }
  return seen.size === S.size;
}

/** Cyclic vertex order for drawing / filling (CCW arbitrary start). */
export function orderSimpleCycle(mol: Molecule, atomIds: string[]): string[] | null {
  if (!isSimpleCycleAtomSet(mol, atomIds)) return null;
  const S = new Set(atomIds);
  const adj = graphIndexOf(mol).adj;
  const neigh = (id: string): [string, string] | null => {
    const o: string[] = [];
    for (const n of adj.get(id) ?? []) if (S.has(n)) o.push(n);
    if (o.length !== 2) return null;
    return [o[0], o[1]];
  };
  const v0 = [...S][0];
  const n0p = neigh(v0);
  if (!n0p) return null;
  const [n0] = n0p;
  const path: string[] = [v0];
  let prev = v0;
  let cur = n0;
  while (cur !== v0) {
    path.push(cur);
    const nb = neigh(cur);
    if (!nb) return null;
    const [a, b] = nb;
    const nxt = a === prev ? b : a;
    if (nxt === prev) return null;
    prev = cur;
    cur = nxt;
    if (path.length > S.size) return null;
  }
  return path;
}

/** Migrate legacy global `ringFill`, prune keys for removed/invalid cycles. */
export function normalizeMoleculeRingFills(mol: Molecule): Molecule {
  let next: Molecule = { ...mol };
  if (next.ringFills && Object.keys(next.ringFills).length > 0 && next.ringFill) {
    delete next.ringFill;
  }
  const legacy = next.ringFill;
  if (legacy?.enabled && legacy.color) {
    const paths = uniqueRingPaths(next);
    const fills: Record<string, { color: string; opacity?: number }> = { ...(next.ringFills || {}) };
    for (const p of paths) {
      fills[ringSignature(p)] = {
        color: legacy.color,
        opacity: legacy.opacity ?? 0.5,
      };
    }
    next = { ...next, ringFills: fills };
    delete next.ringFill;
  }
  if (!next.ringFills || Object.keys(next.ringFills).length === 0) {
    const out = { ...next };
    delete out.ringFills;
    return out;
  }
  const rf = { ...next.ringFills };
  for (const k of Object.keys(rf)) {
    const ids = parseRingFillKey(k);
    if (!isSimpleCycleAtomSet(next, ids)) delete rf[k];
  }
  const out = { ...next };
  if (Object.keys(rf).length === 0) delete out.ringFills;
  else out.ringFills = rf;
  return out;
}
