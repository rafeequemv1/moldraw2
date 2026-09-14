/**
 * Shared 2D layout quality metrics — used by cleanup and PubChem accuracy tests.
 */
import type { Molecule } from '@moldraw/domain';
import { perceiveRings } from '../chem/rings';
import { buildGraph } from '../graph';

export interface LayoutQuality {
  avgBond: number;
  minBond: number;
  maxBond: number;
  bondRatio: number;
  overlaps: number;
  crossings: number;
  badCccFraction: number;
}

const heavyBondLengths = (mol: Molecule): number[] => {
  const byId = new Map(mol.atoms.map(a => [a.id, a]));
  const lens: number[] = [];
  for (const b of mol.bonds) {
    const a1 = byId.get(b.fromAtomId);
    const a2 = byId.get(b.toAtomId);
    if (!a1 || !a2 || a1.element === 'H' || a2.element === 'H') continue;
    const d = Math.hypot(a1.x - a2.x, a1.y - a2.y);
    if (d > 1e-6) lens.push(d);
  }
  return lens;
};

const countOverlaps = (mol: Molecule, avgBond: number): number => {
  const atoms = mol.atoms.filter(a => a.element !== 'H');
  const bonded = new Set(
    mol.bonds.map(b =>
      b.fromAtomId < b.toAtomId ? `${b.fromAtomId}|${b.toAtomId}` : `${b.toAtomId}|${b.fromAtomId}`,
    ),
  );
  let overlaps = 0;
  const thresh = Math.max(avgBond * 0.35, 8);
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      const a = atoms[i]!;
      const b = atoms[j]!;
      const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
      if (bonded.has(key)) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) < thresh) overlaps += 1;
    }
  }
  return overlaps;
};

const segmentsCross = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
): boolean => {
  const cross = (p: typeof a, q: typeof a, r: typeof a) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
};

const countCrossings = (mol: Molecule): number => {
  const byId = new Map(mol.atoms.map(a => [a.id, a]));
  const segs = mol.bonds
    .map(b => {
      const a1 = byId.get(b.fromAtomId);
      const a2 = byId.get(b.toAtomId);
      if (!a1 || !a2 || a1.element === 'H' || a2.element === 'H') return null;
      return { a: a1, b: a2 };
    })
    .filter(Boolean) as { a: { id: string; x: number; y: number }; b: { id: string; x: number; y: number } }[];
  let crossings = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i]!;
      const t = segs[j]!;
      if (new Set([s.a.id, s.b.id, t.a.id, t.b.id]).size < 4) continue;
      if (segmentsCross(s.a, s.b, t.a, t.b)) crossings += 1;
    }
  }
  return crossings;
};

const badCccFraction = (mol: Molecule): number => {
  const g = buildGraph(mol);
  const rings = perceiveRings(mol);
  const ringSet = new Set(rings.flatMap(r => r.atomIds));
  const byId = new Map(mol.atoms.map(a => [a.id, a]));
  let bad = 0;
  let total = 0;
  for (const a of mol.atoms) {
    if (a.element !== 'C') continue;
    const nbs = (g.nodes.get(a.id)?.neighbors ?? []).filter(nb => byId.get(nb)?.element === 'C');
    if (nbs.length < 2) continue;
    for (let i = 0; i < nbs.length; i++) {
      for (let j = i + 1; j < nbs.length; j++) {
        if (ringSet.has(a.id) && ringSet.has(nbs[i]!) && ringSet.has(nbs[j]!)) continue;
        const p = byId.get(a.id)!;
        const q = byId.get(nbs[i]!)!;
        const r = byId.get(nbs[j]!)!;
        const da = Math.atan2(q.y - p.y, q.x - p.x);
        const db = Math.atan2(r.y - p.y, r.x - p.x);
        let diff = Math.abs(da - db);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        const deg = (diff * 180) / Math.PI;
        total += 1;
        if (Math.abs(deg - 120) > 25 && Math.abs(deg - 180) > 25) bad += 1;
      }
    }
  }
  return total === 0 ? 0 : bad / total;
};

export const measureLayoutQuality = (mol: Molecule): LayoutQuality => {
  const lens = heavyBondLengths(mol);
  const avg = lens.length ? lens.reduce((s, d) => s + d, 0) / lens.length : 0;
  const min = lens.length ? Math.min(...lens) : 0;
  const max = lens.length ? Math.max(...lens) : 0;
  return {
    avgBond: avg,
    minBond: min,
    maxBond: max,
    bondRatio: min > 0 ? max / min : 1,
    overlaps: countOverlaps(mol, avg || 45),
    crossings: countCrossings(mol),
    badCccFraction: badCccFraction(mol),
  };
};

/** Composite score — lower is better (used by certify / multi-start). */
export const layoutScore = (mol: Molecule): number => {
  const q = measureLayoutQuality(mol);
  return q.overlaps * 10 + q.crossings * 8 + q.bondRatio * 2 + q.badCccFraction * 20;
};

/** Heuristic: layout is good enough to keep (ChemDraw-ish). */
export const isAcceptableLayout = (mol: Molecule): boolean => {
  if (mol.atoms.length < 3) return true;
  const q = measureLayoutQuality(mol);
  if (q.bondRatio > 2.5) return false;
  if (q.overlaps > 5) return false;
  if (q.crossings > 4) return false;
  if (q.badCccFraction > 0.45) return false;
  return true;
};

/**
 * Stage D hard gate — military-grade depiction.
 * Tier A (simple organics): zero crossings.
 * Default: at most one crossing, no overlaps, tight bonds.
 */
export const passesHardGate = (
  mol: Molecule,
  tier: 'A' | 'default' = 'default',
): boolean => {
  if (mol.atoms.length < 3) return true;
  const q = measureLayoutQuality(mol);
  if (q.overlaps !== 0) return false;
  if (q.bondRatio > 1.25) return false;
  if (q.badCccFraction > 0.35) return false;
  if (tier === 'A') return q.crossings === 0;
  return q.crossings <= 1;
};

/**
 * Soft polycyclic target (e.g. paclitaxel offline): no overlaps, ≤3 crossings.
 * Used when hard gate fails after multi-start — still a usable depiction.
 */
export const passesSoftGate = (mol: Molecule): boolean => {
  if (mol.atoms.length < 3) return true;
  const q = measureLayoutQuality(mol);
  return q.overlaps === 0 && q.crossings <= 3 && q.bondRatio <= 3.0;
};

/**
 * Practical "Cleanup is done" gate — ChemDraw-ready without multi-start.
 * Stricter than isAcceptableLayout, looser than passesHardGate so everyday
 * molecules (cholesterol, alcohols, alkyl chains) finish after generate2D.
 */
export const isChemDrawReady = (mol: Molecule): boolean => {
  if (mol.atoms.length < 3) return true;
  const q = measureLayoutQuality(mol);
  if (q.overlaps > 0) return false;
  if (q.crossings > 2) return false;
  if (q.bondRatio > 1.2) return false;
  if (q.badCccFraction > 0.3) return false;
  // Bonds should be near-uniform at canvas length (avg within 15%).
  if (q.avgBond > 0 && (q.minBond < q.avgBond * 0.85 || q.maxBond > q.avgBond * 1.15)) {
    return false;
  }
  return true;
};
