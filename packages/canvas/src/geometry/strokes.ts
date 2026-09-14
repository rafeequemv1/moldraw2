import type { Molecule, Stroke } from '@moldraw/domain';
import type { Point } from './polygons';
import { pointInPolygon, segmentIntersectsRect } from './polygons';

const STROKE_HIT_BASE = 10;

/** Distance from point (px,py) to segment (x1,y1)-(x2,y2). */
const pointSegDist = (
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = x1 + t * dx;
  const qy = y1 + t * dy;
  return Math.hypot(px - qx, py - qy);
};

/** Topmost stroke whose polyline is near (wx, wy). */
export const pickStrokeAt = (mol: Molecule, wx: number, wy: number): Stroke | null => {
  let best: { stroke: Stroke; d: number } | null = null;
  for (const s of mol.strokes ?? []) {
    if (s.points.length < 2) continue;
    const tol = STROKE_HIT_BASE + s.thickness * 0.4;
    for (let i = 0; i < s.points.length - 1; i++) {
      const p0 = s.points[i]!;
      const p1 = s.points[i + 1]!;
      const d = pointSegDist(wx, wy, p0.x, p0.y, p1.x, p1.y);
      if (d >= tol) continue;
      if (!best || d < best.d) best = { stroke: s, d };
    }
  }
  return best?.stroke ?? null;
};

const strokeBounds = (s: Stroke) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of s.points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pad = s.thickness * 0.5 + 4;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
};

const rectsOverlap = (
  aMinX: number,
  aMinY: number,
  aMaxX: number,
  aMaxY: number,
  bMinX: number,
  bMinY: number,
  bMaxX: number,
  bMaxY: number,
): boolean => !(aMaxX < bMinX || aMinX > bMaxX || aMaxY < bMinY || aMinY > bMaxY);

/** All strokes whose geometry intersects the marquee. */
export const collectStrokesInRect = (
  mol: Molecule,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Stroke[] => {
  const hits: Stroke[] = [];
  for (const s of mol.strokes ?? []) {
    if (s.points.length < 2) continue;
    const b = strokeBounds(s);
    if (!rectsOverlap(b.minX, b.minY, b.maxX, b.maxY, minX, minY, maxX, maxY)) continue;
    let hit = s.points.some(
      p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY,
    );
    if (!hit) {
      for (let i = 0; i < s.points.length - 1; i++) {
        const p0 = s.points[i]!;
        const p1 = s.points[i + 1]!;
        if (segmentIntersectsRect(p0.x, p0.y, p1.x, p1.y, minX, minY, maxX, maxY)) {
          hit = true;
          break;
        }
      }
    }
    if (hit) hits.push(s);
  }
  return hits;
};

/** Topmost stroke whose polyline is near (wx, wy). */
export const pickStrokeInRect = (
  mol: Molecule,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Stroke | null => {
  const hits = collectStrokesInRect(mol, minX, minY, maxX, maxY);
  return hits.length > 0 ? hits[hits.length - 1]! : null;
};

export const collectStrokesInPolygon = (mol: Molecule, loop: Point[]): Stroke[] => {
  const hits: Stroke[] = [];
  for (const s of mol.strokes ?? []) {
    if (s.points.some(p => pointInPolygon(p.x, p.y, loop))) hits.push(s);
  }
  return hits;
};

export const pickStrokeInPolygon = (mol: Molecule, loop: Point[]): Stroke | null => {
  const hits = collectStrokesInPolygon(mol, loop);
  return hits.length > 0 ? hits[hits.length - 1]! : null;
};
