import { pointSegDist } from '../geometry';
import type { InteractionContext } from './types';

const HOVER_ATOM_RADIUS = 34;
const HOVER_BOND_RADIUS = 12;
const ATOM_BIAS = 6;

/**
 * Update the soft hover indicators (`hoveredAtomCircleId` /
 * `hoveredBondHighlightId`) when no drag/draw is active. We slightly favor
 * atom hover over bond hover (`ATOM_BIAS`) because ring-corner targeting was
 * unreliable when the bond won ties at the corner.
 *
 * Cleared whenever a drag is active so the hover ring doesn't fight the drag.
 */
export const updateCanvasHover = (ctx: InteractionContext): void => {
  const {
    worldPos,
    molecule,
    drawingBond,
    drawingChain,
    drawingStroke,
    drawingReactionArrow,
    drawingCanvasShape,
  } = ctx;

  const hasActiveDraw = !!(
    drawingBond ||
    drawingChain ||
    drawingStroke ||
    drawingReactionArrow ||
    drawingCanvasShape
  );
  if (hasActiveDraw) {
    ctx.setHoveredAtomCircleId(null);
    ctx.setHoveredBondHighlightId(null);
    ctx.setHoveredComponentIds([]);
    return;
  }

  let bestAtom: { id: string; d: number } | null = null;
  for (const a of molecule.atoms) {
    const d = Math.hypot(a.x - worldPos.x, a.y - worldPos.y);
    if (d <= HOVER_ATOM_RADIUS && (!bestAtom || d < bestAtom.d)) bestAtom = { id: a.id, d };
  }

  let bestBond: { id: string; d: number } | null = null;
  for (const b of molecule.bonds) {
    const a1 = molecule.atoms.find(a => a.id === b.fromAtomId);
    const a2 = molecule.atoms.find(a => a.id === b.toAtomId);
    if (!a1 || !a2) continue;
    const d = pointSegDist(worldPos.x, worldPos.y, a1.x, a1.y, a2.x, a2.y);
    if (d <= HOVER_BOND_RADIUS && (!bestBond || d < bestBond.d)) bestBond = { id: b.id, d };
  }

  const atomD = bestAtom?.d ?? Infinity;
  const bondD = bestBond?.d ?? Infinity;
  if (bestAtom && (bondD === Infinity || atomD <= bondD + ATOM_BIAS)) {
    ctx.setHoveredAtomCircleId(bestAtom.id);
    ctx.setHoveredBondHighlightId(null);
  } else {
    ctx.setHoveredAtomCircleId(null);
    ctx.setHoveredBondHighlightId(bestBond?.id ?? null);
  }
  ctx.setHoveredComponentIds([]);
};
