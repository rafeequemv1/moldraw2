/**
 * Stage 3a — reduce bond crossings by reflecting exo substituents.
 *
 * For each pendant fragment attached by a single bond to a larger core,
 * try reflecting the fragment across that bond and keep the orientation
 * with fewer crossings (and no worse overlaps).
 */
import type { Molecule } from '@moldraw/domain';
import { buildGraph, type MoleculeGraph } from '../graph';
import { measureLayoutQuality } from './layoutQuality';

interface Vec {
  x: number;
  y: number;
}

const reflectPoint = (p: Vec, a: Vec, b: Vec): Vec => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return { ...p };
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return { x: 2 * projX - p.x, y: 2 * projY - p.y };
};

const score = (mol: Molecule): number => {
  const q = measureLayoutQuality(mol);
  return q.crossings * 8 + q.overlaps * 10 + q.bondRatio * 2;
};

const applyPos = (mol: Molecule, pos: Map<string, Vec>): Molecule => ({
  ...mol,
  atoms: mol.atoms.map(a => {
    const p = pos.get(a.id);
    return p ? { ...a, x: p.x, y: p.y } : a;
  }),
});

/** Atoms reachable from `start` without crossing `blocked`. */
const componentBeside = (
  g: MoleculeGraph,
  start: string,
  blocked: string,
  allowed: Set<string>,
): string[] => {
  const out: string[] = [];
  const seen = new Set<string>([blocked]);
  const q = [start];
  seen.add(start);
  while (q.length) {
    const u = q.shift()!;
    out.push(u);
    for (const nb of g.nodes.get(u)?.neighbors ?? []) {
      if (!allowed.has(nb) || seen.has(nb)) continue;
      seen.add(nb);
      q.push(nb);
    }
  }
  return out;
};

/**
 * Reflect exo fragments across their attachment bond when that reduces crossings.
 */
export const untangleByReflection = (mol: Molecule): Molecule => {
  if (mol.atoms.length < 8) return mol;
  const g = buildGraph(mol);
  const heavy = new Set(mol.atoms.filter(a => a.element !== 'H').map(a => a.id));
  if (heavy.size < 8) return mol;

  const pos = new Map<string, Vec>();
  for (const a of mol.atoms) {
    if (a.element === 'H') continue;
    pos.set(a.id, { x: a.x, y: a.y });
  }

  let best = applyPos(mol, pos);
  let bestScore = score(best);
  const half = Math.floor(heavy.size / 2);

  // Candidate cut bonds: one side is a small exo fragment.
  const tried = new Set<string>();
  for (const id of heavy) {
    for (const nb of g.nodes.get(id)?.neighbors ?? []) {
      if (!heavy.has(nb)) continue;
      const key = id < nb ? `${id}|${nb}` : `${nb}|${id}`;
      if (tried.has(key)) continue;
      tried.add(key);

      const sideA = componentBeside(g, id, nb, heavy);
      const sideB = componentBeside(g, nb, id, heavy);
      if (sideA.length === 0 || sideB.length === 0) continue;
      if (sideA.length >= heavy.size || sideB.length >= heavy.size) continue;

      // Prefer flipping the smaller side (substituent), not the whole core.
      let moveIds: string[];
      let anchorA: string;
      let anchorB: string;
      if (sideA.length <= sideB.length && sideA.length <= half && sideA.length >= 2) {
        moveIds = sideA;
        anchorA = nb;
        anchorB = id;
      } else if (sideB.length <= half && sideB.length >= 2) {
        moveIds = sideB;
        anchorA = id;
        anchorB = nb;
      } else {
        continue;
      }

      const a = pos.get(anchorA);
      const b = pos.get(anchorB);
      if (!a || !b) continue;

      const trial = new Map(pos);
      for (const mid of moveIds) {
        const p = trial.get(mid);
        if (!p) continue;
        trial.set(mid, reflectPoint(p, a, b));
      }
      const candidate = applyPos(mol, trial);
      const s = score(candidate);
      if (s < bestScore - 0.5) {
        bestScore = s;
        best = candidate;
        // Commit so later flips build on the improvement.
        for (const [pid, p] of trial) pos.set(pid, p);
      }
    }
  }

  return best;
};
