/**
 * Structure cleanup — ChemDraw-style full coordinate rebuild (fast path first).
 *
 * Pipeline (accuracy preserved, cost scaled):
 *   1. generate2D skeleton (bond length + 120° zig-zag + rings) — always
 *   2. If ChemDraw-ready → done (most molecules; milliseconds)
 *   3. Else one light minimize + short crossing repair
 *   4. Else capped multi-start certify (hard polycyclics only)
 *
 * Explicit alkyl / aromatic H are ignored during layout, then coords merged back.
 * Tagged chair/boat rings keep their conformation (not flattened to regular n-gons).
 */
import type { Molecule } from '@moldraw/domain';
import { lockedConformationAtomIds } from '@moldraw/domain';
import type { Generate2DOptions } from '../types';
import { certifyLayout, type LayoutStatus } from './certifyLayout';
import { generate2D, stripTerminalHydrogensForLayout } from './generate2d';
import {
  isChemDrawReady,
  layoutScore,
  measureLayoutQuality,
  passesHardGate,
  passesSoftGate,
} from './layoutQuality';
import { minimize2D } from './minimize2D';
import { refine2DEnergy } from './refine2dEnergy';
import { repairCrossings } from './repairCrossings';
import { repairOverlaps } from './repairOverlaps';
import { normalizeBondLengthsInPlace } from './refineInPlace';
import { untangleByReflection } from './untangleByReflection';
import { preserveStereoOnMerge } from './stereoPreserve';

export interface CleanupStructureOptions extends Generate2DOptions {
  bondLengthPx: number;
  /** Max multi-start restarts inside certify. Default 2 (was 5). */
  maxRestarts?: number;
}

export interface CleanupStructureResult {
  molecule: Molecule;
  status: LayoutStatus;
}

/**
 * Re-apply chair/boat relative geometry from `source` onto `target`, translated
 * so the locked-atom centroid matches the post-layout centroid (keeps Cleanup
 * from flattening conformations during polish).
 */
const restoreLockedRingGeometry = (source: Molecule, target: Molecule): Molecule => {
  const locked = lockedConformationAtomIds(source);
  if (locked.size === 0) return target;
  const srcById = new Map(source.atoms.map(a => [a.id, a]));
  const tgtById = new Map(target.atoms.map(a => [a.id, a]));
  const ids = [...locked].filter(id => srcById.has(id) && tgtById.has(id));
  if (ids.length === 0) {
    return source.ringConformations
      ? { ...target, ringConformations: source.ringConformations }
      : target;
  }

  let srcCx = 0;
  let srcCy = 0;
  let tgtCx = 0;
  let tgtCy = 0;
  for (const id of ids) {
    const s = srcById.get(id)!;
    const t = tgtById.get(id)!;
    srcCx += s.x;
    srcCy += s.y;
    tgtCx += t.x;
    tgtCy += t.y;
  }
  const n = ids.length;
  srcCx /= n;
  srcCy /= n;
  tgtCx /= n;
  tgtCy /= n;

  const lockedSet = new Set(ids);
  return {
    ...target,
    atoms: target.atoms.map(a => {
      if (!lockedSet.has(a.id)) return a;
      const s = srcById.get(a.id)!;
      return { ...a, x: tgtCx + (s.x - srcCx), y: tgtCy + (s.y - srcCy) };
    }),
    ringConformations: source.ringConformations ?? target.ringConformations,
  };
};

const finishCleanup = (
  original: Molecule,
  conformationSeed: Molecule,
  laid: Molecule,
  bondLen: number,
): Molecule => {
  const stereoSafe = preserveStereoOnMerge(original, laid);
  return restoreLockedRingGeometry(conformationSeed, mergeHeavyCoords(original, stereoSafe, bondLen));
};

/** Heavy-atom topology must match (H may be stripped during layout). */
const sameHeavyTopology = (a: Molecule, b: Molecule): boolean => {
  const heavyA = a.atoms.filter(x => x.element !== 'H' && x.element !== 'D');
  const heavyB = b.atoms.filter(x => x.element !== 'H' && x.element !== 'D');
  if (heavyA.length !== heavyB.length) return false;
  const idsA = new Set(heavyA.map(x => x.id));
  if (!heavyB.every(x => idsA.has(x.id))) return false;
  const bondsA = a.bonds.filter(b => idsA.has(b.fromAtomId) && idsA.has(b.toAtomId));
  const bondsB = b.bonds.filter(
    b =>
      heavyB.some(x => x.id === b.fromAtomId) && heavyB.some(x => x.id === b.toAtomId),
  );
  return bondsA.length === bondsB.length;
};

