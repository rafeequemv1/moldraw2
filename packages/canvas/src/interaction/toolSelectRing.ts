import { findRingsAtPoint } from '../geometry';
import type { InteractionContext } from './types';

const PICK_CYCLE_EPS = 10;

let ringPickCycle: {
  wx: number;
  wy: number;
  rings: string[][];
  index: number;
} | null = null;

/** Clear Alt+click ring cycle when switching tools or clearing the canvas. */
export const resetRingPickCycle = (): void => {
  ringPickCycle = null;
};

function pickRingAtPointer(
  molecule: InteractionContext['molecule'],
  worldPos: { x: number; y: number },
  altKey: boolean,
): string[] | null {
  const rings = findRingsAtPoint(molecule, worldPos.x, worldPos.y);
  if (rings.length === 0) {
    ringPickCycle = null;
    return null;
  }

  if (
    altKey &&
    ringPickCycle &&
    Math.hypot(worldPos.x - ringPickCycle.wx, worldPos.y - ringPickCycle.wy) < PICK_CYCLE_EPS &&
    rings.length > 1
  ) {
    ringPickCycle.index = (ringPickCycle.index + 1) % rings.length;
    ringPickCycle.rings = rings;
    return rings[ringPickCycle.index];
  }

  ringPickCycle = { wx: worldPos.x, wy: worldPos.y, rings, index: 0 };
  return rings[0];
}

/**
 * Ring-select tool: one click selects every atom in a single ring (for fills /
 * grouped styling). Shift adds a ring; Alt+click cycles when several rings overlap.
 */
export const selectRingToolMouseDown = (ctx: InteractionContext): boolean => {
  const { e, worldPos, molecule, activeTool, selectedAtomIds } = ctx;
  if (e.button !== 0 || activeTool !== 'select_ring') return false;

  ctx.setSelectedCanvasTextId?.(null);
  ctx.setSelectedReactionArrowId?.(null);

  const ringIds = pickRingAtPointer(molecule, worldPos, e.altKey);

  if (!ringIds) {
    if (!e.shiftKey) ctx.setSelectedAtomIds?.([]);
    return true;
  }

  if (ctx.ringPaintActive && ctx.onApplyRingFill) {
    const opacity = ctx.ringFillOpacity ?? 0.22;
    ctx.onApplyRingFill(ringIds, ctx.activeColor, opacity);
    if (e.shiftKey && ctx.setSelectedAtomIds) {
      const merged = new Set(selectedAtomIds);
      for (const id of ringIds) merged.add(id);
      ctx.setSelectedAtomIds([...merged]);
    } else {
      ctx.setSelectedAtomIds?.(ringIds);
    }
    return true;
  }

  if (e.shiftKey && ctx.setSelectedAtomIds) {
    const merged = new Set(selectedAtomIds);
    for (const id of ringIds) merged.add(id);
    ctx.setSelectedAtomIds([...merged]);
  } else {
    ctx.setSelectedAtomIds?.(ringIds);
  }

  ctx.setDragAction({
    type: 'move_selection',
    startX: worldPos.x,
    startY: worldPos.y,
    currentX: worldPos.x,
    currentY: worldPos.y,
  });
  return true;
};

/** Preview ring under cursor while the ring-select tool is active. */
export const selectRingToolUpdateHover = (ctx: InteractionContext): string[] | null => {
  if (ctx.activeTool !== 'select_ring' || ctx.dragAction) return null;
  const rings = findRingsAtPoint(ctx.molecule, ctx.worldPos.x, ctx.worldPos.y);
  return rings[0] ?? null;
};
