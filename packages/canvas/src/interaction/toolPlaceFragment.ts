import { ATOM_HIT_RADIUS, pickAtomCenterAt } from './hitTest';
import type { InteractionContext } from './types';
import {
  PLACE_FRAGMENT_TOOL_ID,
  previewFragmentPlacement,
} from '@moldraw/core';

/** Center-only snap — label expansion glued FG ends to nearby OH/NH. */
const SNAP_RADIUS = ATOM_HIT_RADIUS + 8; // 23
const SNAP_RADIUS_DRAG = ATOM_HIT_RADIUS + 12; // 27

function snapPickRadius(ctx: InteractionContext): number {
  return ctx.placementDragging ? SNAP_RADIUS_DRAG : SNAP_RADIUS;
}

/** Sticky snap while dragging: keep targeting the atom pressed until pointer leaves. */
function resolveSnapTargetAtomId(ctx: InteractionContext): string | null {
  const r = snapPickRadius(ctx);
  const under = pickAtomCenterAt(ctx.molecule, ctx.worldPos, r);
  if (under) return under.id;

  if (ctx.placementDragging && ctx.placementAnchorAtomId) {
    const anchor = ctx.molecule.atoms.find(a => a.id === ctx.placementAnchorAtomId);
    if (anchor) {
      const d = Math.hypot(ctx.worldPos.x - anchor.x, ctx.worldPos.y - anchor.y);
      if (d <= r * 1.15) return ctx.placementAnchorAtomId;
    }
  }
  return null;
}

export function isPlaceFragmentTool(tool: string): boolean {
  return tool === PLACE_FRAGMENT_TOOL_ID;
}

function startPlacementDrag(ctx: InteractionContext): void {
  ctx.setPlacementDragging?.(true);
  ctx.setMouseWorldPos(ctx.worldPos);
  const atom = pickAtomCenterAt(ctx.molecule, ctx.worldPos, snapPickRadius(ctx));
  ctx.setPlacementAnchorAtomId?.(atom?.id ?? null);
  ctx.setHoverAtomId(atom?.id ?? null);
}

/** Track pointer, atom hover, and snap target while placing a fragment. */
export const placeFragmentToolMouseMove = (ctx: InteractionContext): boolean => {
  if (!isPlaceFragmentTool(ctx.activeTool)) return false;
  // Palette pointer-down then drag onto the canvas: start the drag on first move
  // with the primary button held (canvas never saw pointerdown).
  if ((ctx.e.buttons & 1) === 1 && !ctx.placementDragging) {
    startPlacementDrag(ctx);
  }
  ctx.setMouseWorldPos(ctx.worldPos);
  const snapId = resolveSnapTargetAtomId(ctx);
  ctx.setHoverAtomId(snapId);
  ctx.setHoverBondId(null);
  return true;
};

export const placeFragmentToolMouseDown = (ctx: InteractionContext): boolean => {
  if (!isPlaceFragmentTool(ctx.activeTool) || ctx.e.button !== 0) return false;
  if (!ctx.fragmentPlacement || !ctx.onCommitFragmentPlacement) return false;

  startPlacementDrag(ctx);
  return true;
};

/**
 * Release after click or drag: attach when snapped to a valid target; flash and
 * cancel when snapped but invalid (overlap / valency); free-place only when not
 * targeting an atom.
 */
export const placeFragmentToolMouseUp = (ctx: InteractionContext): boolean => {
  if (!isPlaceFragmentTool(ctx.activeTool)) return false;
  if (!ctx.fragmentPlacement || !ctx.onCommitFragmentPlacement) return false;
  // Palette pointer-down can unmount the picker under the cursor so the same
  // pointer-up hits the canvas. Ignore until we saw a canvas down or a drag-in.
  if (!ctx.placementDragging) return true;

  const snapTargetId = resolveSnapTargetAtomId(ctx);
  ctx.setPlacementDragging?.(false);
  const session = ctx.fragmentPlacement;

  if (snapTargetId && session.connectionAtomId) {
    const { canAttach } = previewFragmentPlacement(
      ctx.molecule,
      session.fragment,
      session.connectionAtomId,
      ctx.worldPos.x,
      ctx.worldPos.y,
      snapTargetId,
      ctx.bondLengthPx,
      ctx.bondAngleSnapRad,
      session.kind === 'functional_group',
    );
    if (canAttach) {
      ctx.onCommitFragmentPlacement({ type: 'attach', targetAtomId: snapTargetId });
      ctx.setPlacementAnchorAtomId?.(null);
      return true;
    }
    ctx.flashAtomError(snapTargetId);
    ctx.setPlacementAnchorAtomId?.(null);
    return true;
  }

  ctx.onCommitFragmentPlacement({
    type: 'free',
    x: ctx.worldPos.x,
    y: ctx.worldPos.y,
  });
  ctx.setPlacementAnchorAtomId?.(null);
  return true;
};
