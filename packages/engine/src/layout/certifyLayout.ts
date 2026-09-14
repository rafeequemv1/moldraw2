/**
 * Stage D — quality gate + multi-start certify.
 *
 * Pipeline per seed:
 *   minimize2D → repairCrossings → score
 *
 * If the hard gate fails, restart from alternate seeds (mirror / rotate /
 * fresh generate2D / alternate ring order). Never silently claim success:
 * returns status 'certified' | 'degraded'.
 */
import type { Molecule } from '@moldraw/domain';
import { buildGraph, connectedComponents } from '../graph';
import { perceiveRings } from '../chem/rings';
import { stripTerminalHydrogensForLayout } from './generate2d';
import {
  layoutScore,
  measureLayoutQuality,
  passesHardGate,
  type LayoutQuality,
} from './layoutQuality';
import { minimize2D } from './minimize2D';
import { repairCrossings } from './repairCrossings';
import { repairOverlaps } from './repairOverlaps';
import { layoutComponentSkeleton } from './skeletonLayout';
import { fusedRingFingerprint, preferredCoreRingSize } from './scaffoldTemplates';

export type LayoutStatus = 'certified' | 'degraded';

export interface CertifyLayoutOptions {
  bondLengthPx: number;
  /** Max alternate seeds after the primary. Default 5. */
  maxRestarts?: number;
  /** Brief repair rounds per seed. Default 6. */
  repairRounds?: number;
}

export interface CertifyLayoutResult {
  molecule: Molecule;
  status: LayoutStatus;
  quality: LayoutQuality;
  attempts: number;
}

interface Vec {
  x: number;
  y: number;
}

const centroid = (mol: Molecule): Vec => {
  const heavy = mol.atoms.filter(a => a.element !== 'H');
  const list = heavy.length ? heavy : mol.atoms;
  if (list.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const a of list) {
    x += a.x;
    y += a.y;
  }
  return { x: x / list.length, y: y / list.length };
};

const mirrorX = (mol: Molecule): Molecule => {
  const c = centroid(mol);
  return {
    ...mol,
    atoms: mol.atoms.map(a => ({ ...a, x: 2 * c.x - a.x })),
  };
};

const mirrorY = (mol: Molecule): Molecule => {
  const c = centroid(mol);
  return {
    ...mol,
    atoms: mol.atoms.map(a => ({ ...a, y: 2 * c.y - a.y })),
  };
};

const rotate180 = (mol: Molecule): Molecule => {
  const c = centroid(mol);
  return {
    ...mol,
    atoms: mol.atoms.map(a => ({
      ...a,
      x: 2 * c.x - a.x,
      y: 2 * c.y - a.y,
    })),
  };
};

/** Reflect the molecule across the longest bond of the largest ring. */
const flipAcrossLargestRing = (mol: Molecule): Molecule => {
  const rings = perceiveRings(mol);
  if (rings.length === 0) return mirrorX(mol);
  const largest = [...rings].sort((a, b) => b.size - a.size)[0]!;
  const byId = new Map(mol.atoms.map(a => [a.id, a]));
  let bestA: Vec | null = null;
  let bestB: Vec | null = null;
  let bestLen = -1;
  const ids = largest.atomIds;
  for (let i = 0; i < ids.length; i++) {
    const a = byId.get(ids[i]!);
    const b = byId.get(ids[(i + 1) % ids.length]!);
    if (!a || !b) continue;
    const len = Math.hypot(a.x - b.x, a.y - b.y);
    if (len > bestLen) {
      bestLen = len;
      bestA = { x: a.x, y: a.y };
      bestB = { x: b.x, y: b.y };
    }
  }
  if (!bestA || !bestB) return mirrorX(mol);

  const ax = bestA.x;
  const ay = bestA.y;
  const dx = bestB.x - ax;
  const dy = bestB.y - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return mirrorX(mol);

  return {
    ...mol,
    atoms: mol.atoms.map(atom => {
      const t = ((atom.x - ax) * dx + (atom.y - ay) * dy) / len2;
      const px = ax + t * dx;
      const py = ay + t * dy;
      return { ...atom, x: 2 * px - atom.x, y: 2 * py - atom.y };
    }),
  };
};

const recenter = (mol: Molecule, pos: Map<string, Vec>): Molecule => {
  const origCx = mol.atoms.reduce((s, a) => s + a.x, 0) / Math.max(mol.atoms.length, 1);
  const origCy = mol.atoms.reduce((s, a) => s + a.y, 0) / Math.max(mol.atoms.length, 1);
  let nx = 0;
  let ny = 0;
  let n = 0;
  for (const a of mol.atoms) {
    const p = pos.get(a.id);
    if (!p) continue;
    nx += p.x;
    ny += p.y;
    n += 1;
  }
  if (n > 0) {
    nx /= n;
    ny /= n;
  }
  const dx = origCx - nx;
  const dy = origCy - ny;
  return {
    ...mol,
    atoms: mol.atoms.map(a => {
      const p = pos.get(a.id);
      return p ? { ...a, x: p.x + dx, y: p.y + dy } : a;
    }),
  };
};

