import type { InstanceArraySite, Molecule } from '@moldraw/domain';
import { upsertInstanceArray, virtualAtomIdsForArray } from '../molecule/instanceArrays';

export type CircularArrayOptions = {
  /** Total instances including the original (2–36). */
  count: number;
  /** Center-to-centroid radius in world units. */
  radius: number;
  /**
   * Angle in degrees between consecutive instances.
   * When omitted, uses a full circle: `360 / count`.
   */
  spacingDeg?: number;
  /**
   * When true, each copy is rotated by its polar angle (faces along the ring).
   * When false, copies stay upright.
   */
  rotate: boolean;
};

const clampCount = (n: number) => Math.max(2, Math.min(36, Math.round(n)));

const selectionCentroid = (
  mol: Molecule,
  atomIds: string[],
): { cx: number; cy: number } | null => {
  if (atomIds.length === 0) return null;
  const set = new Set(atomIds);
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const a of mol.atoms) {
    if (!set.has(a.id)) continue;
    sx += a.x;
    sy += a.y;
    n += 1;
  }
  if (n === 0) return null;
  return { cx: sx / n, cy: sy / n };
};

const buildCircularSites = (
  mol: Molecule,
  atomIds: string[],
  options: CircularArrayOptions,
): { sites: InstanceArraySite[]; count: number; radius: number; spacingDeg: number } | null => {
  const count = clampCount(options.count);
  if (atomIds.length === 0 || count < 2) return null;
  const sc = selectionCentroid(mol, atomIds);
  if (!sc) return null;

  const radius = Math.max(8, options.radius);
  const spacingDeg =
    typeof options.spacingDeg === 'number' &&
    Number.isFinite(options.spacingDeg) &&
    options.spacingDeg > 0
      ? options.spacingDeg
      : 360 / count;
  const step = (spacingDeg * Math.PI) / 180;
  const cx = sc.cx - radius;
  const cy = sc.cy;

  const sites: InstanceArraySite[] = [];
  for (let i = 1; i < count; i++) {
    const angle = step * i;
    const tx = cx + radius * Math.cos(angle);
    const ty = cy + radius * Math.sin(angle);
    const dx = tx - sc.cx;
    const dy = ty - sc.cy;
    const rot = options.rotate ? angle : 0;
    sites.push({ dx, dy, rot });
  }
  return { sites, count, radius, spacingDeg };
};

/**
 * Polar / circular array: keep the selection as instance 0 and store
 * `count - 1` placement transforms. Copies stay instanced until Ungroup
 * (or export / 3D / cleanup). Slider updates upsert the same array id.
 */
export const circularArrayAtoms = (
  mol: Molecule,
  atomIds: string[],
  options: CircularArrayOptions,
): { molecule: Molecule; newAtomIds: string[]; allAtomIds: string[] } => {
  const planned = buildCircularSites(mol, atomIds, options);
  if (!planned) {
    return { molecule: mol, newAtomIds: [], allAtomIds: [...atomIds] };
  }

  const circular = {
    count: planned.count,
    radius: planned.radius,
    spacingDeg: options.spacingDeg,
    rotate: options.rotate,
  };
  const attached = upsertInstanceArray(
    mol,
    atomIds,
    planned.sites,
    'Circular array',
    circular,
  );
  const virtualIds = virtualAtomIdsForArray(attached.instanceArray);
  return {
    molecule: attached.molecule,
    newAtomIds: virtualIds,
    allAtomIds: [...attached.instanceArray.seedAtomIds, ...virtualIds],
  };
};
