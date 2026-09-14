import type { CirclePrim, Primitive } from './detectPrimitives';
import type { GlyphHit } from './detectGlyphs';
import { findCycles } from './assembleGraph';
import { dist } from './simplify';
import type { SketchGraph } from './types';

const nearAtom = (graph: SketchGraph, x: number, y: number, r: number) => {
  let best: { id: string; d: number } | null = null;
  for (const a of graph.atoms) {
    const d = dist(a, { x, y });
    if (d <= r && (!best || d < best.d)) best = { id: a.tempId, d };
  }
  return best;
};

export function resolveAmbiguities(
  graph: SketchGraph,
  glyphs: GlyphHit[],
  primitives: Primitive[],
  bondLengthPx: number,
): { graph: SketchGraph; leftoverGlyphs: GlyphHit[] } {
  const next: SketchGraph = {
    ...graph,
    atoms: graph.atoms.map(a => ({ ...a })),
    bonds: graph.bonds.map(b => ({ ...b })),
  };

  const cycles = findCycles(next);
  const atomById = new Map(next.atoms.map(a => [a.tempId, a]));

  const circles = primitives.filter((p): p is CirclePrim => p.kind === 'circle');
  for (const c of circles) {
    const insideRing = cycles.some(cyc => {
      if (cyc.length < 5 || cyc.length > 6) return false;
      let sx = 0;
      let sy = 0;
      for (const id of cyc) {
        const a = atomById.get(id);
        if (!a) return false;
        sx += a.x;
        sy += a.y;
      }
      const cx = sx / cyc.length;
      const cy = sy / cyc.length;
      return dist({ x: c.cx, y: c.cy }, { x: cx, y: cy }) < 0.45 * bondLengthPx;
    });
    if (insideRing) {
      const ring = cycles.find(cyc => {
        if (cyc.length < 5 || cyc.length > 6) return false;
        let sx = 0;
        let sy = 0;
        for (const id of cyc) {
          const a = atomById.get(id)!;
          sx += a.x;
          sy += a.y;
        }
        return dist({ x: c.cx, y: c.cy }, { x: sx / cyc.length, y: sy / cyc.length }) < 0.45 * bondLengthPx;
      });
      if (ring) {
        const set = new Set(ring);
        for (const b of next.bonds) {
          if (set.has(b.fromTempId) && set.has(b.toTempId)) b.aromatic = true;
        }
      }
      continue;
    }
    const hit = nearAtom(next, c.cx, c.cy, 0.55 * bondLengthPx);
    if (hit) {
      const atom = atomById.get(hit.id);
      if (atom) {
        atom.element = 'O';
        atom.confidence = c.confidence;
      }
    }
  }

  const markAromatic = (cyc: string[]) => {
    const set = new Set(cyc);
    for (const b of next.bonds) {
      if (set.has(b.fromTempId) && set.has(b.toTempId)) b.aromatic = true;
    }
  };

  const ringCenterHit = (x: number, y: number): string[] | null => {
    for (const cyc of cycles) {
      if (cyc.length < 5 || cyc.length > 6) continue;
      let sx = 0;
      let sy = 0;
      let ok = true;
      for (const id of cyc) {
        const a = atomById.get(id);
        if (!a) {
          ok = false;
          break;
        }
        sx += a.x;
        sy += a.y;
      }
      if (!ok) continue;
      if (dist({ x, y }, { x: sx / cyc.length, y: sy / cyc.length }) < 0.45 * bondLengthPx) {
        return cyc;
      }
    }
    return null;
  };

  const leftover: GlyphHit[] = [];
  for (const g of glyphs) {
    if (g.name === 'O') {
      const ring = ringCenterHit(g.cx, g.cy);
      if (ring) {
        markAromatic(ring);
        continue;
      }
    }
    leftover.push(g);
  }

  const scores = [
    ...next.atoms.map(a => a.confidence),
    ...next.bonds.map(b => b.confidence),
  ];
  next.confidence = scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : 0;
  return { graph: next, leftoverGlyphs: leftover };
}