/**
 * Copy heavy-atom (x,y) from `laid` onto `original`. Explicit H stay in the
 * molecule but are tucked near their bonded heavy atom (not used for angles).
 */
const mergeHeavyCoords = (original: Molecule, laid: Molecule, bondLen: number): Molecule => {
  const laidById = new Map(laid.atoms.map(a => [a.id, a]));
  const origById = new Map(original.atoms.map(a => [a.id, a]));
  const heavyPos = new Map<string, { x: number; y: number }>();
  for (const a of original.atoms) {
    if (a.element === 'H' || a.element === 'D') continue;
    const p = laidById.get(a.id);
    if (p) heavyPos.set(a.id, { x: p.x, y: p.y });
  }

  const hParent = new Map<string, string>();
  for (const b of original.bonds) {
    const a1 = origById.get(b.fromAtomId);
    const a2 = origById.get(b.toAtomId);
    if (!a1 || !a2) continue;
    if ((a1.element === 'H' || a1.element === 'D') && a2.element !== 'H' && a2.element !== 'D') {
      hParent.set(a1.id, a2.id);
    } else if (
      (a2.element === 'H' || a2.element === 'D') &&
      a1.element !== 'H' &&
      a1.element !== 'D'
    ) {
      hParent.set(a2.id, a1.id);
    }
  }

  const kids = new Map<string, string[]>();
  for (const [hid, pid] of hParent) {
    const list = kids.get(pid) ?? [];
    list.push(hid);
    kids.set(pid, list);
  }

  const hPos = new Map<string, { x: number; y: number }>();
  for (const [pid, hids] of kids) {
    const p = heavyPos.get(pid);
    if (!p) continue;
    hids.forEach((hid, i) => {
      const ang = -Math.PI / 2 + (i * (2 * Math.PI)) / Math.max(hids.length, 1);
      hPos.set(hid, {
        x: p.x + Math.cos(ang) * bondLen * 0.35,
        y: p.y + Math.sin(ang) * bondLen * 0.35,
      });
    });
  }

  return {
    ...original,
    atoms: original.atoms.map(a => {
      const hp = heavyPos.get(a.id);
      if (hp) return { ...a, x: hp.x, y: hp.y };
      const hh = hPos.get(a.id);
      if (hh) return { ...a, x: hh.x, y: hh.y };
      return a;
    }),
  };
};

