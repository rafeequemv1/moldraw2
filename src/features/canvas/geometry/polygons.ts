/**
 * Polygon geometry used for hit-testing, ring detection, and lasso selection.
 */
import type { Atom, Molecule } from '@moldraw/domain';
import { uniqueRingPaths } from '@moldraw/domain';
import { pointSegDist } from './angles';

export interface Point {
  x: number;
  y: number;
}

/** World-space pan offset (px) and zoom factor for the infinite canvas. */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/** Signed area magnitude (always positive) of a 2D polygon via the shoelace formula. */
export const polygonArea = (poly: Point[]): number => {
  if (poly.length < 3) return 0;
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  }
  return Math.abs(a / 2);
};

/** Standard ray-casting point-in-polygon test. */
export const pointInPolygon = (x: number, y: number, poly: Point[]): boolean => {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const denom = yj - yi || 1e-12;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / denom + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

const ringHitScore = (ids: string[], mol: Molecule): { n: number; area: number } | null => {
  const verts = ids.map(id => mol.atoms.find(a => a.id === id)).filter((a): a is Atom => !!a);
  if (verts.length < 3) return null;
  const poly = verts.map(a => ({ x: a.x, y: a.y }));
  return { n: ids.length, area: polygonArea(poly) };
};

const ringTouchesPoint = (
  ids: string[],
  mol: Molecule,
  wx: number,
  wy: number,
  atomRadius: number,
  bondTol: number,
): boolean => {
  const score = ringHitScore(ids, mol);
  if (!score) return false;
  const verts = ids.map(id => mol.atoms.find(a => a.id === id)).filter((a): a is Atom => !!a);
  const poly = verts.map(a => ({ x: a.x, y: a.y }));
  if (pointInPolygon(wx, wy, poly)) return true;

  const idSet = new Set(ids);
  for (const a of verts) {
    if (Math.hypot(a.x - wx, a.y - wy) < atomRadius) return true;
  }
  for (const b of mol.bonds) {
    if (!idSet.has(b.fromAtomId) || !idSet.has(b.toAtomId)) continue;
    const a1 = mol.atoms.find(a => a.id === b.fromAtomId);
    const a2 = mol.atoms.find(a => a.id === b.toAtomId);
    if (!a1 || !a2) continue;
    if (pointSegDist(wx, wy, a1.x, a1.y, a2.x, a2.y) < bondTol) return true;
  }
  return false;
};

/**
 * All simple rings under the pointer, smallest first. Matches interior clicks,
 * atom clicks on the ring, and bond clicks on the ring perimeter.
 */
export const findRingsAtPoint = (
  mol: Molecule,
  wx: number,
  wy: number,
  opts?: { atomRadius?: number; bondTol?: number },
): string[][] => {
  const atomRadius = opts?.atomRadius ?? 15;
  const bondTol = opts?.bondTol ?? 12;
  const hits: { ids: string[]; n: number; area: number }[] = [];
  for (const ids of uniqueRingPaths(mol)) {
    if (!ringTouchesPoint(ids, mol, wx, wy, atomRadius, bondTol)) continue;
    const score = ringHitScore(ids, mol);
    if (score) hits.push({ ids, ...score });
  }
  hits.sort((x, y) => x.n - y.n || x.area - y.area);
  return hits.map(h => h.ids);
};

/** Smallest ring at the pointer (see `findRingsAtPoint`). */
export const findSmallestRingAtPoint = (
  mol: Molecule,
  wx: number,
  wy: number,
  opts?: { atomRadius?: number; bondTol?: number },
): string[] | null => {
  const rings = findRingsAtPoint(mol, wx, wy, opts);
  return rings[0] ?? null;
};
