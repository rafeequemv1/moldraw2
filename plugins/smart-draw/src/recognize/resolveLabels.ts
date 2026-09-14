import {
  ABBREV_TEMPLATE_MAP,
  autocapitalizeAtomAliasDraft,
  isKnownElementSymbol,
  matchLeadingElement,
} from '@moldraw/domain';
import type { GlyphHit } from './detectGlyphs';
import { dist } from './simplify';
import type { SketchGraph } from './types';

export interface ResolvedLabel {
  element: string;
  alias?: string;
  charge?: number;
}

/** Map concatenated handwritten letters onto an element or known FG alias. */
export function resolveHandwrittenLabel(raw: string): ResolvedLabel | null {
  const compact = raw.replace(/[^A-Za-z0-9+\-]/g, '');
  if (!compact) return null;
  let charge: number | undefined;
  let body = compact;
  if (body.endsWith('+')) {
    charge = 1;
    body = body.slice(0, -1);
  } else if (body.endsWith('-')) {
    charge = -1;
    body = body.slice(0, -1);
  }
  const draft = autocapitalizeAtomAliasDraft(body);
  if (!draft) return null;

  if (isKnownElementSymbol(draft)) {
    const lead = matchLeadingElement(draft);
    const element = lead?.element ?? draft;
    // Bare C is already the default vertex — do not invent a carbon label.
    if (element === 'C' && draft.length <= 1) return charge ? { element: 'C', charge } : null;
    return { element, ...(charge ? { charge } : {}) };
  }

  const key = draft.toUpperCase().replace(/\s+/g, '');
  const tmpl = ABBREV_TEMPLATE_MAP[key];
  if (tmpl) {
    const element = tmpl.fragmentGraph.atoms[0] ?? matchLeadingElement(draft)?.element ?? 'C';
    return { element, alias: tmpl.display, ...(charge ? { charge } : {}) };
  }

  const lead = matchLeadingElement(draft);
  if (lead && draft.length > lead.length) {
    return { element: lead.element, alias: draft, ...(charge ? { charge } : {}) };
  }
  return null;
}

const applyLabel = (graph: SketchGraph, x: number, y: number, label: ResolvedLabel, r: number) => {
  let best: { i: number; d: number } | null = null;
  for (let i = 0; i < graph.atoms.length; i++) {
    const a = graph.atoms[i]!;
    const d = dist(a, { x, y });
    if (d <= r && (!best || d < best.d)) best = { i, d };
  }
  if (best) {
    const atom = graph.atoms[best.i]!;
    if (atom.element === 'C' || label.alias) atom.element = label.element;
    if (label.alias) atom.alias = label.alias;
    if (label.charge) atom.charge = label.charge;
    atom.confidence = Math.max(atom.confidence, 0.9);
    return;
  }
  graph.atoms.push({
    tempId: `lbl${graph.atoms.length}`,
    x,
    y,
    element: label.element,
    ...(label.alias ? { alias: label.alias } : {}),
    ...(label.charge ? { charge: label.charge } : {}),
    confidence: 0.88,
  });
};

/** Join nearby letter glyphs left-to-right (OH, Me, Ph, CN, COOH, …). */
export function applyGlyphClusters(
  graph: SketchGraph,
  glyphs: GlyphHit[],
  bondLengthPx: number,
): SketchGraph {
  const letters = glyphs.filter(g => g.name !== '+' && g.name !== '-');
  const charges = glyphs.filter(g => g.name === '+' || g.name === '-');
  const used = new Set<number>();
  const next: SketchGraph = {
    ...graph,
    atoms: graph.atoms.map(a => ({ ...a })),
    bonds: graph.bonds.map(b => ({ ...b })),
  };

  const ordered = [...letters].sort((a, b) => a.cx - b.cx || a.cy - b.cy);
  for (let i = 0; i < ordered.length; i++) {
    if (used.has(i)) continue;
    const cluster = [ordered[i]!];
    used.add(i);
    for (let j = i + 1; j < ordered.length; j++) {
      if (used.has(j)) continue;
      const prev = cluster[cluster.length - 1]!;
      const g = ordered[j]!;
      if (Math.hypot(g.cx - prev.cx, g.cy - prev.cy) > 0.85 * bondLengthPx) continue;
      if (g.cx < prev.cx - 0.15 * bondLengthPx) continue;
      cluster.push(g);
      used.add(j);
    }
    const joined = cluster.map(g => g.name).join('');
    const label = resolveHandwrittenLabel(joined);
    if (!label) continue;
    const cx = cluster.reduce((s, g) => s + g.cx, 0) / cluster.length;
    const cy = cluster.reduce((s, g) => s + g.cy, 0) / cluster.length;
    applyLabel(next, cx, cy, label, 0.7 * bondLengthPx);
  }

  for (const g of charges) {
    applyLabel(
      next,
      g.cx,
      g.cy,
      { element: 'C', charge: g.name === '+' ? 1 : -1 },
      0.65 * bondLengthPx,
    );
  }

  return next;
}
