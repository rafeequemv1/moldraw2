/**
 * ChemDraw-style Structure Perspective tool: drag to orbit the 3D pose.
 * Preview is applied in the renderer from `dragAction`; commit on pointer-up.
 * Live molblock previews stream to the right 3D viewer while dragging.
 */
import { molblock3DFromPerspectivePose, rotate3DPose } from '@moldraw/core';
import type { InteractionContext } from './types';

/** Radians per world-pixel of drag (ChemDraw-like sensitivity). */
export const PERSPECTIVE_RAD_PER_PX = 0.01;

const emitPerspectiveOrbitPreview = (
  ctx: InteractionContext,
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
): void => {
  if (!ctx.onPerspectivePosePreview || !ctx.molecule.perspective3D) return;
  const dAngleY = (currentX - startX) * PERSPECTIVE_RAD_PER_PX;
  const dAngleX = (currentY - startY) * PERSPECTIVE_RAD_PER_PX;
  const preview = rotate3DPose(ctx.molecule, dAngleX, dAngleY);
  const mb = molblock3DFromPerspectivePose(preview);
  if (mb) ctx.onPerspectivePosePreview(mb);
};

export const perspectiveToolMouseDown = (ctx: InteractionContext): boolean => {
  const { e, worldPos, molecule, setDragAction, setSelectedAtomIds, setSelectedBondIds } = ctx;
  if (e.button !== 0) return false;
  if (!molecule.perspective3D || Object.keys(molecule.perspective3D.positions).length === 0) {
    return false;
  }
  setSelectedBondIds?.([]);
  setSelectedAtomIds?.([]);
  setDragAction({
    type: 'rotate_perspective',
    startX: worldPos.x,
    startY: worldPos.y,
    currentX: worldPos.x,
    currentY: worldPos.y,
  });
  return true;
};

export const perspectiveToolMouseMove = (ctx: InteractionContext): boolean => {
  const { dragAction, worldPos, setDragAction } = ctx;
  if (dragAction?.type !== 'rotate_perspective') return false;
  setDragAction({
    ...dragAction,
    currentX: worldPos.x,
    currentY: worldPos.y,
  });
  emitPerspectiveOrbitPreview(
    ctx,
    dragAction.startX,
    dragAction.startY,
    worldPos.x,
    worldPos.y,
  );
  return true;
};

export const perspectiveToolMouseUp = (ctx: InteractionContext): boolean => {
  const { dragAction, setDragAction, onRotate3DPoseCommit } = ctx;
  if (dragAction?.type !== 'rotate_perspective') return false;
  const dAngleY = (dragAction.currentX - dragAction.startX) * PERSPECTIVE_RAD_PER_PX;
  const dAngleX = (dragAction.currentY - dragAction.startY) * PERSPECTIVE_RAD_PER_PX;
  setDragAction(null);
  if (Math.abs(dAngleX) > 1e-6 || Math.abs(dAngleY) > 1e-6) {
    onRotate3DPoseCommit?.(dAngleX, dAngleY);
  }
  return true;
};
