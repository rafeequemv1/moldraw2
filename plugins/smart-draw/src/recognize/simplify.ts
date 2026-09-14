import type { Point, Stroke } from './types';

export const dist = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

export const pathLength = (pts: Point[]): number => {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += dist(pts[i - 1]!, pts[i]!);
  return n;
};

export const centroid = (pts: Point[]): Point => {
  if (pts.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
};

export const bboxOf = (pts: Point[]): { minX: number; minY: number; maxX: number; maxY: number; diag: number } => {
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
  return { minX, minY, maxX, maxY, diag: Math.hypot(maxX - minX, maxY - minY) };
};

export function resample(points: Point[], n: number): Point[] {
  if (points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: n }, () => ({ ...points[0]! }));
  const total = pathLength(points);
  const step = total / (n - 1);
  const out: Point[] = [{ ...points[0]! }];
  let acc = 0;
  let i = 1;
  let prev = points[0]!;
  while (out.length < n && i < points.length) {
    const cur = points[i]!;
    const d = dist(prev, cur);
    if (acc + d >= step) {
      const t = (step - acc) / d;
      const nx = prev.x + t * (cur.x - prev.x);
      const ny = prev.y + t * (cur.y - prev.y);
      const p = { x: nx, y: ny };
      out.push(p);
      prev = p;
      acc = 0;
    } else {
      acc += d;
      prev = cur;
      i += 1;
    }
  }
  while (out.length < n) out.push({ ...points[points.length - 1]! });
  return out;
}

/** Ramer–Douglas–Peucker */
export function rdp(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points.slice();
  let maxD = 0;
  let idx = 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const vx = last.x - first.x;
  const vy = last.y - first.y;
  const vlen = Math.hypot(vx, vy) || 1;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    const d = Math.abs(vy * p.x - vx * p.y + last.x * first.y - last.y * first.x) / vlen;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > epsilon) {
    const left = rdp(points.slice(0, idx + 1), epsilon);
    const right = rdp(points.slice(idx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

export function simplifyStroke(stroke: Stroke, bondLengthPx: number): Stroke {
  const pts = stroke.points;
  if (pts.length < 3) return { points: pts.slice() };
  const eps = Math.max(1.5, bondLengthPx * 0.04);
  const closed = isClosed(pts, pathLength(pts));
  const nearlyLoop = dist(pts[0]!, pts[pts.length - 1]!) < 0.08 * bondLengthPx;
  const body = closed && nearlyLoop ? pts.slice(0, -1) : pts;
  const simplified = rdp(body, eps);
  if (simplified.length < 2) return { points: pts.slice() };
  if (closed && simplified.length >= 3) {
    return { points: [...simplified, { ...simplified[0]! }] };
  }
  return { points: simplified };
}

export const endpoints = (pts: Point[]): { a: Point; b: Point } => ({
  a: pts[0]!,
  b: pts[pts.length - 1]!,
});

export const isClosed = (pts: Point[], pathLen: number): boolean => {
  if (pts.length < 3 || pathLen <= 0) return false;
  return dist(pts[0]!, pts[pts.length - 1]!) < 0.22 * pathLen;
};

export const straightness = (pts: Point[]): number => {
  const len = pathLength(pts);
  if (len <= 0) return 0;
  return dist(pts[0]!, pts[pts.length - 1]!) / len;
};

/** 4π area / perimeter² — 1 for a circle. */
export const circularity = (pts: Point[]): number => {
  if (pts.length < 4) return 0;
  const peri = pathLength(pts) + dist(pts[pts.length - 1]!, pts[0]!);
  if (peri <= 0) return 0;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  area = Math.abs(area) / 2;
  return (4 * Math.PI * area) / (peri * peri);
};

export function detectCorners(pts: Point[], minTurnDeg = 36): Point[] {
  if (pts.length < 3) return pts.slice();
  const minTurn = (minTurnDeg * Math.PI) / 180;
  const corners: Point[] = [pts[0]!];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    const a1 = Math.atan2(b.y - a.y, b.x - a.x);
    const a2 = Math.atan2(c.y - b.y, c.x - b.x);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    if (Math.abs(d) > minTurn) corners.push(b);
  }
  corners.push(pts[pts.length - 1]!);
  return corners;
}
