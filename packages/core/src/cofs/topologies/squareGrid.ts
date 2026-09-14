/**
 * 4-connected square (sql) net: nodes at cell corners, edges = linkers.
 * Packing adds shared square pores; unsaturated node slots become terminals.
 */
import { nearestAngle, posKey, wrapPi } from '../geometry';

export type SquareNode = {
  key: string;
  x: number;
  y: number;
  /** Four attachment angles (radians), 90° apart. */
  attachments: readonly number[];
};

export type SquareEdge = {
  fromKey: string;
  toKey: string;
  fromAngle: number;
  toAngle: number;
};

export type SquareTerminal = {
  nodeKey: string;
  angle: number;
};

const ATTACH = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2] as const;

export type SquareLattice = {
  nodes: SquareNode[];
  edges: SquareEdge[];
  terminals: SquareTerminal[];
};

/**
 * Pore-center offsets for a cols×rows pack. The (0,0) cell is the seed
 * (omitted); copies are translations only (`rot = 0`).
 */
export function squarePoreOffsets(
  cols: number,
  rows: number,
  nodeSpacing: number,
): Array<{ dx: number; dy: number }> {
  const col0 = -Math.floor((cols - 1) / 2);
  const row0 = -Math.floor((rows - 1) / 2);
  const out: Array<{ dx: number; dy: number }> = [];
  for (let ci = 0; ci < cols; ci++) {
    for (let ri = 0; ri < rows; ri++) {
      const i = col0 + ci;
      const j = row0 + ri;
      if (i === 0 && j === 0) continue;
      out.push({ dx: i * nodeSpacing, dy: j * nodeSpacing });
    }
  }
  return out;
}

/**
 * Build a cols×rows packing of square pores.
 * `nodeSpacing` is node-center to neighboring node-center.
 * The (0,0) pore stays at `(cx, cy)` so live instances match a baked sheet.
 */
export function buildSquareLattice(
  cols: number,
  rows: number,
  nodeSpacing: number,
  cx: number,
  cy: number,
): SquareLattice {
  const s = nodeSpacing;
  const nodeByKey = new Map<string, SquareNode>();
  const edgeKeys = new Set<string>();
  const edges: SquareEdge[] = [];

  const ensureNode = (x: number, y: number): SquareNode => {
    const key = posKey(x, y);
    const existing = nodeByKey.get(key);
    if (existing) return existing;
    const node: SquareNode = { key, x, y, attachments: ATTACH };
    nodeByKey.set(key, node);
    return node;
  };

  const corner = (i: number, j: number) => ({
    x: cx + (i - 0.5) * s,
    y: cy + (j - 0.5) * s,
  });

  for (let i = 0; i <= cols; i++) {
    for (let j = 0; j <= rows; j++) {
      const p = corner(i, j);
      ensureNode(p.x, p.y);
    }
  }

  const addEdge = (a: SquareNode, b: SquareNode) => {
    const pair = a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`;
    if (edgeKeys.has(pair)) return;
    edgeKeys.add(pair);
    const angAB = Math.atan2(b.y - a.y, b.x - a.x);
    const angBA = Math.atan2(a.y - b.y, a.x - b.x);
    edges.push({
      fromKey: a.key,
      toKey: b.key,
      fromAngle: nearestAngle(angAB, a.attachments),
      toAngle: nearestAngle(angBA, b.attachments),
    });
  };

  for (let i = 0; i <= cols; i++) {
    for (let j = 0; j <= rows; j++) {
      const here = ensureNode(corner(i, j).x, corner(i, j).y);
      if (i < cols) {
        const right = corner(i + 1, j);
        addEdge(here, ensureNode(right.x, right.y));
      }
      if (j < rows) {
        const up = corner(i, j + 1);
        addEdge(here, ensureNode(up.x, up.y));
      }
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

  const terminals: SquareTerminal[] = [];
  for (const node of nodeByKey.values()) {
    const taken = used.get(node.key) ?? new Set();
    for (const ang of node.attachments) {
      const hit = [...taken].some(t => Math.abs(wrapPi(t - ang)) < 1e-3);
      if (!hit) terminals.push({ nodeKey: node.key, angle: ang });
    }
  }

  return { nodes: [...nodeByKey.values()], edges, terminals };
}
