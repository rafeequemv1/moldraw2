/**
 * 3-connected honeycomb: nodes at hex-pore vertices, edges = linkers.
 * Packing adds shared pores; unsaturated node slots become outer terminals.
 */
import { axialToWorld, nearestAngle, posKey, rectangularHexCells, wrapPi } from '../geometry';

export type HoneycombNodeType = 'A' | 'B';

export type HoneycombNode = {
  key: string;
  x: number;
  y: number;
  type: HoneycombNodeType;
  /** Three attachment angles (radians), 120° apart. */
  attachments: readonly number[];
};

export type HoneycombEdge = {
  fromKey: string;
  toKey: string;
  fromAngle: number;
  toAngle: number;
};

export type HoneycombTerminal = {
  nodeKey: string;
  angle: number;
};

const TYPE_A = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3] as const;
const TYPE_B = [Math.PI / 3, Math.PI, (5 * Math.PI) / 3] as const;

const attachmentsFor = (type: HoneycombNodeType): readonly number[] =>
  type === 'A' ? TYPE_A : TYPE_B;

export type HoneycombLattice = {
  nodes: HoneycombNode[];
  edges: HoneycombEdge[];
  terminals: HoneycombTerminal[];
};

/**
 * Pore-center offsets for a cols×rows pack. The (0,0) cell is the seed
 * (omitted); copies are translations only (`rot = 0`).
 */
export function honeycombPoreOffsets(
  cols: number,
  rows: number,
  nodeSpacing: number,
): Array<{ dx: number; dy: number }> {
  const origin = axialToWorld(0, 0, nodeSpacing);
  const out: Array<{ dx: number; dy: number }> = [];
  for (const { q, r } of rectangularHexCells(cols, rows)) {
    if (q === 0 && r === 0) continue;
    const p = axialToWorld(q, r, nodeSpacing);
    out.push({ dx: p.x - origin.x, dy: p.y - origin.y });
  }
  return out;
}

/**
 * Build a cols×rows packing of flat-top hexagonal pores.
 * `nodeSpacing` is node-center to neighboring node-center.
 * The (0,0) pore stays at `(cx, cy)` so live instances match a baked sheet.
 */
export function buildHoneycombLattice(
  cols: number,
  rows: number,
  nodeSpacing: number,
  cx: number,
  cy: number,
): HoneycombLattice {
  const rawCenters = rectangularHexCells(cols, rows).map(({ q, r }) =>
    axialToWorld(q, r, nodeSpacing),
  );

  const nodeByKey = new Map<string, HoneycombNode>();
  const edgeKeys = new Set<string>();
  const edges: HoneycombEdge[] = [];

  const ensureNode = (x: number, y: number, type: HoneycombNodeType): HoneycombNode => {
    const key = posKey(x, y);
    const existing = nodeByKey.get(key);
    if (existing) return existing;
    const node: HoneycombNode = {
      key,
      x,
      y,
      type,
      attachments: attachmentsFor(type),
    };
    nodeByKey.set(key, node);
    return node;
  };

  for (const c of rawCenters) {
    const hx = cx + c.x;
    const hy = cy + c.y;
    const verts: HoneycombNode[] = [];
    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI) / 3;
      const type: HoneycombNodeType = i % 2 === 0 ? 'A' : 'B';
      verts.push(
        ensureNode(hx + nodeSpacing * Math.cos(ang), hy + nodeSpacing * Math.sin(ang), type),
      );
    }
    for (let i = 0; i < 6; i++) {
      const v0 = verts[i]!;
      const v1 = verts[(i + 1) % 6]!;
      // Canonical direction (by node key), independent of which pore touched the
      // edge first — keeps linker atom ids / orientation stable when the pack grows.
      const [a, b] = v0.key < v1.key ? [v0, v1] : [v1, v0];
      const pair = `${a.key}|${b.key}`;
      if (edgeKeys.has(pair)) continue;
      edgeKeys.add(pair);
      const angAB = Math.atan2(b.y - a.y, b.x - a.x);
      const angBA = Math.atan2(a.y - b.y, a.x - b.x);
      edges.push({
        fromKey: a.key,
        toKey: b.key,
        fromAngle: nearestAngle(angAB, a.attachments),
        toAngle: nearestAngle(angBA, b.attachments),
      });
    }
  }

  const used = new Map<string, Set<number>>();
  const mark = (key: string, angle: number) => {
    let set = used.get(key);
    if (!set) {
      set = new Set();
      used.set(key, set);
    }
    set.add(angle);
  };
  for (const e of edges) {
    mark(e.fromKey, e.fromAngle);
    mark(e.toKey, e.toAngle);
  }

  const terminals: HoneycombTerminal[] = [];
  for (const node of nodeByKey.values()) {
    const taken = used.get(node.key) ?? new Set();
    for (const ang of node.attachments) {
      const hit = [...taken].some(t => Math.abs(wrapPi(t - ang)) < 1e-3);
      if (!hit) terminals.push({ nodeKey: node.key, angle: ang });
    }
  }

  return { nodes: [...nodeByKey.values()], edges, terminals };
}
