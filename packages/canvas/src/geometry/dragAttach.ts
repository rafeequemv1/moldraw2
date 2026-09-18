import type { Molecule } from '@moldraw/domain';

/**
 * How close a moved atom center must land to a stationary atom before
 * drop-to-attach joins them. Tight enough that a normal bond length does not
 * collapse, wide enough to catch a deliberate drop on a vertex or group.
 */
export const dragAttachRadius = (bondLengthPx: number): number => {
  const bl = Number.isFinite(bondLengthPx) && bondLengthPx > 0 ? bondLengthPx : 40;
  return Math.min(20, Math.max(12, bl * 0.42));
};

export type DragAttachPair = { sourceId: string; targetId: string };

/** Closest moving atom whose translated center sits on a stationary atom. */
export const findDragAttachPair = (
  molecule: Molecule,
  movingIds: readonly string[],
  dx: number,
  dy: number,
  radius: number,
): DragAttachPair | null => {
  if (movingIds.length === 0 || radius <= 0) return null;
  if (Math.hypot(dx, dy) < 1) return null;
  const moving = new Set(movingIds);
  let best: (DragAttachPair & { d: number }) | null = null;
  for (const src of molecule.atoms) {
    if (!moving.has(src.id)) continue;
    const x = src.x + dx;
    const y = src.y + dy;
    for (const tgt of molecule.atoms) {
      if (moving.has(tgt.id)) continue;
      const d = Math.hypot(tgt.x - x, tgt.y - y);
      if (d <= radius && (!best || d < best.d)) {
        best = { sourceId: src.id, targetId: tgt.id, d };
      }
    }
  }
  return best ? { sourceId: best.sourceId, targetId: best.targetId } : null;
};

/** Translate that puts `sourceId` exactly on `targetId` (pre-drag coordinates). */
export const dragDeltaToLandOnAtom = (
  molecule: Molecule,
  sourceId: string,
  targetId: string,
): { dx: number; dy: number } | null => {
  const src = molecule.atoms.find(a => a.id === sourceId);
  const tgt = molecule.atoms.find(a => a.id === targetId);
  if (!src || !tgt) return null;
  return { dx: tgt.x - src.x, dy: tgt.y - src.y };
};
