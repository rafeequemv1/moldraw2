import type { Molecule } from '@moldraw/domain';
import { computeAutoExtendAngle } from '../geometry/autoExtendAngle';
import {
  fragmentOverlapsParent,
  placementOverlapRadiusPx,
  resolveAttachmentOverlapByRotation,
} from './fragmentPlacementOverlap';

/** Outward unit vector from fragment body through the connection atom (target → conn). */
export function fragmentAttachmentOutwardUnit(
  fragment: Molecule,
  connectionAtomId: string,
): { ux: number; uy: number } {
  const conn = fragment.atoms.find(a => a.id === connectionAtomId);
  if (!conn) return { ux: 1, uy: 0 };

  let cx = 0;
  let cy = 0;
  let n = 0;
  for (const a of fragment.atoms) {
    if (a.id === connectionAtomId) continue;
    cx += a.x;
    cy += a.y;
    n += 1;
  }
  if (n === 0) return { ux: 1, uy: 0 };

  cx /= n;
  cy /= n;
  let ux = conn.x - cx;
  let uy = conn.y - cy;
  const len = Math.hypot(ux, uy);
  if (len < 1e-6) return { ux: 1, uy: 0 };
  return { ux: ux / len, uy: uy / len };
}

export function rotateFragmentAroundAtom(
  fragment: Molecule,
  pivotAtomId: string,
  deltaRad: number,
): Molecule {
  if (Math.abs(deltaRad) < 1e-9) return fragment;
  const pivot = fragment.atoms.find(a => a.id === pivotAtomId);
  if (!pivot) return fragment;

  const cos = Math.cos(deltaRad);
  const sin = Math.sin(deltaRad);
  return {
    ...fragment,
    atoms: fragment.atoms.map(a => {
      const dx = a.x - pivot.x;
      const dy = a.y - pivot.y;
      return {
        ...a,
        x: pivot.x + dx * cos - dy * sin,
        y: pivot.y + dx * sin + dy * cos,
      };
    }),
    bonds: fragment.bonds.map(b => ({ ...b })),
  };
}

/**
 * Rotate and translate a fragment so `connectionAtomId` bonds to `targetAtomId`
 * along the same auto-extend direction used by the bond tool preview.
 */
function layoutFragmentAtExtendAngle(
  parent: Molecule,
  fragment: Molecule,
  connectionAtomId: string,
  targetAtomId: string,
  bondLengthPx: number,
  angle: number,
): Molecule {
  const target = parent.atoms.find(a => a.id === targetAtomId);
  const conn = fragment.atoms.find(a => a.id === connectionAtomId);
  if (!target || !conn) return fragment;

  const tx = Math.cos(angle);
  const ty = Math.sin(angle);

  const { ux: fx, uy: fy } = fragmentAttachmentOutwardUnit(fragment, connectionAtomId);
  const delta = angle - Math.atan2(fy, fx);
  const oriented = rotateFragmentAroundAtom(fragment, connectionAtomId, delta);

  const conn2 = oriented.atoms.find(a => a.id === connectionAtomId)!;
  const desiredConnX = target.x + tx * bondLengthPx;
  const desiredConnY = target.y + ty * bondLengthPx;
  const dx = desiredConnX - conn2.x;
  const dy = desiredConnY - conn2.y;

  return {
    ...oriented,
    atoms: oriented.atoms.map(a => ({ ...a, x: a.x + dx, y: a.y + dy })),
    bonds: oriented.bonds.map(b => ({ ...b })),
  };
}

/**
 * Translate only — keep library fragment orientation (no auto-extend rotate).
 * Connection sits one bond length from the target along the fragment's own
 * attachment outward axis (body → connection → target).
 */
export function layoutFragmentPreserveOrientation(
  parent: Molecule,
  fragment: Molecule,
  connectionAtomId: string,
  targetAtomId: string,
  bondLengthPx: number,
): Molecule {
  const target = parent.atoms.find(a => a.id === targetAtomId);
  const conn = fragment.atoms.find(a => a.id === connectionAtomId);
  if (!target || !conn) return fragment;

  const { ux, uy } = fragmentAttachmentOutwardUnit(fragment, connectionAtomId);
  const desiredConnX = target.x - ux * bondLengthPx;
  const desiredConnY = target.y - uy * bondLengthPx;
  const dx = desiredConnX - conn.x;
  const dy = desiredConnY - conn.y;
  return {
    ...fragment,
    atoms: fragment.atoms.map(a => ({ ...a, x: a.x + dx, y: a.y + dy })),
    bonds: fragment.bonds.map(b => ({ ...b })),
  };
}

export function layoutFragmentForAttachment(
  parent: Molecule,
  fragment: Molecule,
  connectionAtomId: string,
  targetAtomId: string,
  bondLengthPx: number,
  bondAngleSnapRad: number,
): Molecule {
  const minSep = placementOverlapRadiusPx(bondLengthPx);
  const exclude = new Set([targetAtomId]);

  const tryAngle = (angle: number): Molecule => {
    const placed = layoutFragmentAtExtendAngle(
      parent,
      fragment,
      connectionAtomId,
      targetAtomId,
      bondLengthPx,
      angle,
    );
    return resolveAttachmentOverlapByRotation(
      parent,
      placed,
      connectionAtomId,
      targetAtomId,
      minSep,
    );
  };

  const primary = computeAutoExtendAngle(parent, targetAtomId, bondAngleSnapRad);
  const placed = tryAngle(primary);
  if (!fragmentOverlapsParent(parent, placed, exclude, minSep)) return placed;

  const alt = tryAngle(primary + Math.PI);
  if (!fragmentOverlapsParent(parent, alt, exclude, minSep)) return alt;

  return placed;
}
