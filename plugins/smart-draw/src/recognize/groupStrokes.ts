import { bboxOf, dist, endpoints } from './simplify';
import type { Stroke } from './types';

/** Union-find groups of strokes whose endpoints or boxes are close. */
export function groupStrokes(strokes: Stroke[], bondLengthPx: number): Stroke[][] {
  const n = strokes.length;
  if (n === 0) return [];
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  const thresh = bondLengthPx * 0.55;
  const boxes = strokes.map(s => bboxOf(s.points));
  const ends = strokes.map(s => endpoints(s.points));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const ei = ends[i]!;
      const ej = ends[j]!;
      const closeEnds =
        dist(ei.a, ej.a) < thresh ||
        dist(ei.a, ej.b) < thresh ||
        dist(ei.b, ej.a) < thresh ||
        dist(ei.b, ej.b) < thresh;
      const bi = boxes[i]!;
      const bj = boxes[j]!;
      const gapX = Math.max(0, Math.max(bi.minX, bj.minX) === bi.minX ? bj.minX - bi.maxX : bi.minX - bj.maxX);
      const gapY = Math.max(0, Math.max(bi.minY, bj.minY) === bi.minY ? bj.minY - bi.maxY : bi.minY - bj.maxY);
      const boxesNear = gapX < thresh && gapY < thresh;
      if (closeEnds || boxesNear) union(i, j);
    }
  }

  const buckets = new Map<number, Stroke[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const list = buckets.get(r) ?? [];
    list.push(strokes[i]!);
    buckets.set(r, list);
  }
  return [...buckets.values()];
}
