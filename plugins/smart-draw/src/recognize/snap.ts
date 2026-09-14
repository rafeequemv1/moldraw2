import { dist } from './simplify';
import { SNAP_EXISTING_FRAC, type ExistingAtom, type SketchGraph } from './types';

export function snapToExisting(graph: SketchGraph, existing: ExistingAtom[], bondLengthPx: number): SketchGraph {
  const r = SNAP_EXISTING_FRAC * bondLengthPx;
  const used = new Set<string>();
  const atoms = graph.atoms.map(a => {
    let best: { id: string; d: number } | null = null;
    for (const e of existing) {
      if (used.has(e.id)) continue;
      const d = dist(a, e);
      if (d <= r && (!best || d < best.d)) best = { id: e.id, d };
    }
    if (!best) return a;
    used.add(best.id);
    const target = existing.find(e => e.id === best!.id)!;
    return {
      ...a,
      x: target.x,
      y: target.y,
      snappedTo: target.id,
    };
  });
  return { ...graph, atoms };
}
