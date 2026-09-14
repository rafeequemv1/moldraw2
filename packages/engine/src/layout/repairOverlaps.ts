/**
 * Push apart non-bonded heavy atoms that sit inside the overlap threshold.
 * Run after minimize2D / before crossing repair on polycyclic layouts.
 */
import type { Molecule } from '@moldraw/domain';
import { measureLayoutQuality } from './layoutQuality';

export interface RepairOverlapsOptions {
  bondLengthPx: number;
  maxIterations?: number;
}

const layoutScore = (mol: Molecule): number => {
  const q = measureLayoutQuality(mol);
  return q.overlaps * 10 + q.crossings * 8 + q.bondRatio * 2 + q.badCccFraction * 20;
};

export const repairOverlaps = (mol: Molecule, options: RepairOverlapsOptions): Molecule => {
  const bondLen = options.bondLengthPx;
  const maxIter = options.maxIterations ?? 48;
  if (mol.atoms.length < 3 || bondLen <= 0) return mol;

  const heavy = mol.atoms.filter(a => a.element !== 'H' && a.element !== 'D');
  const pos = new Map(mol.atoms.map(a => [a.id, { x: a.x, y: a.y }]));
  const bonded = new Set(
    mol.bonds.map(b =>
      b.fromAtomId < b.toAtomId ? `${b.fromAtomId}|${b.toAtomId}` : `${b.toAtomId}|${b.fromAtomId}`,
    ),
  );

  const minSep = bondLen * 0.42;

  for (let iter = 0; iter < maxIter; iter++) {
    let moved = false;
    for (let i = 0; i < heavy.length; i++) {
      for (let j = i + 1; j < heavy.length; j++) {
        const a = heavy[i]!;
        const b = heavy[j]!;
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        if (bonded.has(key)) continue;
        const pa = pos.get(a.id)!;
        const pb = pos.get(b.id)!;
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d >= minSep) continue;
        const push = ((minSep - d) * 0.5) / 2;
        const ux = dx / d;
        const uy = dy / d;
        pos.set(a.id, { x: pa.x - ux * push, y: pa.y - uy * push });
        pos.set(b.id, { x: pb.x + ux * push, y: pb.y + uy * push });
        moved = true;
      }
    }
    if (!moved) break;
  }

  const next = {
    ...mol,
    atoms: mol.atoms.map(a => {
      const p = pos.get(a.id);
      return p ? { ...a, x: p.x, y: p.y } : a;
    }),
  };
  return layoutScore(next) <= layoutScore(mol) + 0.5 ? next : mol;
};
