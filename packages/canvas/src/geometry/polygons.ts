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

const ringVertices = (ids: string[], atomById: Map<string, Atom>): Atom[] | null => {
  const verts: Atom[] = [];
  for (const id of ids) {
    const a = atomById.get(id);
    if (a) verts.push(a);
  }
  return verts.length < 3 ? null : verts;
};

/**
 * Interior, vertex, or perimeter hit. `verts` follow the ring path order, so
 * perimeter edges are consecutive pairs plus the closing edge — no bond scan.
 */
const ringTouchesPoint = (
  verts: Atom[],
  wx: number,
  wy: number,
  atomRadius: number,
  bondTol: number,
): boolean => {
  // Bounding-box reject first: a document with thousands of rings only pays
  // the polygon test for rings actually near the pointer.
  const pad = Math.max(atomRadius, bondTol);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const a of verts) {
    if (a.x < minX) minX = a.x;
    if (a.x > maxX) maxX = a.x;
    if (a.y < minY) minY = a.y;
    if (a.y > maxY) maxY = a.y;
  }
  if (wx < minX - pad || wx > maxX + pad || wy < minY - pad || wy > maxY + pad) return false;

  if (pointInPolygon(wx, wy, verts)) return true;
  for (const a of verts) {
    if (Math.hypot(a.x - wx, a.y - wy) < atomRadius) return true;
  }
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const a1 = verts[j]!;
    const a2 = verts[i]!;
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
  const rings = uniqueRingPaths(mol);
  if (rings.length === 0) return [];
  const atomById = new Map<string, Atom>();
  for (const a of mol.atoms) atomById.set(a.id, a);
  const hits: { ids: string[]; n: number; area: number }[] = [];
  for (const ids of rings) {
    const verts = ringVertices(ids, atomById);
    if (!verts || !ringTouchesPoint(verts, wx, wy, atomRadius, bondTol)) continue;
    hits.push({ ids, n: ids.length, area: polygonArea(verts) });
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

const cross2d = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
  (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

/** True when segments (a1→a2) and (b1→b2) intersect (inclusive of endpoints). */
export const segmentsIntersect = (
  ax1: number,
  ay1: number,
  ax2: number,
  ay2: number,
  bx1: number,
  by1: number,
  bx2: number,
  by2: number,
): boolean => {
  const d1 = cross2d(ax1, ay1, ax2, ay2, bx1, by1);
  const d2 = cross2d(ax1, ay1, ax2, ay2, bx2, by2);
  const d3 = cross2d(bx1, by1, bx2, by2, ax1, ay1);
  const d4 = cross2d(bx1, by1, bx2, by2, ax2, ay2);
  if (d1 === 0 && d2 === 0 && d3 === 0 && d4 === 0) {
    const overlap1d = (a: number, b: number, c: number, d: number) =>
      Math.max(a, b) >= Math.min(c, d) && Math.max(c, d) >= Math.min(a, b);
    return (
      overlap1d(ax1, ax2, bx1, bx2) &&
      overlap1d(ay1, ay2, by1, by2)
    );
  }
  return d1 * d2 <= 0 && d3 * d4 <= 0;
};

const pointInAxisRect = (
  x: number,
  y: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
) => x >= minX && x <= maxX && y >= minY && y <= maxY;

/** True when any part of segment (x1,y1)-(x2,y2) lies inside or crosses the rect. */
export const segmentIntersectsRect = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean => {
  if (pointInAxisRect(x1, y1, minX, minY, maxX, maxY)) return true;
  if (pointInAxisRect(x2, y2, minX, minY, maxX, maxY)) return true;
  const edges: Array<[number, number, number, number]> = [
    [minX, minY, maxX, minY],
    [maxX, minY, maxX, maxY],
    [maxX, maxY, minX, maxY],
    [minX, maxY, minX, minY],
  ];
  for (const [ex1, ey1, ex2, ey2] of edges) {
    if (segmentsIntersect(x1, y1, x2, y2, ex1, ey1, ex2, ey2)) return true;
  }
  return false;
};
