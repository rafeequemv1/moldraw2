/**
 * Bridged / cage ring detection and KK-style layout for hard polycyclics.
 */
import type { MoleculeGraph } from '../graph';
import type { Ring } from '../types';
import { bondBetween } from '../graph';
import { centroidOf, type Vec } from './layoutGeometry';

/** True when two rings share more than one edge (bridged / fused beyond simple). */
export const ringsShareBridge = (r1: Ring, r2: Ring): boolean => {
  const set1 = new Set(r1.atomIds);
  let shared = 0;
  for (const id of r2.atomIds) {
    if (set1.has(id)) shared++;
  }
  return shared >= 2;
};

/** Detect cage-like systems (3+ rings with mutual bridges). */
export const isBridgedRingSystem = (rings: Ring[]): boolean => {
  if (rings.length < 3) return false;
  let bridgePairs = 0;
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      if (ringsShareBridge(rings[i]!, rings[j]!)) bridgePairs++;
    }
  }
  return bridgePairs >= 2;
};

const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Kamada-Kawai–style spring layout on a subset of atoms.
 * Seeds from current positions; refines to uniform edge lengths.
 */
export const kkRefinePositions = (
  g: MoleculeGraph,
  atomIds: string[],
  pos: Map<string, Vec>,
  bondLen: number,
  iterations = 40,
): void => {
  const idSet = new Set(atomIds);
  const ideal = bondLen;
  const n = atomIds.length;
  if (n < 3) return;

  const get = (id: string): Vec => pos.get(id) ?? { x: 0, y: 0 };
  const set = (id: string, p: Vec): void => {
    pos.set(id, p);
  };

  for (let iter = 0; iter < iterations; iter++) {
    for (const id of atomIds) {
      const p = get(id);
      let fx = 0;
      let fy = 0;
      for (const nb of g.nodes.get(id)?.neighbors ?? []) {
        if (!idSet.has(nb)) continue;
        const q = get(nb);
        const d = dist(p, q);
        if (d < 1e-6) continue;
        const stretch = (d - ideal) / d;
        fx += stretch * (q.x - p.x);
        fy += stretch * (q.y - p.y);
      }
      const step = 0.15 / Math.max(1, (g.nodes.get(id)?.neighbors.length ?? 1));
      set(id, { x: p.x + fx * step, y: p.y + fy * step });
    }
  }
};

/** MDS seed: place ring centroids on a circle, then expand atoms. */
export const mdsSeedRingCentroids = (
  rings: Ring[],
  pos: Map<string, Vec>,
  bondLen: number,
  origin: Vec,
): void => {
  const n = rings.length;
  if (n === 0) return;
  const centroids: Vec[] = rings.map(r => {
    const pts = r.atomIds.map((id: string) => pos.get(id)).filter(Boolean) as Vec[];
    return pts.length ? centroidOf(r.atomIds, pos) : origin;
  });
  const radius = bondLen * Math.max(3, n);
  rings.forEach((ring, i) => {
    const angle = (2 * Math.PI * i) / n;
    const cx = origin.x + radius * Math.cos(angle);
    const cy = origin.y + radius * Math.sin(angle);
    const oldC = centroids[i]!;
    const dx = cx - oldC.x;
    const dy = cy - oldC.y;
    for (const id of ring.atomIds) {
      const p = pos.get(id);
      if (p) pos.set(id, { x: p.x + dx, y: p.y + dy });
    }
  });
};

/**
 * Layout bridged ring atoms: MDS centroid seed + KK refine.
 */
export const layoutBridgedComponent = (
  g: MoleculeGraph,
  rings: Ring[],
  ringAtomSet: Set<string>,
  pos: Map<string, Vec>,
  bondLen: number,
  origin: Vec,
): void => {
  if (!isBridgedRingSystem(rings)) return;
  mdsSeedRingCentroids(rings, pos, bondLen, origin);
  const ids = [...ringAtomSet];
  kkRefinePositions(g, ids, pos, bondLen, 50);
};

/** Count bridge edges between ring atom sets. */
export const bridgeEdgeCount = (
  g: MoleculeGraph,
  ringAtomSet: Set<string>,
): number => {
  let bridges = 0;
  const seen = new Set<string>();
  for (const id of ringAtomSet) {
    for (const nb of g.nodes.get(id)?.neighbors ?? []) {
      if (!ringAtomSet.has(nb)) continue;
      const key = id < nb ? `${id}|${nb}` : `${nb}|${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const b = bondBetween(g, id, nb);
      if (b) bridges++;
    }
  }
  const ringBonds = new Set<string>();
  for (const id of ringAtomSet) {
    for (const nb of g.nodes.get(id)?.neighbors ?? []) {
      if (!ringAtomSet.has(nb)) continue;
      const key = id < nb ? `${id}|${nb}` : `${nb}|${id}`;
      ringBonds.add(key);
    }
  }
  return Math.max(0, ringBonds.size - ringAtomSet.size);
};
