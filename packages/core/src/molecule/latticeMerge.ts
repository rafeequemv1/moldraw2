/**
 * Incremental lattice growth.
 *
 * Lattice builders (COF / MOF / graphene) emit deterministic ids derived from
 * lattice position. Re-generating at a new size therefore produces the same
 * ids for every atom that already exists, so instead of "delete the old sheet
 * and append a fresh one" (new random ids → canvas jump, 3D model swap, lost
 * selection) we merge:
 *
 *   - atoms whose id already exists keep their object identity (position and
 *     user-edited props untouched unless the builder moved them);
 *   - new ids are appended;
 *   - previously owned ids that the builder no longer emits are deleted
 *     (e.g. an outer terminal stub that became an interior linker);
 *   - user-drawn bonds between surviving atoms are preserved.
 *
 * Cost is O(atoms + bonds) with Maps — no `Array.find` scans.
 */
import type { Atom, Bond, Molecule } from '@moldraw/domain';
import { deleteAtomSelection } from './mutations';

export type GeneratedLattice = {
  atoms: Atom[];
  bonds: Bond[];
};

export type LatticeMergeResult = {
  molecule: Molecule;
  /** Atom ids emitted by the builder (the lattice's atom set after merge). */
  atomIds: string[];
  /** Ids that did not exist before this merge. */
  addedAtomIds: string[];
  /** Previously owned ids that were removed. */
  removedAtomIds: string[];
  /** True when nothing changed (same ids, same positions, same bonds). */
  unchanged: boolean;
};

const samePlace = (a: Atom, b: Atom) =>
  Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && a.element === b.element;

/**
 * Merge a freshly generated lattice into `prev`.
 * `ownedAtomIds` = atoms the lattice produced last time (candidates for removal).
 */
export function mergeGeneratedLattice(
  prev: Molecule,
  ownedAtomIds: readonly string[],
  generated: GeneratedLattice,
): LatticeMergeResult {
  const prevAtomById = new Map<string, Atom>();
  for (const a of prev.atoms) prevAtomById.set(a.id, a);

  const generatedIds = new Set<string>();
  const generatedById = new Map<string, Atom>();
  for (const a of generated.atoms) {
    generatedIds.add(a.id);
    generatedById.set(a.id, a);
  }

  // 1. Removals: owned ids the builder no longer emits.
  const removedAtomIds: string[] = [];
  for (const id of ownedAtomIds) {
    if (!generatedIds.has(id) && prevAtomById.has(id)) removedAtomIds.push(id);
  }
  let next: Molecule = removedAtomIds.length ? deleteAtomSelection(prev, removedAtomIds) : prev;

  // 2. Atoms: keep existing objects when unchanged, move when the builder moved them, append new.
  const addedAtomIds: string[] = [];
  let atomsChanged = removedAtomIds.length > 0;
  const nextAtoms: Atom[] = new Array(next.atoms.length);
  for (let i = 0; i < next.atoms.length; i++) {
    const cur = next.atoms[i]!;
    const gen = generatedById.get(cur.id);
    if (!gen || samePlace(cur, gen)) {
      nextAtoms[i] = cur;
      continue;
    }
    nextAtoms[i] = { ...cur, x: gen.x, y: gen.y, element: gen.element };
    atomsChanged = true;
  }
  for (const a of generated.atoms) {
    if (prevAtomById.has(a.id)) continue;
    nextAtoms.push(a);
    addedAtomIds.push(a.id);
    atomsChanged = true;
  }

  // 3. Bonds: keep every surviving previous bond; add generated bonds that are new.
  const prevBondIds = new Set<string>();
  const prevPairs = new Set<string>();
  const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
  for (const b of next.bonds) {
    prevBondIds.add(b.id);
    prevPairs.add(pairKey(b.fromAtomId, b.toAtomId));
  }
  const addedBonds: Bond[] = [];
  for (const b of generated.bonds) {
    if (prevBondIds.has(b.id)) continue;
    if (prevPairs.has(pairKey(b.fromAtomId, b.toAtomId))) continue;
    addedBonds.push(b);
  }
  const bondsChanged = removedAtomIds.length > 0 || addedBonds.length > 0;

  if (atomsChanged || bondsChanged) {
    next = {
      ...next,
      atoms: nextAtoms,
      bonds: addedBonds.length ? [...next.bonds, ...addedBonds] : next.bonds,
    };
  }

  return {
    molecule: next,
    atomIds: generated.atoms.map(a => a.id),
    addedAtomIds,
    removedAtomIds,
    unchanged: !atomsChanged && !bondsChanged,
  };
}
