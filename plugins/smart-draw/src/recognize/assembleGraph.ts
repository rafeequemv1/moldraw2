import { pairParallelBonds, type Primitive } from './detectPrimitives';
import { dist } from './simplify';
import { CLUSTER_FRAC, type SketchAtom, type SketchBond, type SketchGraph } from './types';

const tempId = (i: number) => `t${i}`;

export function assembleGraph(primitives: Primitive[], bondLengthPx: number): SketchGraph {
  const clusterR = CLUSTER_FRAC * bondLengthPx;
  const verts: { x: number; y: number }[] = [];

  const addVert = (p: { x: number; y: number }): number => {
    for (let i = 0; i < verts.length; i++) {
      if (dist(verts[i]!, p) <= clusterR) {
        verts[i] = {
          x: (verts[i]!.x + p.x) / 2,
          y: (verts[i]!.y + p.y) / 2,
        };
        return i;
      }
    }
    verts.push({ x: p.x, y: p.y });
    return verts.length - 1;
  };

  const edgeSet = new Map<string, { a: number; b: number; order: 1 | 2 | 3; confidence: number; aromatic?: boolean }>();
  const addEdge = (ia: number, ib: number, order: 1 | 2 | 3, confidence: number, aromatic?: boolean) => {
    if (ia === ib) return;
    const key = ia < ib ? `${ia}|${ib}` : `${ib}|${ia}`;
    const prev = edgeSet.get(key);
    if (prev) {
      prev.order = Math.max(prev.order, order) as 1 | 2 | 3;
      prev.confidence = Math.max(prev.confidence, confidence);
      if (aromatic) prev.aromatic = true;
      return;
    }
    edgeSet.set(key, { a: ia, b: ib, order, confidence, aromatic });
  };

  const lines = primitives.filter(p => p.kind === 'line');
  const parallel = pairParallelBonds(lines, bondLengthPx);

  for (const p of primitives) {
    if (p.kind === 'ring') {
      const ids = p.vertices.map(v => addVert(v));
      for (let i = 0; i < ids.length; i++) {
        addEdge(ids[i]!, ids[(i + 1) % ids.length]!, 1, p.confidence);
      }
    } else if (p.kind === 'line') {
      const ia = addVert(p.a);
      const ib = addVert(p.b);
      const par = parallel.get(p.strokeIndex);
      addEdge(ia, ib, par?.order ?? 1, p.confidence);
    }
  }

  // Close a nearly-finished ring drawn as separate sides (hexagon → C6, not a path).
  if (verts.length >= 3 && verts.length <= 8) {
    const degree = new Array(verts.length).fill(0);
    for (const e of edgeSet.values()) {
      degree[e.a]! += 1;
      degree[e.b]! += 1;
    }
    const ends: number[] = [];
    for (let i = 0; i < verts.length; i++) {
      if (degree[i] === 1) ends.push(i);
    }
    if (ends.length === 2) {
      const [ia, ib] = ends;
      if (ia != null && ib != null && dist(verts[ia]!, verts[ib]!) < 0.45 * bondLengthPx) {
        addEdge(ia, ib, 1, 0.82);
      }
    }
  }

  const atoms: SketchAtom[] = verts.map((v, i) => ({
    tempId: tempId(i),
    x: v.x,
    y: v.y,
    element: 'C',
    confidence: 1,
  }));

  const bonds: SketchBond[] = [...edgeSet.values()].map(e => ({
    fromTempId: tempId(e.a),
    toTempId: tempId(e.b),
    order: e.order,
    aromatic: e.aromatic,
    confidence: e.confidence,
  }));

  return {
    atoms,
    bonds,
    rejectedStrokes: [],
    confidence: bonds.length ? bonds.reduce((s, b) => s + b.confidence, 0) / bonds.length : 0,
    candidates: [],
  };
}

/** Cycles of length 3–8 in the assembled graph (fused rings). */
export function findCycles(graph: SketchGraph): string[][] {
  const adj = new Map<string, string[]>();
  for (const a of graph.atoms) adj.set(a.tempId, []);
  for (const b of graph.bonds) {
    adj.get(b.fromTempId)?.push(b.toTempId);
    adj.get(b.toTempId)?.push(b.fromTempId);
  }
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const nodes = graph.atoms.map(a => a.tempId);

  const keyOf = (ids: string[]) => [...ids].sort().join('|');

  const dfs = (start: string, cur: string, path: string[]) => {
    if (path.length > 8) return;
    for (const nxt of adj.get(cur) ?? []) {
      if (nxt === start && path.length >= 3) {
        const k = keyOf(path);
        if (!seen.has(k)) {
          seen.add(k);
          cycles.push([...path]);
        }
        continue;
      }
      if (path.includes(nxt)) continue;
      if (nxt < start) continue;
      path.push(nxt);
      dfs(start, nxt, path);
      path.pop();
    }
  };

  for (const n of nodes) dfs(n, n, [n]);
  return cycles;
}
