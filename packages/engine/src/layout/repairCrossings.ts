/**
 * Stage C — discrete crossing repair (no templates).
 *
 * After continuous minimize2D:
 *   1. Detect crossing bond pairs
 *   2. For each crossing, try reflecting the smaller fragment across a cut bond
 *   3. Re-minimize briefly
 *   4. Repeat until crossings stop falling
 *
 * Also tries a ±90° / 180° rotation of the smaller fragment around the
 * attachment bond as a secondary discrete move when reflection stalls.
 */
import type { Molecule } from '@moldraw/domain';
import { buildGraph, type MoleculeGraph } from '../graph';
import { measureLayoutQuality, isAcceptableLayout } from './layoutQuality';
import { minimize2D } from './minimize2D';
import { untangleByReflection } from './untangleByReflection';

export interface RepairCrossingsOptions {
  bondLengthPx: number;
  /** Max outer repair iterations. Default 8. */
  maxRounds?: number;
  /** Brief re-minimize iterations after each accepted flip. Default 48. */
  reminimizeIterations?: number;
}

interface Vec {
  x: number;
  y: number;
}

interface Crossing {
  a1: string;
  a2: string;
  b1: string;
  b2: string;
}

const layoutScore = (mol: Molecule): number => {
  const q = measureLayoutQuality(mol);
  return q.overlaps * 10 + q.crossings * 8 + q.bondRatio * 2 + q.badCccFraction * 20;
};

const applyPos = (mol: Molecule, pos: Map<string, Vec>): Molecule => ({
  ...mol,
  atoms: mol.atoms.map(a => {
    const p = pos.get(a.id);
    return p ? { ...a, x: p.x, y: p.y } : a;
  }),
});

const segmentsCross = (a: Vec, b: Vec, c: Vec, d: Vec): boolean => {
  const cross = (p: Vec, q: Vec, r: Vec) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
};

/** All non-adjacent heavy-bond crossings. */
export const findCrossings = (mol: Molecule): Crossing[] => {
  const byId = new Map(mol.atoms.map(a => [a.id, a]));
  const segs = mol.bonds
    .map(b => {
      const a1 = byId.get(b.fromAtomId);
      const a2 = byId.get(b.toAtomId);
      if (!a1 || !a2 || a1.element === 'H' || a2.element === 'H') return null;
      return { a1: a1.id, a2: a2.id, p1: { x: a1.x, y: a1.y }, p2: { x: a2.x, y: a2.y } };
    })
    .filter(Boolean) as {
    a1: string;
    a2: string;
    p1: Vec;
    p2: Vec;
  }[];

  const out: Crossing[] = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i]!;
      const t = segs[j]!;
      if (new Set([s.a1, s.a2, t.a1, t.a2]).size < 4) continue;
      if (segmentsCross(s.p1, s.p2, t.p1, t.p2)) {
        out.push({ a1: s.a1, a2: s.a2, b1: t.a1, b2: t.a2 });
      }
    }
  }
  return out;
};

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

const rotateAround = (p: Vec, origin: Vec, cosT: number, sinT: number): Vec => {
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return {
    x: origin.x + dx * cosT - dy * sinT,
    y: origin.y + dx * sinT + dy * cosT,
  };
};

interface FlipCandidate {
  moveIds: string[];
  anchorA: string;
  anchorB: string;
}

/** Smaller side of a cut bond, if it is a proper exo fragment. */
const smallerSide = (
  g: MoleculeGraph,
  heavy: Set<string>,
  u: string,
  v: string,
): FlipCandidate | null => {
  if (!heavy.has(u) || !heavy.has(v)) return null;
  const sideU = componentBeside(g, u, v, heavy);
  const sideV = componentBeside(g, v, u, heavy);
  if (sideU.length < 2 && sideV.length < 2) return null;
  const half = Math.floor(heavy.size / 2);
  if (sideU.length <= sideV.length && sideU.length <= half && sideU.length >= 2) {
    return { moveIds: sideU, anchorA: v, anchorB: u };
  }
  if (sideV.length <= half && sideV.length >= 2) {
    return { moveIds: sideV, anchorA: u, anchorB: v };
  }
  return null;
};

const posFromMol = (mol: Molecule): Map<string, Vec> => {
  const pos = new Map<string, Vec>();
  for (const a of mol.atoms) {
    if (a.element === 'H') continue;
    pos.set(a.id, { x: a.x, y: a.y });
  }
  return pos;
};

/** Reflect fragment across attachment bond. */
const applyReflect = (mol: Molecule, cand: FlipCandidate): Molecule => {
  const pos = posFromMol(mol);
  const a = pos.get(cand.anchorA);
  const b = pos.get(cand.anchorB);
  if (!a || !b) return mol;
  for (const id of cand.moveIds) {
    const p = pos.get(id);
    if (!p) continue;
    pos.set(id, reflectPoint(p, a, b));
  }
  return applyPos(mol, pos);
};

