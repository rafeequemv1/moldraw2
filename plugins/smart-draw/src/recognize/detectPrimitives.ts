import {
  circularity,
  detectCorners,
  dist,
  endpoints,
  isClosed,
  pathLength,
  rdp,
  straightness,
} from './simplify';
import type { Point, RecognitionCandidate, Stroke } from './types';

export interface LinePrim {
  kind: 'line';
  a: Point;
  b: Point;
  strokeIndex: number;
  confidence: number;
}

export interface RingPrim {
  kind: 'ring';
  vertices: Point[];
  center: Point;
  numSides: number;
  strokeIndex: number;
  confidence: number;
  circular: boolean;
}

export interface CirclePrim {
  kind: 'circle';
  cx: number;
  cy: number;
  radius: number;
  strokeIndex: number;
  confidence: number;
}

export type Primitive = LinePrim | RingPrim | CirclePrim;

const regularize = (n: number, center: Point, radius: number, angle0: number): Point[] => {
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = angle0 + (i * 2 * Math.PI) / n;
    pts.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  return pts;
};

const centroidOf = (pts: Point[]): Point => {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(1, pts.length);
  return { x: x / n, y: y / n };
};

const meanRadius = (pts: Point[], center: Point): number => {
  if (pts.length === 0) return 0;
  let s = 0;
  for (const p of pts) s += dist(p, center);
  return s / pts.length;
};

/** Closed-path vertices after a second, looser RDP so edge wobble is not extra sides. */
export function closedPolygonVertices(pts: Point[], bondLengthPx: number): Point[] {
  if (pts.length < 3) return pts.slice();
  const nearlyLoop = dist(pts[0]!, pts[pts.length - 1]!) < 0.28 * bondLengthPx;
  const body = nearlyLoop ? pts.slice(0, -1) : pts;
  const simplified = rdp(body, Math.max(3, bondLengthPx * 0.12));
  const verts: Point[] = [];
  for (const p of simplified) {
    if (verts.length === 0 || dist(verts[verts.length - 1]!, p) > 0.2 * bondLengthPx) {
      verts.push(p);
    }
  }
  if (verts.length >= 2 && dist(verts[0]!, verts[verts.length - 1]!) < 0.28 * bondLengthPx) {
    verts.pop();
  }
  return verts;
}

/**
 * Side count for a closed stroke. Never use pathLength / bondLength — wobble
 * and a larger-than-canvas hexagon both inflate that into 7–8 gons.
 */
const hasShortKink = (verts: Point[]): boolean => {
  if (verts.length < 4) return false;
  const edges: number[] = [];
  for (let i = 0; i < verts.length; i++) {
    edges.push(dist(verts[i]!, verts[(i + 1) % verts.length]!));
  }
  const sorted = [...edges].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 1;
  const shortest = sorted[0] ?? 0;
  return shortest < 0.48 * median;
};

export function inferRingSides(pts: Point[], bondLengthPx: number, circ: number): number {
  const verts = closedPolygonVertices(pts, bondLengthPx);
  const n = verts.length;
  if (n >= 3 && n <= 8) {
    // Extra wobble vertex on a hexagon (short kink), not a true 7-/8-gon.
    if ((n === 7 || n === 8) && hasShortKink(verts) && circ >= 0.82) return 6;
    return n;
  }
  // Smooth circle (benzene convention) — not a tiny oxygen mark.
  if (circ >= 0.9) return 6;
  return Math.min(8, Math.max(3, n || 6));
}

const ringFromClosed = (
  pts: Point[],
  strokeIndex: number,
  bondLengthPx: number,
  circ: number,
): RingPrim => {
  const verts = closedPolygonVertices(pts, bondLengthPx);
  const n = inferRingSides(pts, bondLengthPx, circ);
  const center = centroidOf(pts);
  const radius = Math.max(
    0.55 * bondLengthPx,
    meanRadius(verts.length >= 3 ? verts : pts, center),
  );
  const first = verts[0] ?? pts[0]!;
  const angle0 = Math.atan2(first.y - center.y, first.x - center.x);
  const confidence = Math.min(0.97, 0.72 + (circ > 0.8 ? 0.12 : 0.08) + Math.min(0.08, n / 50));
  return {
    kind: 'ring',
    vertices: regularize(n, center, radius, angle0),
    center,
    numSides: n,
    strokeIndex,
    confidence,
    circular: circ > 0.9,
  };
};

