/**
 * Continuous thick-wedge ribbons for head-to-tail stereo wedges (ChemDraw
 * chair front-edge). Wedges that only share a start atom stay triangles.
 */
import type { Atom, Bond } from '@moldraw/domain';

export type WedgeChain = {
  bondIds: string[];
  atomIds: string[];
  color: string;
  opacity: number;
};

type Link = {
  bondId: string;
  a: string;
  b: string;
  color: string;
  opacity: number;
};

/** Find simple paths of 2+ connected solid wedges to draw as one ribbon. */
export function collectWedgeChains(
  bonds: Bond[],
  atomById: Map<string, Atom>,
  opts: {
    visibleBondIds?: Set<string> | null;
    colorFor: (bond: Bond, from: Atom, to: Atom) => string;
    opacityFor: (bond: Bond, from: Atom, to: Atom) => number;
  },
): { chains: WedgeChain[]; chainedBondIds: Set<string> } {
  const links: Link[] = [];
  for (const bond of bonds) {
    if (opts.visibleBondIds && !opts.visibleBondIds.has(bond.id)) continue;
    if (bond.stereo !== 'wedge') continue;
    const order = bond.order === 4 ? 1 : bond.order;
    if (order !== 1 || bond.dative || bond.dotted || bond.queryType || bond.aromatic) continue;
    const from = atomById.get(bond.fromAtomId);
    const to = atomById.get(bond.toAtomId);
    if (!from || !to) continue;
    links.push({
      bondId: bond.id,
      a: from.id,
      b: to.id,
      color: opts.colorFor(bond, from, to),
      opacity: opts.opacityFor(bond, from, to),
    });
  }

  const byBond = new Map(links.map(l => [l.bondId, l]));
  // Only join head-to-tail (wide end of one = narrow start of the next).
  // Two wedges that both leave the same atom (S→A and S→B) stay separate
  // triangles — they are not a chair front-edge.
  const adj = new Map<string, Array<{ other: string; bondId: string }>>();
  const addEdge = (u: string, v: string, bondId: string) => {
    let list = adj.get(u);
    if (!list) {
      list = [];
      adj.set(u, list);
    }
    if (list.some(e => e.bondId === bondId && e.other === v)) return;
    list.push({ other: v, bondId });
  };
  const addUndirected = (L: Link) => {
    addEdge(L.a, L.b, L.bondId);
    addEdge(L.b, L.a, L.bondId);
  };
  for (let i = 0; i < links.length; i++) {
    const p = links[i]!;
    for (let j = i + 1; j < links.length; j++) {
      const q = links[j]!;
      if (p.b !== q.a && q.b !== p.a) continue;
      addUndirected(p);
      addUndirected(q);
    }
  }

  // Bond-connected components.
  const visited = new Set<string>();
  const chains: WedgeChain[] = [];
  const chainedBondIds = new Set<string>();

  for (const seed of links) {
    if (visited.has(seed.bondId)) continue;
    const comp: Link[] = [];
    const stack = [seed.bondId];
    visited.add(seed.bondId);
    while (stack.length) {
      const id = stack.pop()!;
      const L = byBond.get(id);
      if (!L) continue;
      comp.push(L);
      for (const side of [L.a, L.b]) {
        for (const n of adj.get(side) ?? []) {
          if (visited.has(n.bondId)) continue;
          visited.add(n.bondId);
          stack.push(n.bondId);
        }
      }
    }

    if (comp.length < 2) continue;

    const localDeg = new Map<string, number>();
    for (const L of comp) {
      localDeg.set(L.a, (localDeg.get(L.a) ?? 0) + 1);
      localDeg.set(L.b, (localDeg.get(L.b) ?? 0) + 1);
    }
    // Only simple paths/cycles — branches keep standalone triangles.
    let branched = false;
    for (const d of localDeg.values()) {
      if (d > 2) {
        branched = true;
        break;
      }
    }
    if (branched) continue;

    const endpoints = [...localDeg.entries()].filter(([, d]) => d === 1).map(([a]) => a);
    if (endpoints.length !== 0 && endpoints.length !== 2) continue;

    const start = endpoints[0] ?? comp[0]!.a;
    const used = new Set<string>();
    const atomIds = [start];
    const bondIds: string[] = [];
    let curr = start;
    while (bondIds.length < comp.length) {
      const next = (adj.get(curr) ?? []).find(n => !used.has(n.bondId) && byBond.has(n.bondId) &&
        comp.some(c => c.bondId === n.bondId));
      if (!next) break;
      used.add(next.bondId);
      bondIds.push(next.bondId);
      atomIds.push(next.other);
      curr = next.other;
    }
    if (bondIds.length < 2) continue;

    const opacities = bondIds.map(id => byBond.get(id)!.opacity);
    chains.push({
      bondIds,
      atomIds,
      color: byBond.get(bondIds[0]!)!.color,
      opacity: Math.min(...opacities),
    });
    for (const id of bondIds) chainedBondIds.add(id);
  }

  return { chains, chainedBondIds };
}

/**
 * Continuous wedge ribbon: pointy at path ends (bonds going away), full width
 * on interior vertices, mitered joins (no flat caps / seams).
 */
export function drawContinuousWedgeRibbon(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  halfWidth: number,
  color: string,
  opacity: number,
): void {
  if (points.length < 2 || halfWidth < 0.5) return;

  // Termini taper to a point; interior stays thick (chair/boat front edge).
  const widths = points.map((_, i) =>
    i === 0 || i === points.length - 1 ? 0 : halfWidth,
  );

  const left: Array<{ x: number; y: number }> = [];
  const right: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < points.length; i++) {
    const curr = points[i]!;
    const prev = i > 0 ? points[i - 1]! : null;
    const next = i < points.length - 1 ? points[i + 1]! : null;
    const w = widths[i]!;

    let nx: number;
    let ny: number;
    if (!prev && next) {
      const dx = next.x - curr.x;
      const dy = next.y - curr.y;
      const len = Math.hypot(dx, dy) || 1;
      nx = -dy / len;
      ny = dx / len;
    } else if (prev && !next) {
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      nx = -dy / len;
      ny = dx / len;
    } else if (prev && next) {
      const d1x = curr.x - prev.x;
      const d1y = curr.y - prev.y;
      const d2x = next.x - curr.x;
      const d2y = next.y - curr.y;
      const l1 = Math.hypot(d1x, d1y) || 1;
      const l2 = Math.hypot(d2x, d2y) || 1;
      const n1x = -d1y / l1;
      const n1y = d1x / l1;
      const n2x = -d2y / l2;
      const n2y = d2x / l2;
      nx = n1x + n2x;
      ny = n1y + n2y;
      const nl = Math.hypot(nx, ny);
      if (nl < 1e-6) {
        nx = n1x;
        ny = n1y;
      } else {
        nx /= nl;
        ny /= nl;
        const miter = Math.min(3.5, 1 / Math.max(0.28, Math.abs(n1x * nx + n1y * ny)));
        nx *= miter;
        ny *= miter;
      }
    } else {
      return;
    }

    // w === 0 → left/right collapse to the atom (true pointy tip).
    left.push({ x: curr.x + nx * w, y: curr.y + ny * w });
    right.push({ x: curr.x - nx * w, y: curr.y - ny * w });
  }

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(left[0]!.x, left[0]!.y);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i]!.x, left[i]!.y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i]!.x, right[i]!.y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