/** Rotate fragment around attachment-bond midpoint by `deg` degrees. */
const applyRotate = (mol: Molecule, cand: FlipCandidate, deg: number): Molecule => {
  const pos = posFromMol(mol);
  const a = pos.get(cand.anchorA);
  const b = pos.get(cand.anchorB);
  if (!a || !b) return mol;
  const origin = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const rad = (deg * Math.PI) / 180;
  const cosT = Math.cos(rad);
  const sinT = Math.sin(rad);
  for (const id of cand.moveIds) {
    const p = pos.get(id);
    if (!p) continue;
    pos.set(id, rotateAround(p, origin, cosT, sinT));
  }
  return applyPos(mol, pos);
};

const cutBondsForCrossing = (c: Crossing): [string, string][] => [
  [c.a1, c.a2],
  [c.b1, c.b2],
  // Also try cuts at endpoints that may separate the crossed arms.
  [c.a1, c.b1],
  [c.a1, c.b2],
  [c.a2, c.b1],
  [c.a2, c.b2],
];

/**
 * One repair round: try discrete moves targeting current crossings, keep best,
 * then briefly re-minimize.
 */
const repairRound = (
  mol: Molecule,
  bondLen: number,
  reminimizeIterations: number,
): Molecule => {
  const g = buildGraph(mol);
  const heavy = new Set(mol.atoms.filter(a => a.element !== 'H').map(a => a.id));
  const crossings = findCrossings(mol);
  if (crossings.length === 0) return mol;

  let best = mol;
  let bestScore = layoutScore(mol);
  const tried = new Set<string>();

  const consider = (candidate: Molecule) => {
    // Brief polish so discrete jumps don't leave stretched bonds.
    const polished = minimize2D(candidate, {
      bondLengthPx: bondLen,
      onlyIfNeeded: false,
      maxIterations: reminimizeIterations,
    });
    const s = layoutScore(polished);
    if (s < bestScore - 0.4) {
      bestScore = s;
      best = polished;
    }
  };

  // Prefer crossings that involve longer bonds / more central atoms first.
  const ordered = [...crossings].sort((x, y) => {
    // Stable: just process in discovery order but cap attempts.
    return (x.a1 + x.a2).localeCompare(y.a1 + y.a2);
  });

  // Cap attempts — each consider() runs a reminimize; keep interactive.
  const maxAttempts = Math.min(ordered.length, 6);
  let considers = 0;
  const MAX_CONSIDERS = 10;
  for (let i = 0; i < maxAttempts && considers < MAX_CONSIDERS; i++) {
    const c = ordered[i]!;
    for (const [u, v] of cutBondsForCrossing(c)) {
      if (considers >= MAX_CONSIDERS) break;
      // Only real graph edges as cut bonds for reflection.
      const nbs = g.nodes.get(u)?.neighbors ?? [];
      if (!nbs.includes(v)) continue;
      const key = u < v ? `${u}|${v}` : `${v}|${u}`;
      if (tried.has(key)) continue;
      tried.add(key);
      const cand = smallerSide(g, heavy, u, v);
      if (!cand) continue;

      consider(applyReflect(mol, cand));
      considers += 1;
      // One secondary rotate if reflection didn't win yet.
      if (considers < MAX_CONSIDERS && bestScore > layoutScore(mol) - 2) {
        consider(applyRotate(mol, cand, 180));
        considers += 1;
      }
    }
  }

  // Global exo-reflection sweep as a fallback within the round.
  const swept = untangleByReflection(mol);
  if (layoutScore(swept) < layoutScore(mol) - 0.4) {
    consider(swept);
  }

  return best;
};

/**
 * Certified crossing-repair loop: flip → re-minimize → repeat until crossings
 * stop falling or the layout gate passes.
 */
export const repairCrossings = (
  mol: Molecule,
  options: RepairCrossingsOptions,
): Molecule => {
  const bondLen = options.bondLengthPx;
  if (mol.atoms.length < 8 || bondLen <= 0) return mol;
  if (isAcceptableLayout(mol) && measureLayoutQuality(mol).crossings === 0) return mol;

  const maxRounds = options.maxRounds ?? 4;
  const remin = options.reminimizeIterations ?? 36;

  let current = mol;
  let best = mol;
  let bestScore = layoutScore(mol);
  let prevCrossings = measureLayoutQuality(mol).crossings;

  for (let round = 0; round < maxRounds; round++) {
    if (isAcceptableLayout(current) && measureLayoutQuality(current).crossings <= 1) {
      break;
    }
    const q0 = measureLayoutQuality(current);
    if (q0.crossings === 0) break;

    const next = repairRound(current, bondLen, remin);
    const q1 = measureLayoutQuality(next);
    const s1 = layoutScore(next);

    if (s1 < bestScore - 0.2) {
      bestScore = s1;
      best = next;
    }

    // Stop when crossings no longer fall and score did not improve.
    if (q1.crossings >= prevCrossings && s1 >= layoutScore(current) - 0.2) {
      break;
    }

    current = next;
    prevCrossings = q1.crossings;
  }

  // Final polish on the best candidate.
  const polished = minimize2D(best, {
    bondLengthPx: bondLen,
    onlyIfNeeded: false,
    maxIterations: Math.max(remin, 64),
  });
  if (layoutScore(polished) <= layoutScore(best) + 0.05) {
    return polished;
  }
  return best;
};