export function detectPrimitives(
  strokes: Stroke[],
  used: Set<number>,
  bondLengthPx: number,
): { primitives: Primitive[]; candidates: RecognitionCandidate[] } {
  const primitives: Primitive[] = [];
  const candidates: RecognitionCandidate[] = [];

  strokes.forEach((stroke, i) => {
    if (used.has(i)) return;
    const pts = stroke.points;
    const len = pathLength(pts);
    if (len < 0.2 * bondLengthPx) return;
    const closed = isClosed(pts, len) || dist(pts[0]!, pts[pts.length - 1]!) < 0.35 * bondLengthPx;
    const circ = circularity(pts);
    const corners = detectCorners(pts, 42);
    const uniqueCorners = corners.filter((p, idx) => {
      if (idx === 0) return true;
      return dist(p, corners[idx - 1]!) > 0.2 * bondLengthPx;
    });

    if (closed && circ > 0.82) {
      const box = { cx: 0, cy: 0, r: 0 };
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      box.cx = (minX + maxX) / 2;
      box.cy = (minY + maxY) / 2;
      box.r = Math.max(maxX - minX, maxY - minY) / 2;
      if (box.r < 0.45 * bondLengthPx) {
        primitives.push({
          kind: 'circle',
          cx: box.cx,
          cy: box.cy,
          radius: box.r,
          strokeIndex: i,
          confidence: circ,
        });
        candidates.push({ type: 'atom', confidence: circ, geometry: { circle: box } });
        return;
      }
      const ring = ringFromClosed(pts, i, bondLengthPx, circ);
      primitives.push(ring);
      candidates.push({ type: 'ring', confidence: ring.confidence, geometry: { n: ring.numSides, circular: ring.circular } });
      return;
    }

    if (closed) {
      const ring = ringFromClosed(pts, i, bondLengthPx, circ);
      primitives.push(ring);
      candidates.push({ type: 'ring', confidence: ring.confidence, geometry: { n: ring.numSides } });
      return;
    }

    const str = straightness(pts);
    if (str > 0.88 && len > 0.4 * bondLengthPx) {
      const { a, b } = endpoints(pts);
      primitives.push({ kind: 'line', a, b, strokeIndex: i, confidence: str });
      candidates.push({ type: 'bond', confidence: str, geometry: { a, b } });
      return;
    }

    // Open polyline → chain of segments between corners.
    if (uniqueCorners.length >= 3 && str < 0.9) {
      for (let k = 0; k < uniqueCorners.length - 1; k++) {
        const a = uniqueCorners[k]!;
        const b = uniqueCorners[k + 1]!;
        if (dist(a, b) < 0.35 * bondLengthPx) continue;
        primitives.push({ kind: 'line', a, b, strokeIndex: i, confidence: 0.78 });
        candidates.push({ type: 'bond', confidence: 0.78, geometry: { a, b, chain: true } });
      }
    }
  });

  return { primitives, candidates };
}

export function pairParallelBonds(lines: LinePrim[], bondLengthPx: number): Map<number, { order: 2 | 3; partner: number }> {
  const out = new Map<number, { order: 2 | 3; partner: number }>();
  const angle = (l: LinePrim) => Math.atan2(l.b.y - l.a.y, l.b.x - l.a.x);
  const mid = (l: LinePrim) => ({ x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 });
  const len = (l: LinePrim) => dist(l.a, l.b);

  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const A = lines[i]!;
      const B = lines[j]!;
      let da = angle(A) - angle(B);
      while (da > Math.PI / 2) da -= Math.PI;
      while (da < -Math.PI / 2) da += Math.PI;
      if (Math.abs(da) > 0.22) continue;
      const md = dist(mid(A), mid(B));
      if (md < 0.1 * bondLengthPx || md > 0.34 * bondLengthPx) continue;
      const ratio = Math.min(len(A), len(B)) / Math.max(len(A), len(B));
      if (ratio < 0.68) continue;
      out.set(A.strokeIndex, { order: 2, partner: B.strokeIndex });
      out.set(B.strokeIndex, { order: 2, partner: A.strokeIndex });
    }
  }
  return out;
}