/** One cheap polish pass — enough for mild tangles without multi-start. */
const lightPolish = (mol: Molecule, bondLen: number): Molecule => {
  const nHeavy = mol.atoms.filter(a => a.element !== 'H' && a.element !== 'D').length;
  const q0 = measureLayoutQuality(mol);

  // Large polycyclics: spring refine + reflection is much cheaper than
  // repairCrossings (which reminimizes per candidate flip).
  if (nHeavy > 40) {
    let next = refine2DEnergy(mol, {
      bondLengthPx: bondLen,
      onlyIfNeeded: false,
      maxIterations: Math.min(180, Math.max(60, Math.floor(40 + nHeavy * 1.5))),
    });
    if (measureLayoutQuality(next).crossings > 0) {
      const flipped = untangleByReflection(next);
      if (layoutScore(flipped) < layoutScore(next) - 0.4) next = flipped;
    }
    return next;
  }

  const maxIter = Math.min(100, Math.max(36, Math.floor(28 + nHeavy * 1.2)));
  let next = minimize2D(mol, {
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
  if (!isChemDrawReady(next) && measureLayoutQuality(next).crossings > q0.crossings * 0.5) {
    // Only repair when crossings remain significant on mid-size molecules.
    const repaired = repairCrossings(next, {
      bondLengthPx: bondLen,
      maxRounds: 2,
      reminimizeIterations: Math.min(32, maxIter),
    });
    if (layoutScore(repaired) <= layoutScore(next) + 0.5) next = repaired;
  }
  return next;
};

export const cleanupStructureWithStatus = (
  mol: Molecule,
  options: CleanupStructureOptions,
): CleanupStructureResult => {
  const bondLen = options.bondLengthPx;
  if (mol.atoms.length === 0 || bondLen <= 0) {
    return { molecule: mol, status: 'certified' };
  }

  const base = stripTerminalHydrogensForLayout(mol);
  const nHeavy = base.atoms.filter(a => a.element !== 'H' && a.element !== 'D').length;

  // 1) Skeleton rebuild only — Cleanup owns polish budget (no double refine).
  let next = generate2D(base, {
    bondLengthPx: bondLen,
    preserveOrientation: options.preserveOrientation ?? true,
    skipEnergyRefine: true,
  });
  // Restore chair/boat from the pre-layout molecule (not the skeleton output):
  // polish / Indigo-adjacent paths must not flatten tagged conformations.
  const conformationSeed = base;
  let status: LayoutStatus = passesHardGate(next)
    ? 'certified'
    : isChemDrawReady(next)
      ? 'certified'
      : 'degraded';

  // 2) Fast exit — ChemDraw-ready after skeleton (octane, aspirin, cholesterol…).
  if (isChemDrawReady(next)) {
    if (!sameHeavyTopology(base, next)) {
      console.warn('[cleanupStructure] heavy topology changed — refusing result');
      return { molecule: mol, status: 'degraded' };
    }
    return {
      molecule: finishCleanup(mol, conformationSeed, next, bondLen),
      status: 'certified',
    };
  }

  // 3) Light polish once (minimize + short repair) — not multi-start.
  const polished = lightPolish(next, bondLen);
  if (layoutScore(polished) <= layoutScore(next) + 0.5) {
    next = polished;
  }
  if (isChemDrawReady(next) || passesSoftGate(next)) {
    status = passesHardGate(next) ? 'certified' : isChemDrawReady(next) ? 'certified' : 'degraded';
    if (!sameHeavyTopology(base, next)) {
      return { molecule: mol, status: 'degraded' };
    }
    // Soft-gate / ChemDraw-ready: skip expensive multi-start.
    if (isChemDrawReady(next) || passesSoftGate(next)) {
      return {
        molecule: finishCleanup(mol, conformationSeed, next, bondLen),
        status: passesHardGate(next) ? 'certified' : 'degraded',
      };
    }
  }

  // 4) Capped multi-start only when still badly tangled.
  const maxRestarts = options.maxRestarts ?? (nHeavy > 50 ? 1 : 2);
  const certified = certifyLayout(next, {
    bondLengthPx: bondLen,
    maxRestarts,
    repairRounds: nHeavy > 50 ? 2 : 3,
  });
  if (
    layoutScore(certified.molecule) <= layoutScore(next) + 0.5 ||
    passesHardGate(certified.molecule) ||
    isChemDrawReady(certified.molecule) ||
    passesSoftGate(certified.molecule)
  ) {
    next = certified.molecule;
    status = certified.status;
  }

  if (!passesSoftGate(next) && measureLayoutQuality(next).overlaps > 0) {
    const spread = repairOverlaps(next, { bondLengthPx: bondLen, maxIterations: 72 });
    const remini = minimize2D(spread, {
      bondLengthPx: bondLen,
      onlyIfNeeded: false,
      maxIterations: Math.min(80, Math.max(40, Math.floor(nHeavy * 0.8))),
    });
    if (layoutScore(remini) <= layoutScore(next) + 0.5) next = remini;
    if (passesSoftGate(next)) status = 'degraded';
  }

  const qFinal = measureLayoutQuality(next);
  if (
    !passesSoftGate(next) &&
    qFinal.overlaps === 0 &&
    qFinal.crossings <= 3 &&
    qFinal.bondRatio > 3
  ) {
    const normed = normalizeBondLengthsInPlace(next, bondLen);
    if (passesSoftGate(normed) || layoutScore(normed) < layoutScore(next)) next = normed;
  }

  if (!sameHeavyTopology(base, next)) {
    console.warn('[cleanupStructure] heavy topology changed — refusing result');
    return { molecule: mol, status: 'degraded' };
  }

  return {
    molecule: finishCleanup(mol, conformationSeed, next, bondLen),
    status,
  };
};

/** Coordinates-only cleanup (backward compatible). */
export const cleanupStructure = (mol: Molecule, options: CleanupStructureOptions): Molecule =>
  cleanupStructureWithStatus(mol, options).molecule;

/** Re-export for callers that want quality without a second measure pass. */
export { measureLayoutQuality, passesHardGate, layoutScore, isChemDrawReady };
