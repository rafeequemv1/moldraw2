import type { Bond, Molecule } from './types';

/** Stable key for a cycle (order-independent). Matches prior dedup separator. */
export const ringSignature = (atomIds: string[]): string => [...atomIds].sort().join('\0');

const getSmallestRingPathIds = (bond: Bond, mol: Molecule): string[] | null => {
  const adj = new Map<string, string[]>();
  for (const b of mol.bonds) {
    if (b.id === bond.id) continue;
    if (!adj.has(b.fromAtomId)) adj.set(b.fromAtomId, []);
    if (!adj.has(b.toAtomId)) adj.set(b.toAtomId, []);
    adj.get(b.fromAtomId)!.push(b.toAtomId);
    adj.get(b.toAtomId)!.push(b.fromAtomId);
  }
  const queue: { id: string; path: string[] }[] = [{ id: bond.fromAtomId, path: [bond.fromAtomId] }];
  const visited = new Set<string>();
  visited.add(bond.fromAtomId);
  let shortestRingIds: string[] | null = null;
  while (queue.length > 0) {
    const { id, path } = queue.shift()!;
    if (id === bond.toAtomId) {
      shortestRingIds = path;
      break;
    }
    const neighbors = adj.get(id) || [];
    for (const n of neighbors) {
      if (!visited.has(n)) {
        visited.add(n);
        queue.push({ id: n, path: [...path, n] });
      }
    }
  }
  if (shortestRingIds && shortestRingIds.length > 2) return shortestRingIds;
  return null;
};

/** Unique simple cycles (one representative path per cycle). */
export const uniqueRingPaths = (mol: Molecule): string[][] => {
  const out: string[][] = [];
  const keys = new Set<string>();
  for (const b of mol.bonds) {
    const p = getSmallestRingPathIds(b, mol);
    if (!p) continue;
    const key = ringSignature(p);
    if (keys.has(key)) continue;
    keys.add(key);
    out.push(p);
  }
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
    const { ringFills: _, ...rest } = prev;
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
  const alive = new Set(mol.atoms.map(a => a.id));
  for (const id of S) {
    if (!alive.has(id)) return false;
  }
  const deg = new Map<string, number>();
  for (const id of S) deg.set(id, 0);
  for (const b of mol.bonds) {
    if (S.has(b.fromAtomId) && S.has(b.toAtomId)) {
      deg.set(b.fromAtomId, (deg.get(b.fromAtomId) || 0) + 1);
      deg.set(b.toAtomId, (deg.get(b.toAtomId) || 0) + 1);
    }
  }
  for (const id of S) {
    if ((deg.get(id) || 0) !== 2) return false;
  }
  const start = [...S][0];
  const stack = [start];
  const seen = new Set<string>([start]);
  while (stack.length) {
    const u = stack.pop()!;
    for (const b of mol.bonds) {
      const v =
        b.fromAtomId === u ? b.toAtomId : b.toAtomId === u ? b.fromAtomId : null;
      if (!v || !S.has(v)) continue;
      if (!seen.has(v)) {
        seen.add(v);
        stack.push(v);
      }
    }
  }
  return seen.size === S.size;
}

/** Cyclic vertex order for drawing / filling (CCW arbitrary start). */
export function orderSimpleCycle(mol: Molecule, atomIds: string[]): string[] | null {
  if (!isSimpleCycleAtomSet(mol, atomIds)) return null;
  const S = new Set(atomIds);
  const neigh = (id: string): [string, string] | null => {
    const o: string[] = [];
    for (const b of mol.bonds) {
      if (b.fromAtomId === id && S.has(b.toAtomId)) o.push(b.toAtomId);
      else if (b.toAtomId === id && S.has(b.fromAtomId)) o.push(b.fromAtomId);
    }
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
