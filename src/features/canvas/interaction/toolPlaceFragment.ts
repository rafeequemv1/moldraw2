import { pickAtomAt } from './hitTest';
import type { InteractionContext } from './types';
import {
  PLACE_FRAGMENT_TOOL_ID,
  previewFragmentPlacement,
} from '@moldraw/core/molecule/fragmentPlacement';

const SNAP_RADIUS = 34;
const SNAP_RADIUS_DRAG = 52;

function snapPickRadius(ctx: InteractionContext): number {
  return ctx.placementDragging ? SNAP_RADIUS_DRAG : SNAP_RADIUS;
}

/** Sticky snap while dragging: keep targeting the atom pressed until pointer leaves. */
function resolveSnapTargetAtomId(ctx: InteractionContext): string | null {
  const r = snapPickRadius(ctx);
  const under = pickAtomAt(ctx.molecule, ctx.worldPos, r);
  if (under) return under.id;

  if (ctx.placementDragging && ctx.placementAnchorAtomId) {
    const anchor = ctx.molecule.atoms.find(a => a.id === ctx.placementAnchorAtomId);
    if (anchor) {
      const d = Math.hypot(ctx.worldPos.x - anchor.x, ctx.worldPos.y - anchor.y);
      if (d <= r * 1.35) return ctx.placementAnchorAtomId;
    }
  }
  return null;
}

export function isPlaceFragmentTool(tool: string): boolean {
  return tool === PLACE_FRAGMENT_TOOL_ID;
}

/** Track pointer, atom hover, and snap target while placing a fragment. */
export const placeFragmentToolMouseMove = (ctx: InteractionContext): boolean => {
  if (!isPlaceFragmentTool(ctx.activeTool)) return false;
  ctx.setMouseWorldPos(ctx.worldPos);
  const snapId = resolveSnapTargetAtomId(ctx);
  ctx.setHoverAtomId(snapId);
  ctx.setHoverBondId(null);
  return true;
};

export const placeFragmentToolMouseDown = (ctx: InteractionContext): boolean => {
  if (!isPlaceFragmentTool(ctx.activeTool) || ctx.e.button !== 0) return false;
  if (!ctx.fragmentPlacement || !ctx.onCommitFragmentPlacement) return false;

  ctx.setPlacementDragging?.(true);
  ctx.setMouseWorldPos(ctx.worldPos);
  const atom = pickAtomAt(ctx.molecule, ctx.worldPos, snapPickRadius(ctx));
  ctx.setPlacementAnchorAtomId?.(atom?.id ?? null);
  ctx.setHoverAtomId(atom?.id ?? null);
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

  ctx.setPlacementDragging?.(false);

  const snapTargetId = resolveSnapTargetAtomId(ctx);
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
