/**
 * Stage 3 — polycyclic scaffold helpers.
 *
 * Detect fused-ring fingerprints (taxane 4-6-6-8, steroid 5-6-6-6) and
 * return a preferred ring layout order so Stage 1 places the large core
 * first instead of growing from a peripheral phenyl.
 */
import type { MoleculeGraph } from '../graph';
import type { Ring } from '../types';
import { preferredCoreRingSizeFromRegistry } from './templates/registry';

/** Sorted ring sizes of one fused ring-atom component, e.g. "4-6-6-8". */
export const fusedRingFingerprint = (
  g: MoleculeGraph,
  rings: Ring[],
  ringAtomSet: Set<string>,
): { fingerprint: string; coreRingIndices: number[]; coreAtomIds: string[] } | null => {
  if (rings.length === 0) return null;

  // Largest fused component of ring atoms.
  const seen = new Set<string>();
  let bestGroup: string[] = [];
  for (const start of ringAtomSet) {
    if (seen.has(start)) continue;
    const group: string[] = [];
    const q = [start];
    seen.add(start);
    while (q.length) {
      const u = q.shift()!;
      group.push(u);
      for (const nb of g.nodes.get(u)?.neighbors ?? []) {
        if (!ringAtomSet.has(nb) || seen.has(nb)) continue;
        seen.add(nb);
        q.push(nb);
      }
    }
    if (group.length > bestGroup.length) bestGroup = group;
  }
  if (bestGroup.length < 8) return null;

  const coreSet = new Set(bestGroup);
  const coreRingIndices: number[] = [];
  const sizes: number[] = [];
  rings.forEach((r, i) => {
    if (r.atomIds.every(id => coreSet.has(id))) {
      coreRingIndices.push(i);
      sizes.push(r.size);
    }
  });
  if (coreRingIndices.length < 3) return null;
  sizes.sort((a, b) => a - b);
  return {
    fingerprint: sizes.join('-'),
    coreRingIndices,
    coreAtomIds: bestGroup,
  };
};

/**
 * Order rings for layout: for known scaffolds, place the largest core ring
 * first, then rings by shared atoms with already-ordered rings (same as
 * default, but seeded with the scaffold core).
 */
export const orderRingsForScaffold = (rings: Ring[], preferredFirstSize?: number): Ring[] => {
  if (rings.length <= 1) return [...rings];
  const sorted = [...rings].sort((a, b) => {
    if (preferredFirstSize != null) {
      const ap = a.size === preferredFirstSize ? 1 : 0;
      const bp = b.size === preferredFirstSize ? 1 : 0;
      if (ap !== bp) return bp - ap;
    }
    return b.size - a.size;
  });
  const ordered: Ring[] = [sorted[0]!];
  const placedAtoms = new Set(sorted[0]!.atomIds);
  const remaining = new Set(sorted.slice(1));
  while (remaining.size > 0) {
    let best: Ring | null = null;
    let bestShared = -1;
    for (const r of remaining) {
      const shared = r.atomIds.filter(id => placedAtoms.has(id)).length;
      if (shared > bestShared || (shared === bestShared && best && r.size > best.size)) {
        best = r;
        bestShared = shared;
      }
    }
    if (!best || bestShared <= 0) {
      ordered.push(...remaining);
      break;
    }
    ordered.push(best);
    remaining.delete(best);
    for (const id of best.atomIds) placedAtoms.add(id);
  }
  return ordered;
};

/** Preferred first ring size for known fused fingerprints. */
export const preferredCoreRingSize = (fingerprint: string): number | undefined =>
  preferredCoreRingSizeFromRegistry(fingerprint) ??
  (fingerprint === '4-6-6-8' ? 8 : fingerprint === '5-6-6-6' ? 6 : undefined);
