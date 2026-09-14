/**
 * Ring helpers used during canvas rendering — currently the smallest-cycle
 * center calculation that drives "inside" double-bond placement on rings.
 */
import type { Bond, Molecule } from '@moldraw/domain';
import type { Point } from './polygons';

/**
 * Find the smallest cycle that contains `bond` and return its centroid in
 * world coordinates, or null if the bond isn't in any ring. Uses BFS from
 * one endpoint of `bond` to the other while ignoring `bond` itself, then
 * averages the atom positions on the resulting shortest path.
 */
export const getSmallestRingCenter = (bond: Bond, mol: Molecule): Point | null => {
  const adj = new Map<string, string[]>();
  for (const b of mol.bonds) {
    if (b.id === bond.id) continue;
    if (!adj.has(b.fromAtomId)) adj.set(b.fromAtomId, []);
    if (!adj.has(b.toAtomId)) adj.set(b.toAtomId, []);
    adj.get(b.fromAtomId)!.push(b.toAtomId);
    adj.get(b.toAtomId)!.push(b.fromAtomId);
  }

  const queue: { id: string; path: string[] }[] = [
    { id: bond.fromAtomId, path: [bond.fromAtomId] },
  ];
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

  if (shortestRingIds && shortestRingIds.length > 2) {
    let cx = 0;
    let cy = 0;
    let count = 0;
    for (const id of shortestRingIds) {
      const atom = mol.atoms.find(a => a.id === id);
      if (atom) {
        cx += atom.x;
        cy += atom.y;
        count++;
      }
    }
    return { x: cx / count, y: cy / count };
  }
  return null;
};

/**
 * Vertices of the smallest cycle containing `bond` (excluding `bond` itself from
 * the graph walk), in path order from `bond.fromAtomId` to `bond.toAtomId`.
 */
export const getSmallestCycleAtomIds = (bond: Bond, mol: Molecule): string[] | null => {
  const adj = new Map<string, string[]>();
  for (const b of mol.bonds) {
    if (b.id === bond.id) continue;
    if (!adj.has(b.fromAtomId)) adj.set(b.fromAtomId, []);
    if (!adj.has(b.toAtomId)) adj.set(b.toAtomId, []);
    adj.get(b.fromAtomId)!.push(b.toAtomId);
    adj.get(b.toAtomId)!.push(b.fromAtomId);
  }

  const queue: { id: string; path: string[] }[] = [
    { id: bond.fromAtomId, path: [bond.fromAtomId] },
  ];
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
