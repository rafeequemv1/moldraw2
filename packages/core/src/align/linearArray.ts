import type { InstanceArraySite, Molecule } from '@moldraw/domain';
import { upsertInstanceArray, virtualAtomIdsForArray } from '../molecule/instanceArrays';

export type LinearArrayOptions = {
  /** Total instances including the original (2–36). */
  count: number;
  /** Center-to-center spacing along +X in world units. */
  spacingPx: number;
  /** When true, copies keep the seed orientation (no extra rotation). */
  rotate: boolean;
};

const clampCount = (n: number) => Math.max(2, Math.min(36, Math.round(n)));

const selectionBounds = (
  mol: Molecule,
  atomIds: string[],
): { cx: number; cy: number; width: number } | null => {
  if (atomIds.length === 0) return null;
  const set = new Set(atomIds);
  let minX = Infinity;
  let maxX = -Infinity;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const a of mol.atoms) {
    if (!set.has(a.id)) continue;
    minX = Math.min(minX, a.x);
    maxX = Math.max(maxX, a.x);
    sx += a.x;
    sy += a.y;
    n += 1;
  }
  if (n === 0) return null;
  return { cx: sx / n, cy: sy / n, width: Math.max(8, maxX - minX) };
};

export const suggestLinearSpacing = (mol: Molecule, atomIds: string[]): number => {
  const b = selectionBounds(mol, atomIds);
  if (!b) return 80;
  return Math.round(Math.max(24, Math.min(400, b.width + 24)));
};

const buildLinearSites = (
  mol: Molecule,
  atomIds: string[],
  options: LinearArrayOptions,
): { sites: InstanceArraySite[]; count: number; spacingPx: number } | null => {
  const count = clampCount(options.count);
  if (atomIds.length === 0 || count < 2) return null;
  const b = selectionBounds(mol, atomIds);
  if (!b) return null;
  const spacingPx = Math.max(16, options.spacingPx);
  const sites: InstanceArraySite[] = [];
  for (let i = 1; i < count; i++) {
    sites.push({ dx: spacingPx * i, dy: 0, rot: 0 });
  }
  return { sites, count, spacingPx };
};

/**
 * Linear array: keep the selection as instance 0 and store `count - 1`
 * placements along +X at a fixed spacing.
 */
export const linearArrayAtoms = (
  mol: Molecule,
  atomIds: string[],
  options: LinearArrayOptions,
): { molecule: Molecule; newAtomIds: string[]; allAtomIds: string[] } => {
  const planned = buildLinearSites(mol, atomIds, options);
  if (!planned) {
    return { molecule: mol, newAtomIds: [], allAtomIds: [...atomIds] };
  }

  const linear = {
    count: planned.count,
    spacingPx: planned.spacingPx,
    rotate: options.rotate,
  };
  const attached = upsertInstanceArray(
    mol,
    atomIds,
    planned.sites,
    'Linear array',
    undefined,
    linear,
  );
  const virtualIds = virtualAtomIdsForArray(attached.instanceArray);
  return {
    molecule: attached.molecule,
    newAtomIds: virtualIds,
    allAtomIds: [...attached.instanceArray.seedAtomIds, ...virtualIds],
  };
};