/** Stage-1 seed with alternate ring placement order (multi-start). */
const seedAlternateRingOrder = (
  mol: Molecule,
  bondLen: number,
  opts: { preferRingSize?: number; ringOrder?: 'largest' | 'smallest' },
): Molecule => {
  const g = buildGraph(mol);
  const rings = perceiveRings(mol);
  const orig = new Map(mol.atoms.map(a => [a.id, { x: a.x, y: a.y }]));
  const pos = new Map<string, Vec>();
  let cursor: Vec = { x: 0, y: 0 };

  for (const comp of connectedComponents(mol)) {
    const compPos = layoutComponentSkeleton({
      g,
      comp,
      rings,
      bondLen,
      origin: cursor,
      orig,
      mode: 'full',
      preferRingSize: opts.preferRingSize,
      ringOrder: opts.ringOrder,
    });
    for (const [id, p] of compPos) pos.set(id, p);
    const pts = comp.map(id => compPos.get(id)).filter(Boolean) as Vec[];
    if (pts.length) {
      cursor = { x: Math.max(...pts.map(p => p.x)) + bondLen * 6, y: 0 };
    }
  }
  return recenter(mol, pos);
};

/** Run Stage B+C on one seed (budgeted for interactive cleanup). */
const polishSeed = (
  seed: Molecule,
  bondLen: number,
  repairRounds: number,
): Molecule => {
  const nHeavy = seed.atoms.filter(a => a.element !== 'H' && a.element !== 'D').length;
  const maxIter = Math.min(140, Math.max(36, Math.floor(28 + nHeavy * 1.1)));
  let next = minimize2D(seed, {
    bondLengthPx: bondLen,
    onlyIfNeeded: false,
    maxIterations: maxIter,
  });
  if (measureLayoutQuality(next).overlaps > 0) {
    const spread = repairOverlaps(next, { bondLengthPx: bondLen });
    if (layoutScore(spread) < layoutScore(next)) {
      next = minimize2D(spread, {
        bondLengthPx: bondLen,
        onlyIfNeeded: false,
        maxIterations: Math.min(48, maxIter),
      });
    }
  }
  if (!passesHardGate(next)) {
    const repaired = repairCrossings(next, {
      bondLengthPx: bondLen,
      maxRounds: repairRounds,
      reminimizeIterations: Math.min(36, maxIter),
    });
    if (layoutScore(repaired) < layoutScore(next) - 0.2) next = repaired;
  }
  return next;
};

/**
 * Certify a layout: minimize + repair, then multi-start until hard gate or
 * restart budget exhausted. Returns best score with an honest status.
 */
export const certifyLayout = (
  mol: Molecule,
  options: CertifyLayoutOptions,
): CertifyLayoutResult => {
  const bondLen = options.bondLengthPx;
  const maxRestarts = options.maxRestarts ?? 5;
  const repairRounds = options.repairRounds ?? 6;
  const base = stripTerminalHydrogensForLayout(mol);

  if (base.atoms.length < 2 || bondLen <= 0) {
    const q = measureLayoutQuality(base);
    return { molecule: base, status: 'certified', quality: q, attempts: 0 };
  }

  if (passesHardGate(base)) {
    return {
      molecule: base,
      status: 'certified',
      quality: measureLayoutQuality(base),
      attempts: 0,
    };
  }

  // Cheap geometric seeds first (mirror/rotate). Skip nested generate2D —
  // cleanup already ran a full rebuild; regenerating here doubles cost.
  const seeds: Molecule[] = [base, mirrorX(base), rotate180(base), mirrorY(base)];
  seeds.push(flipAcrossLargestRing(base));

  // One alternate Stage-1 ring order only when fused polycyclic.
  const g = buildGraph(base);
  const rings = perceiveRings(base);
  const ringAtomSet = new Set(rings.flatMap(r => r.atomIds));
  const scaffold = fusedRingFingerprint(g, rings, ringAtomSet);
  if (scaffold) {
    const def = preferredCoreRingSize(scaffold.fingerprint);
    const altSizes: number[] = [];
    if (def === 8) altSizes.push(6);
    else if (def === 6) altSizes.push(5, 8);
    else if (def === 5) altSizes.push(6);
    if (scaffold.fingerprint === '5-6-6-6') altSizes.push(5);
    for (const alt of altSizes) {
      if (alt !== def) {
        seeds.push(seedAlternateRingOrder(base, bondLen, { preferRingSize: alt }));
      }
    }
  }

  let best = base;
  let bestScore = layoutScore(base);
  let attempts = 0;
  const limit = Math.min(seeds.length, 1 + maxRestarts);
  let softOkStreak = 0;

  for (let i = 0; i < limit; i++) {
    const seed = seeds[i]!;
    attempts += 1;
    const rounds = softOkStreak > 0 ? Math.min(repairRounds, 2) : repairRounds;
    const polished = polishSeed(seed, bondLen, rounds);
    const s = layoutScore(polished);
    if (s < bestScore - 0.15) {
      bestScore = s;
      best = polished;
    }
    if (passesHardGate(polished)) {
      return {
        molecule: polished,
        status: 'certified',
        quality: measureLayoutQuality(polished),
        attempts,
      };
    }
    const q = measureLayoutQuality(polished);
    if (q.overlaps === 0 && q.crossings <= 3) {
      softOkStreak += 1;
      // Soft gate once is enough — further restarts rarely beat it for cost.
      if (softOkStreak >= 1 && i >= 0) break;
    }
  }

  return {
    molecule: best,
    status: passesHardGate(best) ? 'certified' : 'degraded',
    quality: measureLayoutQuality(best),
    attempts,
  };
};
