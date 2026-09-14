import {
  canvasOrbitalRotatePatch,
  orbitalSupportsRotation,
  pickCanvasOrbitalAt,
  pickOrbitalRotateHandle,
  resolveOrbitalCenter,
} from '../geometry/orbitals';
import { pickAtomAt } from './hitTest';
import type { InteractionContext } from './types';

const ATOM_REATTACH_R = 14;

function clearOtherSelection(ctx: InteractionContext): void {
  ctx.setSelectedAtomIds?.([]);
  ctx.setSelectedBondIds?.([]);
  ctx.setSelectedCanvasTextId?.(null);
  ctx.setColorEditCanvasShapeId?.(null);
  ctx.setSelectedCanvasImageId?.(null);
  ctx.setSelectedReactionArrowId?.(null);
  ctx.setSelectedSruBracketId?.(null);
}

function beginRotate(
  ctx: InteractionContext,
  orbital: import('@moldraw/domain').CanvasOrbital,
): void {
  const c = resolveOrbitalCenter(ctx.molecule, orbital);
  const ang0 = Math.atan2(ctx.worldPos.y - c.y, ctx.worldPos.x - c.x);
  ctx.setDragAction({
    type: 'rotate_canvas_orbital',
    orbitalId: orbital.id,
    startX: ctx.worldPos.x,
    startY: ctx.worldPos.y,
    currentX: ctx.worldPos.x,
    currentY: ctx.worldPos.y,
    origOrbital: { ...orbital },
    cx: c.x,
    cy: c.y,
    startPointerAngle: ang0,
    currentPointerAngle: ang0,
  });
}

function beginMove(
  ctx: InteractionContext,
  orbital: import('@moldraw/domain').CanvasOrbital,
): void {
  const c = resolveOrbitalCenter(ctx.molecule, orbital);
  ctx.setDragAction({
    type: 'move_canvas_orbital',
    orbitalId: orbital.id,
    startX: ctx.worldPos.x,
    startY: ctx.worldPos.y,
    currentX: ctx.worldPos.x,
    currentY: ctx.worldPos.y,
    origX: c.x,
    origY: c.y,
  });
}

/**
 * Pointer-down on an orbital: rotate handle or body-drag (select tool).
 */
export function handleCanvasOrbitalPointerDown(ctx: InteractionContext): boolean {
  const list = ctx.molecule.orbitals ?? [];
  if (!list.length) return false;

  const isSelectTool = ctx.activeTool === 'select' || ctx.activeTool === 'lasso_select';
  if (!isSelectTool) return false;

  const zoom = ctx.viewport?.zoom ?? 1;
  const selectedId = ctx.selectedCanvasOrbitalIds?.[0] ?? null;

  if (selectedId && ctx.onUpdateCanvasOrbital) {
    const selected = list.find(o => o.id === selectedId);
    if (selected && orbitalSupportsRotation(selected)) {
      const c = resolveOrbitalCenter(ctx.molecule, selected);
      if (pickOrbitalRotateHandle(selected, c.x, c.y, ctx.worldPos.x, ctx.worldPos.y, zoom)) {
        ctx.setSelectedCanvasOrbitalIds?.([selected.id]);
        clearOtherSelection(ctx);
        beginRotate(ctx, selected);
        return true;
      }
    }
  }

  const picked = pickCanvasOrbitalAt(ctx.molecule, ctx.worldPos.x, ctx.worldPos.y, {
    includeCenter: true,
  });
  if (!picked) return false;

  ctx.setSelectedCanvasOrbitalIds?.([picked.id]);
  clearOtherSelection(ctx);

  if (orbitalSupportsRotation(picked)) {
    const c = resolveOrbitalCenter(ctx.molecule, picked);
    if (pickOrbitalRotateHandle(picked, c.x, c.y, ctx.worldPos.x, ctx.worldPos.y, zoom)) {
      beginRotate(ctx, picked);
      return true;
    }
  }

  beginMove(ctx, picked);
  return true;
}

export function commitCanvasOrbitalDrag(ctx: InteractionContext): void {
  const { dragAction } = ctx;
  if (!dragAction || !ctx.onUpdateCanvasOrbital) return;

  if (dragAction.type === 'move_canvas_orbital') {
    const dx = dragAction.currentX - dragAction.startX;
    const dy = dragAction.currentY - dragAction.startY;
    if (Math.hypot(dx, dy) <= 0.5) return;
    const x = dragAction.origX + dx;
    const y = dragAction.origY + dy;
    const atom = pickAtomAt(ctx.molecule, { x, y }, ATOM_REATTACH_R, { includeLabels: false });
    if (atom && Math.hypot(atom.x - x, atom.y - y) <= ATOM_REATTACH_R) {
      ctx.onUpdateCanvasOrbital(dragAction.orbitalId, {
        x: atom.x,
        y: atom.y,
        atomId: atom.id,
      });
      return;
    }
    ctx.onUpdateCanvasOrbital(dragAction.orbitalId, { x, y, atomId: null });
    return;
  }

  if (dragAction.type === 'rotate_canvas_orbital') {
    const patch = canvasOrbitalRotatePatch(
      dragAction.origOrbital,
      dragAction.startPointerAngle,
      dragAction.currentPointerAngle,
      ctx.e.shiftKey,
    );
    if (Math.abs(patch.rotationRad - dragAction.origOrbital.rotationRad) < 1e-6) return;
    ctx.onUpdateCanvasOrbital(dragAction.orbitalId, patch);
  }
}
