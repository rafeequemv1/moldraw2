import { computeAutoExtendAngle, getChainPoints } from '../geometry';
import { pickAtomAt } from './hitTest';
import type { InteractionContext } from './types';

/**
 * Chain tool: drag-to-extend a zig-zag carbon chain.
 *
 * Pointer-down on an atom roots the chain at that atom (subsequent atoms link
 * back to it); pointer-down on empty canvas creates a free chain at `worldPos`.
 * Pointer-move tracks the cursor; pointer-up emits the computed zig-zag points
 * via `onAddChain` (skipping single-point chains).
 */
export const chainToolMouseDown = (ctx: InteractionContext): boolean => {
  const { e, worldPos, molecule } = ctx;
  if (e.button !== 0) return false;
  const atom = pickAtomAt(molecule, worldPos);
  if (atom) {
    ctx.setDrawingChain({
      startAtomId: atom.id,
      preferredFirstBondAngle: computeAutoExtendAngle(molecule, atom.id, ctx.bondAngleSnapRad),
      startPos: { x: atom.x, y: atom.y },
      currentPos: worldPos,
    });
  } else {
    ctx.setDrawingChain({ startPos: worldPos, currentPos: worldPos });
  }
  return true;
};

export const chainToolMouseMove = (ctx: InteractionContext): boolean => {
  if (!ctx.drawingChain) return false;
  const { worldPos } = ctx;
  ctx.setDrawingChain(prev => (prev ? { ...prev, currentPos: worldPos } : null));
  return true;
};

export const chainToolMouseUp = (ctx: InteractionContext): boolean => {
  const chain = ctx.drawingChain;
  if (!chain) return false;
  const points = getChainPoints(
    chain.startPos,
    chain.currentPos,
    ctx.bondLengthPx,
    chain.preferredFirstBondAngle,
    ctx.bondAngleSnapRad,
  );
  if (points.length > 1 && ctx.onAddChain) {
    ctx.onAddChain(points, chain.startAtomId);
  }
  ctx.setDrawingChain(null);
  return true;
};
