/**
 * Textbook / Ketcher-style aromatic rings: a solid inscribed circle, not a
 * dashed inner companion that reads as a dashed circle around the ring.
 *
 * Complete simple 5–8 membered faces whose every edge is aromatic get a circle.
 * Isolated aromatic bonds (aromatic-bond tool) keep the solid+dashed parallel
 * depiction in `drawBonds`.
 *
 * Face walks must be simple: a dangling / adjacent aromatic bond on a fused
 * Kekulé ring used to close an 8-step walk that revisited the fusion vertex
 * and drew a second, smaller circle inside the real ring.
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

/** True when every vertex appears once (a real ring, not a walk with a spur). */
const isSimpleCycle = (ids: readonly string[]): boolean => {
  if (ids.length < MIN_AROMATIC_CIRCLE_ATOMS || ids.length > MAX_AROMATIC_CIRCLE_ATOMS) {
    return false;
  }
  return new Set(ids).size === ids.length;
};

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

/**
 * Aromatic bond between two non-adjacent vertices of the cycle — the walk is
 * a fused perimeter (or a shortcut), not an SSSR face.
 */
const hasAromaticChord = (ids: readonly string[], bondByEdge: Map<string, Bond>): boolean => {
  const n = ids.length;
  if (n < 4) return false;
  const cycleEdge = new Set<string>();
  for (let i = 0; i < n; i++) {
    cycleEdge.add(edgeKey(ids[i]!, ids[(i + 1) % n]!));
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const k = edgeKey(ids[i]!, ids[j]!);
      if (cycleEdge.has(k)) continue;
      if (bondByEdge.get(k)?.aromatic) return true;
    }
  }
  return false;
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
      const used = new Set([from]);
      let prev = from;
      let cur = to;
      let ok = false;
      while (path.length <= MAX_AROMATIC_CIRCLE_ATOMS) {
        if (cur === from) {
          ok = path.length >= MIN_AROMATIC_CIRCLE_ATOMS;
          break;
        }
        // Revisit = spur / figure-8, not a face.
        if (used.has(cur)) break;
        path.push(cur);
        used.add(cur);
        const nxt = mostCcwNeighbor(prev, cur, adj.get(cur) ?? [], atomById);
        if (!nxt) break;
        prev = cur;
        cur = nxt;
      }
      if (!ok || !isSimpleCycle(path)) continue;
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
    if (!ids || !isSimpleCycle(ids)) return;
    const key = ringKey(ids);
    if (seen.has(key)) return;
    seen.add(key);
    out.push([...ids]);
  };

  let fromBondMap = 0;
  for (const b of mol.bonds) {
    if (!b.aromatic) continue;
    if (ringAtomIdsByBondId.has(b.id)) fromBondMap += 1;
    add(ringAtomIdsByBondId.get(b.id));
  }
  // uniqueRingPaths BFS-per-bond (cap 48) is the slow fallback for ghosts that
  // have no ring map. Skip it when the revision cache already walked rings.
  if (fromBondMap === 0) {
    for (const ids of uniqueRingPaths(mol)) add(ids);
  }
  for (const ids of aromaticFaceCycles(adj, atomById)) add(ids);
  return out;
};

/**
 * A smaller circle whose center sits inside a larger one is the fused-spur
 * artifact (or a perimeter walk), not a second aromatic ring.
 */
const suppressNestedCircles = (circles: AromaticCircle[]): AromaticCircle[] => {
  if (circles.length < 2) return circles;
  const sorted = [...circles].sort((a, b) => b.radius - a.radius);
  const kept: AromaticCircle[] = [];
  for (const c of sorted) {
    const nested = kept.some(k => {
      const d = Math.hypot(c.center.x - k.center.x, c.center.y - k.center.y);
      return d < k.radius - 2 && c.radius < k.radius * 0.92;
    });
    if (!nested) kept.push(c);
  }
  return kept;
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

  const collected: AromaticCircle[] = [];
  for (const ids of candidateCycles(mol, atomById, ringAtomIdsByBondId, adj)) {
    const cycleBonds = cycleBondIdsIfAromatic(ids, bondByEdge);
    if (!cycleBonds) continue;
    if (hasAromaticChord(ids, bondByEdge)) continue;
    const geom = aromaticCircleGeometry(ids, atomById);
    if (!geom) continue;
    collected.push({ atomIds: ids, bondIds: cycleBonds, ...geom });
  }
  const circles = suppressNestedCircles(collected);
  const bondIds = new Set<string>();
  for (const c of circles) {
    for (const id of c.bondIds) bondIds.add(id);
  }
  return { circles, bondIds };
};
