/**
 * Suggest the "natural" outward direction in which to extend a new bond from
 * an existing atom — snapped to `snapRad` increments.
 *
 * 0 neighbors → up-right (-π/6, ~30° above horizontal).
 * 1 neighbor → 120° from the existing bond (ChemDraw 2D trigonal, not tetrahedral).
 * n≥2 neighbors → opposite the resultant of (atom → neighbor) unit vectors.
 *
 * Returned angle is in canvas-screen radians: 0 = +x (right), positive = down.
 */
import type { Molecule } from '@moldraw/domain';

const snapAngleToStepRad = (rad: number, stepRad: number): number => {
  if (stepRad < 1e-9) return rad;
  return Math.round(rad / stepRad) * stepRad;
};

const DEFAULT_SNAP = Math.PI / 6;
const DEFAULT_EXTEND_ANGLE = -Math.PI / 6;
/** 120° in the plane — ChemDraw skeletal convention (not 109.5° tetrahedral). */
const TRIGONAL_PLANE_ANGLE = (120 * Math.PI) / 180;

export const computeAutoExtendAngle = (
  molecule: Molecule,
  atomId: string,
  snapRad: number = DEFAULT_SNAP,
): number => {
  const snap = snapRad > 1e-9 ? snapRad : DEFAULT_SNAP;
  const atom = molecule.atoms.find(a => a.id === atomId);
  if (!atom) return snapAngleToStepRad(DEFAULT_EXTEND_ANGLE, snap);

  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const b of molecule.bonds) {
    const neighborId =
      b.fromAtomId === atomId ? b.toAtomId : b.toAtomId === atomId ? b.fromAtomId : null;
    if (!neighborId) continue;
    const neighbor = molecule.atoms.find(a => a.id === neighborId);
    if (!neighbor) continue;
    const dx = neighbor.x - atom.x;
    const dy = neighbor.y - atom.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) continue;
    sx += dx / d;
    sy += dy / d;
    n += 1;
  }

  if (n === 0) return snapAngleToStepRad(DEFAULT_EXTEND_ANGLE, snap);

  if (n === 1) {
    const θ = Math.atan2(sy, sx);
    const candA = θ + TRIGONAL_PLANE_ANGLE;
    const candB = θ - TRIGONAL_PLANE_ANGLE;
    const snapA = snapAngleToStepRad(candA, snap);
    const snapB = snapAngleToStepRad(candB, snap);
    const nLen = Math.hypot(sx, sy) || 1;
    const nx = sx / nLen;
    const ny = sy / nLen;
    const dotA = Math.cos(snapA) * nx + Math.sin(snapA) * ny;
    const dotB = Math.cos(snapB) * nx + Math.sin(snapB) * ny;
    if (dotA <= 0 && dotB <= 0) return dotA <= dotB ? snapA : snapB;
    if (dotA <= 0) return snapA;
    if (dotB <= 0) return snapB;
    return snapAngleToStepRad(θ + Math.PI, snap);
  }

  if (Math.hypot(sx, sy) < 1e-3) {
    return snapAngleToStepRad(-Math.PI / 2, snap);
  }

  const opposite = Math.atan2(-sy, -sx);
  return snapAngleToStepRad(opposite, snap);
};
