/**
 * Textbook / Ketcher-style aromatic rings: a solid inscribed circle, not a
 * dashed inner companion that reads as a dashed circle around the ring.
 *
 * Complete 5–8 membered rings whose every edge is aromatic get a circle.
 * Isolated aromatic bonds (aromatic-bond tool) keep the solid+dashed parallel
 * depiction in `drawBonds`.
 */
import type { Atom, Bond, Molecule } from '@moldraw/domain';
import { uniqueRingPaths } from '@moldraw/domain';
import { pointSegDist } from './angles';
import type { Point } from './polygons';

/** Smallest ring that still gets a circle (pyrrole / furan / imidazole). */
export const MIN_AROMATIC_CIRCLE_ATOMS = 5;
/** Largest ring that still gets a circle (tropylium / COT). */
export const MAX_AROMATIC_CIRCLE_ATOMS = 8;
/**
 * Inscribed-radius fraction so the stroke sits inside the skeleton, not on
 * the bonds. Regular hexagon, bond 40 px → inradius ≈ 34.6 → circle ≈ 24.
 */
export const AROMATIC_CIRCLE_INSET = 0.7;

export type AromaticCircle = {
  atomIds: string[];
  bondIds: string[];
  center: Point;
  radius: number;
};

const edgeKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

const ringKey = (ids: readonly string[]): string => [...ids].sort().join('\0');

const aromaticCircleGeometry = (
  ids: readonly string[],
  atomById: Map<string, Atom>,
): { center: Point; radius: number } | null => {
  const pts: Point[] = [];
  for (const id of ids) {
    const a = atomById.get(id);
    if (!a) return null;
    pts.push(a);
  }
  const n = pts.length;
  if (n < 3) return null;
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= n;
  cy /= n;

  let inradius = Infinity;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const d = pointSegDist(cx, cy, a.x, a.y, b.x, b.y);
    if (d < inradius) inradius = d;
  }
  if (!Number.isFinite(inradius) || inradius < 6) return null;
  const radius = inradius * AROMATIC_CIRCLE_INSET;
  if (radius < 4) return null;
  return { center: { x: cx, y: cy }, radius };
};

const cycleBondIdsIfAromatic = (
  ids: readonly string[],
  bondByEdge: Map<string, Bond>,
): string[] | null => {
  const bondIds: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const a = ids[i]!;
    const b = ids[(i + 1) % ids.length]!;
    const bond = bondByEdge.get(edgeKey(a, b));
    if (!bond?.aromatic) return null;
    bondIds.push(bond.id);
  }
  return bondIds;
};

/** Tightest CCW (left) turn at `cur` arriving from `prev`. */
const mostCcwNeighbor = (
  prev: string,
  cur: string,
  nbrs: readonly string[],
  atomById: Map<string, Atom>,
): string | null => {
  const c = atomById.get(cur);
  const p = atomById.get(prev);
  if (!c || !p) return null;
  const inx = c.x - p.x;
  const iny = c.y - p.y;
  let best: string | null = null;
  let bestAng = -Infinity;
  for (const n of nbrs) {
    if (n === prev) continue;
    const a = atomById.get(n);
    if (!a) continue;
    const outx = a.x - c.x;
    const outy = a.y - c.y;
    const ang = Math.atan2(inx * outy - iny * outx, inx * outx + iny * outy);
    if (ang > bestAng) {
      bestAng = ang;
      best = n;
    }
  }
  return best;
};

/** Left-hand faces of the aromatic subgraph (catches interior fused hexagons). */
const aromaticFaceCycles = (adj: Map<string, string[]>, atomById: Map<string, Atom>): string[][] => {
  const out: string[][] = [];
  const seen = new Set<string>();
  for (const [from, nbrs] of adj) {
    for (const to of nbrs) {
      const path = [from];
      let prev = from;
      let cur = to;
      let ok = false;
      while (path.length <= MAX_AROMATIC_CIRCLE_ATOMS) {
        if (cur === from) {
          ok = path.length >= MIN_AROMATIC_CIRCLE_ATOMS;
          break;
        }
        path.push(cur);
        const nxt = mostCcwNeighbor(prev, cur, adj.get(cur) ?? [], atomById);
        if (!nxt) break;
        prev = cur;
        cur = nxt;
      }
      if (!ok) continue;
      const key = ringKey(path);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(path);
    }
  }
  return out;
};

const candidateCycles = (
  mol: Molecule,
  atomById: Map<string, Atom>,
  ringAtomIdsByBondId: Map<string, string[]>,
  adj: Map<string, string[]>,
): string[][] => {
  const seen = new Set<string>();
  const out: string[][] = [];
  const add = (ids: readonly string[] | undefined) => {
    if (!ids) return;
    if (ids.length < MIN_AROMATIC_CIRCLE_ATOMS || ids.length > MAX_AROMATIC_CIRCLE_ATOMS) {
      return;
    }
    const key = ringKey(ids);
    if (seen.has(key)) return;
    seen.add(key);
    out.push([...ids]);
  };

  for (const b of mol.bonds) {
    if (!b.aromatic) continue;
    add(ringAtomIdsByBondId.get(b.id));
  }
  for (const ids of uniqueRingPaths(mol)) add(ids);
  for (const ids of aromaticFaceCycles(adj, atomById)) add(ids);
  return out;
};

/**
 * Unique complete aromatic rings that should be drawn with a solid inner
 * circle. `bondIds` is the set of skeleton bonds that must not also get a
 * dashed inner companion (that pair of styles looks like a dashed circle).
 */
export const collectAromaticCircles = (
  mol: Molecule,
  atomById: Map<string, Atom>,
  ringAtomIdsByBondId: Map<string, string[]>,
): { circles: AromaticCircle[]; bondIds: Set<string> } => {
  const bondByEdge = new Map<string, Bond>();
  const adj = new Map<string, string[]>();
  for (const b of mol.bonds) {
    if (!b.aromatic || b.dative || b.dotted || b.queryType) continue;
    bondByEdge.set(edgeKey(b.fromAtomId, b.toAtomId), b);
    let f = adj.get(b.fromAtomId);
    if (!f) adj.set(b.fromAtomId, (f = []));
    f.push(b.toAtomId);
    let t = adj.get(b.toAtomId);
    if (!t) adj.set(b.toAtomId, (t = []));
    t.push(b.fromAtomId);
  }

  const circles: AromaticCircle[] = [];
  const bondIds = new Set<string>();
  for (const ids of candidateCycles(mol, atomById, ringAtomIdsByBondId, adj)) {
    const cycleBonds = cycleBondIdsIfAromatic(ids, bondByEdge);
    if (!cycleBonds) continue;
    const geom = aromaticCircleGeometry(ids, atomById);
    if (!geom) continue;
    circles.push({ atomIds: ids, bondIds: cycleBonds, ...geom });
    for (const id of cycleBonds) bondIds.add(id);
  }
  return { circles, bondIds };
};
