/**
 * In-place layout cleanup — preserve the user's drawing orientation and bond
 * directions; only normalize bond lengths along existing vectors.
 *
 * Used when the molecule already has reasonable coordinates (e.g. PubChem import)
 * so full graph relayout does not destroy a good structure.
 */
import type { Atom, Molecule } from '@moldraw/domain';
import { buildGraph, connectedComponents } from '../graph';
import { perceiveRings } from '../chem/rings';
import { medianBondLength } from '@moldraw/core';

interface Vec {
  x: number;
  y: number;
}

const dirBetween = (from: Vec, to: Vec): number => Math.atan2(to.y - from.y, to.x - from.x);

const vecAt = (from: Vec, dir: number, bondLen: number): Vec => ({
  x: from.x + bondLen * Math.cos(dir),
  y: from.y + bondLen * Math.sin(dir),
});

const minAtomSeparation = (mol: Molecule): number => {
  let min = Infinity;
  const heavy = mol.atoms.filter(a => a.element !== 'H' && a.element !== 'D');
  for (let i = 0; i < heavy.length; i++) {
    for (let j = i + 1; j < heavy.length; j++) {
      const a = heavy[i]!;
      const b = heavy[j]!;
      min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return min;
};

const bondAngleDeg = (c: Vec, a: Vec, b: Vec): number => {
  const da = Math.atan2(a.y - c.y, a.x - c.x);
  const db = Math.atan2(b.y - c.y, b.x - c.x);
  let diff = Math.abs(da - db);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  return (diff * 180) / Math.PI;
};

/** Pick a stable BFS root — prefer a ring atom so ring-heavy imports stay anchored. */
const pickAnchor = (comp: string[], ringAtoms: Set<string>): string => {
  for (const id of comp) {
    if (ringAtoms.has(id)) return id;
  }
  return comp[0];
};

/**
 * Walk each component in BFS order and set every bond to exactly `bondLen`
 * while keeping its current direction.
 */
export const normalizeBondLengthsInPlace = (mol: Molecule, bondLen: number): Molecule => {
  if (mol.atoms.length === 0 || bondLen <= 0) return mol;
  const g = buildGraph(mol);
  const rings = perceiveRings(mol);
  const ringAtoms = new Set<string>();
  for (const r of rings) for (const id of r.atomIds) ringAtoms.add(id);

  const pos = new Map<string, Vec>();
  for (const a of mol.atoms) pos.set(a.id, { x: a.x, y: a.y });

  for (const comp of connectedComponents(mol)) {
    if (comp.length === 0) continue;
    const root = pickAnchor(comp, ringAtoms);
    const parent = new Map<string, string | null>();
    parent.set(root, null);
    const order: string[] = [];
    const seen = new Set<string>([root]);
    const queue = [root];
    while (queue.length) {
      const u = queue.shift()!;
      order.push(u);
      for (const nb of g.nodes.get(u)?.neighbors ?? []) {
        if (!comp.includes(nb) || seen.has(nb)) continue;
        seen.add(nb);
        parent.set(nb, u);
        queue.push(nb);
      }
    }

    for (const v of order) {
      if (v === root) continue;
      const u = parent.get(v);
      if (u === undefined || u === null) continue;
      const pu = pos.get(u)!;
      const pv = pos.get(v)!;
      const dir = dirBetween(pu, pv);
      pos.set(v, vecAt(pu, dir, bondLen));
    }
  }

  const atoms: Atom[] = mol.atoms.map(a => {
    const p = pos.get(a.id)!;
    return { ...a, x: p.x, y: p.y };
  });
  return { ...mol, atoms };
};

/** True when a significant share of heavy-atom valence angles deviate from ~120°. */
export const needsAngleRelayout = (mol: Molecule): boolean => {
  const g = buildGraph(mol);
  let bad = 0;
  let total = 0;
  for (const a of mol.atoms) {
    if (a.element === 'H' || a.element === 'D') continue;
    const node = g.nodes.get(a.id);
    if (!node) continue;
    const heavyNbs = node.neighbors.filter(id => {
      const el = mol.atoms.find(x => x.id === id)?.element ?? '';
      return el !== 'H' && el !== 'D';
    });
    if (heavyNbs.length < 2) continue;
    const c = { x: a.x, y: a.y };
    const pts = heavyNbs.map(id => {
      const p = mol.atoms.find(x => x.id === id)!;
      return { x: p.x, y: p.y };
    });
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        total++;
        const ang = bondAngleDeg(c, pts[i], pts[j]);
        if (Math.abs(ang - 120) > 22 && Math.abs(ang - 180) > 22) bad++;
      }
    }
  }
  return total > 0 && bad / total > 0.35;
};

/**
 * True when coordinates look like a real imported/drawn structure (not collapsed
 * or overlapping). Such layouts should not be fully re-generated.
 *
 * Also rejects layouts with wildly uneven bond lengths (e.g. polycyclic native
 * layout that left a 10× stretched join edge) so cleanup forces a full relayout.
 */
export const hasReasonableExistingLayout = (mol: Molecule): boolean => {
  if (mol.atoms.length < 2) return true;
  const med = medianBondLength(mol);
  if (med < 12 || med > 250) return false;
  const minSep = minAtomSeparation(mol);
  if (minSep < med * 0.22) return false;
  const xs = mol.atoms.map(a => a.x);
  const ys = mol.atoms.map(a => a.y);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (span < med * 0.5) return false;

  // Bond-length spread: max/min among heavy–heavy bonds.
  let minB = Infinity;
  let maxB = 0;
  const byId = new Map(mol.atoms.map(a => [a.id, a]));
  for (const b of mol.bonds) {
    const a1 = byId.get(b.fromAtomId);
    const a2 = byId.get(b.toAtomId);
    if (!a1 || !a2 || a1.element === 'H' || a2.element === 'H') continue;
    const d = Math.hypot(a1.x - a2.x, a1.y - a2.y);
    if (d < 1e-6) continue;
    minB = Math.min(minB, d);
    maxB = Math.max(maxB, d);
  }
  if (Number.isFinite(minB) && minB > 0 && maxB / minB > 2.8) return false;

  return true;
};

/** True when coordinates are collapsed — needs full relayout. */
export const isLayoutCollapsed = (mol: Molecule): boolean => !hasReasonableExistingLayout(mol);
