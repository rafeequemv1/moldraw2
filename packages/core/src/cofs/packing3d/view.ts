import type { Atom, Atom3DPose } from '@moldraw/domain';

/** Default orbit so stacked layers separate on the 2D canvas. */
export const COF_LAYER_VIEW_RAD = { x: 0.58, y: 0.42 } as const;

/** ~3.4 Å interlayer vs ~1.4 Å aromatic bond. */
export const COF_INTERLAYER_BOND_RATIO = 3.4 / 1.4;

export const interlayerPx = (bondLength: number, ratio = COF_INTERLAYER_BOND_RATIO): number =>
  Math.max(16, bondLength) * ratio;

export function crystalPoseForAtoms(
  atoms: readonly Atom[],
  zOf: (atom: Atom) => number,
): Record<string, Atom3DPose> {
  const positions: Record<string, Atom3DPose> = {};
  for (const a of atoms) {
    positions[a.id] = { x: a.x, y: a.y, z: zOf(a) };
  }
  return positions;
}
