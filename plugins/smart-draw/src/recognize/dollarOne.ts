import { centroid, dist, resample } from './simplify';
import type { Point } from './types';

const N = 64;
const SQUARE = 250;

const indicativeAngle = (pts: Point[]): number => {
  const c = centroid(pts);
  return Math.atan2(c.y - pts[0]!.y, c.x - pts[0]!.x);
};

const rotateBy = (pts: Point[], angle: number): Point[] => {
  const c = centroid(pts);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return pts.map(p => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
  });
};

const scaleToSquare = (pts: Point[]): Point[] => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const w = Math.max(1e-6, maxX - minX);
  const h = Math.max(1e-6, maxY - minY);
  return pts.map(p => ({
    x: ((p.x - minX) / w) * SQUARE,
    y: ((p.y - minY) / h) * SQUARE,
  }));
};

const translateToOrigin = (pts: Point[]): Point[] => {
  const c = centroid(pts);
  return pts.map(p => ({ x: p.x - c.x, y: p.y - c.y }));
};

export function normalizeUnistroke(points: Point[]): Point[] {
  const sampled = resample(points, N);
  const rotated = rotateBy(sampled, -indicativeAngle(sampled));
  return translateToOrigin(scaleToSquare(rotated));
}

export interface GlyphTemplate {
  name: string;
  points: Point[];
}

export function matchUnistroke(
  points: Point[],
  templates: GlyphTemplate[],
): { name: string; score: number } | null {
  if (points.length < 4 || templates.length === 0) return null;
  const cand = normalizeUnistroke(points);
  let best = Infinity;
  let name = '';
  for (const t of templates) {
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const a = cand[i]!;
      const b = t.points[i] ?? t.points[t.points.length - 1]!;
      sum += dist(a, b);
    }
    const d = sum / N;
    if (d < best) {
      best = d;
      name = t.name;
    }
  }
  const score = Math.max(0, 1 - best / (0.5 * Math.SQRT2 * SQUARE));
  return { name, score };
}
