import type { Molecule } from '@moldraw/domain';
import { rotateFragmentAroundAtom } from './fragmentAttachmentLayout';

export const placementOverlapRadiusPx = (bondLengthPx: number): number =>
  Math.max(22, bondLengthPx * 0.72);

export function fragmentOverlapsParent(
  parent: Molecule,
  fragment: Molecule,
  excludeParentAtomIds: ReadonlySet<string>,
  minSeparationPx: number,
): boolean {
  for (const fa of fragment.atoms) {
    for (const pa of parent.atoms) {
      if (excludeParentAtomIds.has(pa.id)) continue;
      if (Math.hypot(fa.x - pa.x, fa.y - pa.y) < minSeparationPx) return true;
    }
  }
  return false;
}

/** Rotate about the connection atom (bond length unchanged) until the fragment clears the parent. */
export function resolveAttachmentOverlapByRotation(
  parent: Molecule,
  fragment: Molecule,
  connectionAtomId: string,
  targetAtomId: string,
  minSeparationPx: number,
): Molecule {
  const exclude = new Set([targetAtomId]);
  if (!fragmentOverlapsParent(parent, fragment, exclude, minSeparationPx)) return fragment;

  const step = Math.PI / 12;
  for (let i = 1; i <= 24; i++) {
    for (const sign of [1, -1] as const) {
      const rotated = rotateFragmentAroundAtom(
        fragment,
        connectionAtomId,
        sign * i * step,
      );
      if (!fragmentOverlapsParent(parent, rotated, exclude, minSeparationPx)) {
        return rotated;
      }
    }
  }
  return fragment;
}

/** Translate the fragment until no atom sits on top of the parent structure. */
export function nudgeFragmentClearOfParent(
  parent: Molecule,
  fragment: Molecule,
  excludeParentAtomIds: ReadonlySet<string>,
  minSeparationPx: number,
  maxIterations = 24,
): Molecule {
  let atoms = fragment.atoms.map(a => ({ ...a }));

  for (let iter = 0; iter < maxIterations; iter++) {
    let pushX = 0;
    let pushY = 0;
    let worstPen = 0;

    for (const fa of atoms) {
      for (const pa of parent.atoms) {
        if (excludeParentAtomIds.has(pa.id)) continue;
        const dx = fa.x - pa.x;
        const dy = fa.y - pa.y;
        const d = Math.hypot(dx, dy);
        if (d >= minSeparationPx) continue;

        const pen = d < 1e-6 ? minSeparationPx : minSeparationPx - d;
        if (pen <= worstPen) continue;

        worstPen = pen;
        if (d < 1e-6) {
          pushX = minSeparationPx;
          pushY = 0;
        } else {
          pushX = (dx / d) * pen;
          pushY = (dy / d) * pen;
        }
      }
    }

    if (worstPen < 0.5) break;
    atoms = atoms.map(a => ({ ...a, x: a.x + pushX, y: a.y + pushY }));
  }

  return { ...fragment, atoms, bonds: fragment.bonds.map(b => ({ ...b })) };
}
