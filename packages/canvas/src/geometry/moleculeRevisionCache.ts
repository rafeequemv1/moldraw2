/**
 * Per-molecule-revision caches shared by render + hit-test.
 * Store updates always produce a new `Molecule` reference, so identity is enough.
 */
import type { Atom, Bond, Molecule } from '@moldraw/domain';
import { analyzeStereoIssues } from '@moldraw/domain';
import { documentFragmentBoxes, type FragmentBox } from '@moldraw/core';
import { parseInstanceBondId } from '@moldraw/core';
import type { Point } from './polygons';
import { getSmallestCycleAtomIds, ringCenterForCycle } from './rings';

export type MoleculeRevisionCache = {
  molecule: Molecule;
  atomById: Map<string, Atom>;
  bondById: Map<string, Bond>;
  valencyMap: Map<string, number>;
  stereoWarningAtomIds: ReadonlySet<string>;
  /** Bond id → smallest-ring centroid (doubles/aromatics that need it). */
  ringCenterByBondId: Map<string, Point>;
  /** Bond id → atom ids of the smallest cycle (for in-plane double offsets in 3D). */
  ringAtomIdsByBondId: Map<string, string[]>;
  fragmentBoxes: FragmentBox[];
  /** atomId → fragment box index */
  atomToFragmentIndex: Map<string, number>;
};

let cached: MoleculeRevisionCache | null = null;

export const getMoleculeRevisionCache = (mol: Molecule): MoleculeRevisionCache => {
  if (cached && cached.molecule === mol) return cached;

  const atomById = new Map<string, Atom>();
  for (const a of mol.atoms) atomById.set(a.id, a);
  const bondById = new Map<string, Bond>();
  for (const b of mol.bonds) bondById.set(b.id, b);

  const valencyMap = new Map<string, number>();
  for (const b of mol.bonds) {
    valencyMap.set(b.fromAtomId, (valencyMap.get(b.fromAtomId) || 0) + b.order);
    valencyMap.set(b.toAtomId, (valencyMap.get(b.toAtomId) || 0) + b.order);
  }

  const ringCenterByBondId = new Map<string, Point>();
  const ringAtomIdsByBondId = new Map<string, string[]>();
  // Seed bonds whose walk found no ring — lets instance copies skip the walk too.
  const seedNoRing = new Set<string>();
  const hasInstances = (mol.instanceArrays?.length ?? 0) > 0;
  for (const b of mol.bonds) {
    if (b.order !== 2 && !b.aromatic) continue;
    let ids: string[] | null = null;
    let resolvedFromSeed = false;
    if (hasInstances && b.id.startsWith('ia:')) {
      // Instance copies (`ia:<array>:<site>:b:<seedBond>`) share the seed's ring
      // topology: map the seed cycle onto the copy's atom ids instead of walking
      // the graph again (seed bonds precede their copies in `mol.bonds`).
      const inst = parseInstanceBondId(b.id);
      if (inst) {
        const seedIds = ringAtomIdsByBondId.get(inst.seedBondId);
        if (seedIds) {
          const mapped = seedIds.map(id => `ia:${inst.arrayId}:${inst.siteIndex}:${id}`);
          if (mapped.every(id => atomById.has(id))) {
            ids = mapped;
            resolvedFromSeed = true;
          }
        } else if (seedNoRing.has(inst.seedBondId)) {
          resolvedFromSeed = true;
        }
      }
    }
    if (!resolvedFromSeed) {
      ids = getSmallestCycleAtomIds(b, mol);
      if (!ids && hasInstances && !b.id.startsWith('ia:')) seedNoRing.add(b.id);
    }
    if (ids) {
      ringAtomIdsByBondId.set(b.id, ids);
      const c = ringCenterForCycle(mol, ids);
      if (c) ringCenterByBondId.set(b.id, c);
    }
  }

  const fragmentBoxes = documentFragmentBoxes(mol);
  const atomToFragmentIndex = new Map<string, number>();
  fragmentBoxes.forEach((box, i) => {
    for (const id of box.atomIds) atomToFragmentIndex.set(id, i);
  });

  cached = {
    molecule: mol,
    atomById,
    bondById,
    valencyMap,
    stereoWarningAtomIds: analyzeStereoIssues(mol),
    ringCenterByBondId,
    ringAtomIdsByBondId,
    fragmentBoxes,
    atomToFragmentIndex,
  };
  return cached;
};

export const clearMoleculeRevisionCache = (): void => {
  cached = null;
};
