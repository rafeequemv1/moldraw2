import type { CanvasText } from '@moldraw/domain';
import { handleCanvasTextPointerDown, commitCanvasTextResize } from './canvasTextPointer';
import {
  atomIdsForSelectionTransform,
  collectAtomIdsFromLasso,
  ARROW_ENDPOINT_AXIS_SNAP_WORLD,
  snapReactionArrowResizePointer,
  getSelectionCentroid,
  isNearTransformRotateHandle,
  isNearTransformMoveHandle,
  offsetReactionArrowForDrag,
  pickReactionArrowAt,
  pickReactionArrowEndpoint,
  pickReactionArrowCurveHandle,
  pickTopCanvasTextInRect,
  pointInPolygon,
  reactionArrowEndpointResizePatch,
  shortestAngleDiff,
} from '../geometry';
import type { Point } from '../geometry';
import { pickAtomOrBondForBondTool } from './hitTest';
import type { InteractionContext } from './types';

/**
 * Select / lasso-select tool — ChemDraw-style individual atoms and bonds.
 *
 * Pointer-down branches (priority order):
 *   1. Hit on canvas text         → select + start `move_canvas_text` drag.
 *   2. Hit on reaction arrow endpoint / curve / shaft.
 *   3. Hit on rotate handle       → start `rotate_selection` drag.
 *   4. Hit on move handle         → start `move_selection` drag.
 *   5. Hit on atom                → select that atom + start `move_selection`.
 *   6. Hit on bond mid-shaft      → select that bond + start `move_selection`.
 *   7. Empty canvas + lasso/shift → start `lasso_select`.
 *   8. Empty canvas               → start `box_select`.
 *
 * Marquee / lasso select only atoms (and bonds whose both ends are selected)
 * inside the region — no connected-fragment expansion.
 */
export const selectToolMouseDown = (ctx: InteractionContext): boolean => {
  const { e, worldPos, molecule, activeTool, selectedAtomIds, selectedBondIds = [] } = ctx;
  if (e.button !== 0) return false;
  if (activeTool !== 'select' && activeTool !== 'lasso_select') return false;

  if (handleCanvasTextPointerDown(ctx)) return true;

  const epHit = pickReactionArrowEndpoint(molecule.reactionArrows, worldPos.x, worldPos.y);
  if (epHit && ctx.setSelectedReactionArrowId && ctx.onUpdateReactionArrow) {
    const hitArrow = molecule.reactionArrows?.find(a => a.id === epHit.arrowId);
    if (hitArrow) {
      ctx.setSelectedReactionArrowId(hitArrow.id);
      ctx.setSelectedCanvasTextId?.(null);
      ctx.setSelectedAtomIds?.([]);
      ctx.setSelectedBondIds?.([]);
      ctx.setDragAction({
        type: 'resize_reaction_arrow',
        arrowId: hitArrow.id,
        endpoint: epHit.end,
        startX: worldPos.x,
        startY: worldPos.y,
        currentX: worldPos.x,
        currentY: worldPos.y,
        origArrow: { ...hitArrow },
      });
      return true;
    }
  }

  const curveHit = pickReactionArrowCurveHandle(molecule.reactionArrows, worldPos.x, worldPos.y);
  if (curveHit && ctx.setSelectedReactionArrowId && ctx.onUpdateReactionArrow) {
    const hitArrow = molecule.reactionArrows?.find(a => a.id === curveHit.arrowId);
    if (hitArrow) {
      ctx.setSelectedReactionArrowId(hitArrow.id);
      ctx.setSelectedCanvasTextId?.(null);
      ctx.setSelectedAtomIds?.([]);
      ctx.setSelectedBondIds?.([]);
      ctx.setDragAction({
        type: 'resize_reaction_arrow',
        arrowId: hitArrow.id,
        endpoint: 'curve',
        startX: worldPos.x,
        startY: worldPos.y,
        currentX: worldPos.x,
        currentY: worldPos.y,
        origArrow: { ...hitArrow },
      });
      return true;
    }
  }

  const hitArrow = pickReactionArrowAt(molecule.reactionArrows, worldPos.x, worldPos.y);
  if (hitArrow && ctx.setSelectedReactionArrowId && ctx.onUpdateReactionArrow) {
    ctx.setSelectedReactionArrowId(hitArrow.id);
    ctx.setSelectedCanvasTextId?.(null);
    ctx.setSelectedAtomIds?.([]);
    ctx.setSelectedBondIds?.([]);
    ctx.setDragAction({
      type: 'move_reaction_arrow',
      arrowId: hitArrow.id,
      startX: worldPos.x,
      startY: worldPos.y,
      currentX: worldPos.x,
      currentY: worldPos.y,
      origArrow: { ...hitArrow },
    });
    return true;
  }

  const transformAtomIds = atomIdsForSelectionTransform(molecule, selectedAtomIds, selectedBondIds);
  if (
    transformAtomIds.length > 0 &&
    ctx.onRotateSelectionCommit &&
    isNearTransformRotateHandle(worldPos.x, worldPos.y, molecule, transformAtomIds)
  ) {
    const cen = getSelectionCentroid(molecule, transformAtomIds);
    if (cen) {
      const snap: Record<string, Point> = {};
      for (const id of transformAtomIds) {
        const a = molecule.atoms.find(x => x.id === id);
        if (a) snap[id] = { x: a.x, y: a.y };
      }
      const ang0 = Math.atan2(worldPos.y - cen.cy, worldPos.x - cen.cx);
      ctx.setDragAction({
        type: 'rotate_selection',
        cx: cen.cx,
        cy: cen.cy,
        snap,
        startPointerAngle: ang0,
        currentPointerAngle: ang0,
      });
      return true;
    }
  }

  if (
    transformAtomIds.length > 0 &&
    ctx.onMoveAtoms &&
    isNearTransformMoveHandle(worldPos.x, worldPos.y, molecule, transformAtomIds)
  ) {
    ctx.setDragAction({
      type: 'move_selection',
      startX: worldPos.x,
      startY: worldPos.y,
      currentX: worldPos.x,
      currentY: worldPos.y,
    });
    return true;
  }

  // Mid-shaft prefers bond; near endpoints, atom wins (same as bond tools).
  const { atom: clickedAtom, bond: clickedBond } = pickAtomOrBondForBondTool(molecule, worldPos);

  if (clickedAtom?.id) {
    ctx.setSelectedCanvasTextId?.(null);
    ctx.setSelectedReactionArrowId?.(null);
    if (ctx.setSelectedAtomIds) {
      if (e.shiftKey) {
        const merged = new Set(selectedAtomIds);
        if (merged.has(clickedAtom.id)) merged.delete(clickedAtom.id);
        else merged.add(clickedAtom.id);
        ctx.setSelectedAtomIds([...merged]);
      } else if (!selectedAtomIds.includes(clickedAtom.id) || selectedBondIds.length > 0) {
        // Fresh single-atom selection (or demote bond-only selection).
        ctx.setSelectedAtomIds([clickedAtom.id]);
        ctx.setSelectedBondIds?.([]);
      }
      // Already in multi-atom selection → keep and drag.
    }
    ctx.setDragAction({
      type: 'move_selection',
      startX: worldPos.x,
      startY: worldPos.y,
      currentX: worldPos.x,
      currentY: worldPos.y,
    });
    return true;
  }

  if (clickedBond) {
    ctx.setSelectedCanvasTextId?.(null);
    ctx.setSelectedReactionArrowId?.(null);
    if (e.shiftKey) {
      const merged = new Set(selectedBondIds);
      if (merged.has(clickedBond.id)) merged.delete(clickedBond.id);
      else merged.add(clickedBond.id);
      ctx.setSelectedBondIds?.([...merged]);
    } else if (!selectedBondIds.includes(clickedBond.id) || selectedAtomIds.length > 0) {
      ctx.setSelectedBondIds?.([clickedBond.id]);
      ctx.setSelectedAtomIds?.([]);
    }
    ctx.setDragAction({
      type: 'move_selection',
      startX: worldPos.x,
      startY: worldPos.y,
      currentX: worldPos.x,
      currentY: worldPos.y,
    });
    return true;
  }

  // Empty canvas — clear and start a marquee or lasso.
  ctx.setSelectedCanvasTextId?.(null);
  ctx.setSelectedReactionArrowId?.(null);
  ctx.setSelectedAtomIds?.([]);
  ctx.setSelectedBondIds?.([]);
  if (activeTool === 'lasso_select' || e.shiftKey) {
    ctx.setDragAction({
      type: 'lasso_select',
      points: [worldPos],
      currentX: worldPos.x,
      currentY: worldPos.y,
    });
  } else {
    ctx.setDragAction({
      type: 'box_select',
      startX: worldPos.x,
      startY: worldPos.y,
      currentX: worldPos.x,
      currentY: worldPos.y,
    });
  }
  return true;
};

const LASSO_POINT_SPACING = 2.5;

/**
 * In-flight `dragAction` updates for pointer-move. Returns `true` if a drag
 * action was active and consumed the event; otherwise the caller should fall
 * through to tool-specific move handlers.
 */
export const updateActiveDragAction = (ctx: InteractionContext): boolean => {
  const { dragAction, worldPos } = ctx;
  if (!dragAction) return false;

  if (dragAction.type === 'lasso_select') {
    ctx.setDragAction(prev => {
      if (!prev || prev.type !== 'lasso_select') return prev;
      const last = prev.points[prev.points.length - 1];
      const dist = last ? Math.hypot(worldPos.x - last.x, worldPos.y - last.y) : Infinity;
      if (dist > LASSO_POINT_SPACING) {
        return {
          type: 'lasso_select',
          points: [...prev.points, worldPos],
          currentX: worldPos.x,
          currentY: worldPos.y,
        };
      }
      return { ...prev, currentX: worldPos.x, currentY: worldPos.y };
    });
  } else if (dragAction.type === 'rotate_selection') {
    ctx.setDragAction(prev => {
      if (!prev || prev.type !== 'rotate_selection') return prev;
      const ang = Math.atan2(worldPos.y - prev.cy, worldPos.x - prev.cx);
      return { ...prev, currentPointerAngle: ang };
    });
  } else {
    ctx.setDragAction(prev => {
      if (!prev) return null;
      if (prev.type === 'resize_reaction_arrow') {
        let wx = worldPos.x;
        let wy = worldPos.y;
        if (!ctx.e.shiftKey) {
          const snapped = snapReactionArrowResizePointer(
            ctx.molecule,
            prev.origArrow,
            prev.endpoint,
            prev.startX,
            prev.startY,
            wx,
            wy,
            ARROW_ENDPOINT_AXIS_SNAP_WORLD,
            false,
          );
          wx = snapped.wx;
          wy = snapped.wy;
        }
        return { ...prev, currentX: wx, currentY: wy };
      }
      return { ...prev, currentX: worldPos.x, currentY: worldPos.y } as typeof prev;
    });
  }
  return true;
};

const BOX_DRAG_THRESHOLD = 5;

/** Bonds whose both endpoints lie in `atomIds`. */
const bondsFullyInAtomSet = (
  molecule: InteractionContext['molecule'],
  atomIds: string[],
): string[] => {
  if (atomIds.length < 2) return [];
  const set = new Set(atomIds);
  return molecule.bonds
    .filter(b => set.has(b.fromAtomId) && set.has(b.toAtomId))
    .map(b => b.id);
};

/**
 * Pointer-up commit for an active `dragAction`. Called by the dispatcher
 * before any tool-specific mouseUp logic.
 */
export const commitDragAction = (ctx: InteractionContext): boolean => {
  const { dragAction, molecule, selectedAtomIds, selectedBondIds = [] } = ctx;
  if (!dragAction) return false;

  const moveAtomIds = atomIdsForSelectionTransform(molecule, selectedAtomIds, selectedBondIds);

  if (dragAction.type === 'move_selection' && ctx.onMoveAtoms) {
    const dx = dragAction.currentX - dragAction.startX;
    const dy = dragAction.currentY - dragAction.startY;
    if (Math.hypot(dx, dy) > 1 && moveAtomIds.length > 0) {
      ctx.onMoveAtoms(moveAtomIds, dx, dy);
    }
  } else if (dragAction.type === 'rotate_selection' && ctx.onRotateSelectionCommit) {
    const d = shortestAngleDiff(dragAction.startPointerAngle, dragAction.currentPointerAngle);
    if (Math.abs(d) > 1e-6 && moveAtomIds.length > 0) {
      ctx.onRotateSelectionCommit(moveAtomIds, dragAction.cx, dragAction.cy, d);
    }
  } else if (dragAction.type === 'box_select' && ctx.setSelectedAtomIds) {
    const boxW = Math.abs(dragAction.currentX - dragAction.startX);
    const boxH = Math.abs(dragAction.currentY - dragAction.startY);
    if (boxW > BOX_DRAG_THRESHOLD || boxH > BOX_DRAG_THRESHOLD) {
      const minX = Math.min(dragAction.startX, dragAction.currentX);
      const maxX = Math.max(dragAction.startX, dragAction.currentX);
      const minY = Math.min(dragAction.startY, dragAction.currentY);
      const maxY = Math.max(dragAction.startY, dragAction.currentY);
      const atomsInBox = molecule.atoms
        .filter(a => a.x >= minX && a.x <= maxX && a.y >= minY && a.y <= maxY)
        .map(a => a.id);
      const bondsInBox = bondsFullyInAtomSet(molecule, atomsInBox);
      const canvasCtx = ctx.getCanvasContext();
      const textList = molecule.canvasTexts ?? [];
      const textHit =
        canvasCtx && textList.length
          ? pickTopCanvasTextInRect(canvasCtx, textList, minX, maxX, minY, maxY)
          : null;
      if (atomsInBox.length > 0 || bondsInBox.length > 0) {
        if (ctx.e.shiftKey) {
          const mergedAtoms = new Set(selectedAtomIds);
          for (const id of atomsInBox) mergedAtoms.add(id);
          ctx.setSelectedAtomIds([...mergedAtoms]);
          const mergedBonds = new Set(selectedBondIds);
          for (const id of bondsInBox) mergedBonds.add(id);
          ctx.setSelectedBondIds?.([...mergedBonds]);
        } else {
          ctx.setSelectedAtomIds(atomsInBox);
          ctx.setSelectedBondIds?.(bondsInBox);
        }
        ctx.setSelectedCanvasTextId?.(null);
        ctx.setSelectedReactionArrowId?.(null);
      } else if (textHit && ctx.setSelectedCanvasTextId) {
        ctx.setSelectedCanvasTextId(textHit.id);
        ctx.setSelectedAtomIds([]);
        ctx.setSelectedBondIds?.([]);
        ctx.setSelectedReactionArrowId?.(null);
      } else {
        ctx.setSelectedAtomIds([]);
        ctx.setSelectedBondIds?.([]);
        ctx.setSelectedCanvasTextId?.(null);
        ctx.setSelectedReactionArrowId?.(null);
      }
    }
    // Trivially small box (plain click) was already cleared on mouseDown.
  } else if (dragAction.type === 'lasso_select' && ctx.setSelectedAtomIds) {
    const stroke: Point[] = [
      ...dragAction.points,
      { x: dragAction.currentX, y: dragAction.currentY },
    ];
    if (stroke.length >= 3) {
      const first = stroke[0];
      const last = stroke[stroke.length - 1];
      const loop =
        first && last && (first.x !== last.x || first.y !== last.y) ? [...stroke, first] : stroke;
      const ids = collectAtomIdsFromLasso(molecule, loop);
      const bondIds = bondsFullyInAtomSet(molecule, ids);
      const canvasCtx = ctx.getCanvasContext();
      const textsLasso = molecule.canvasTexts ?? [];
      let textInLasso: CanvasText | null = null;
      if (canvasCtx && textsLasso.length) {
        for (let ti = textsLasso.length - 1; ti >= 0; ti--) {
          const t = textsLasso[ti];
          if (pointInPolygon(t.x, t.y, loop)) {
            textInLasso = t;
            break;
          }
        }
      }
      if (ids.length > 0 || bondIds.length > 0) {
        if (ctx.e.shiftKey) {
          const merged = new Set(selectedAtomIds);
          for (const id of ids) merged.add(id);
          ctx.setSelectedAtomIds([...merged]);
          const mergedBonds = new Set(selectedBondIds);
          for (const id of bondIds) mergedBonds.add(id);
          ctx.setSelectedBondIds?.([...mergedBonds]);
        } else {
          ctx.setSelectedAtomIds(ids);
          ctx.setSelectedBondIds?.(bondIds);
        }
        ctx.setSelectedCanvasTextId?.(null);
        ctx.setSelectedReactionArrowId?.(null);
      } else if (textInLasso && ctx.setSelectedCanvasTextId) {
        ctx.setSelectedCanvasTextId(textInLasso.id);
        ctx.setSelectedAtomIds([]);
        ctx.setSelectedBondIds?.([]);
        ctx.setSelectedReactionArrowId?.(null);
      } else {
        ctx.setSelectedAtomIds(ids);
        ctx.setSelectedBondIds?.([]);
        ctx.setSelectedCanvasTextId?.(null);
        ctx.setSelectedReactionArrowId?.(null);
      }
    }
  } else if (dragAction.type === 'move_canvas_text' && ctx.onUpdateCanvasText) {
    const dx = dragAction.currentX - dragAction.startX;
    const dy = dragAction.currentY - dragAction.startY;
    if (Math.hypot(dx, dy) > 0.5) {
      ctx.onUpdateCanvasText(dragAction.textId, {
        x: dragAction.origX + dx,
        y: dragAction.origY + dy,
      });
    }
  } else if (dragAction.type === 'resize_canvas_text') {
    commitCanvasTextResize(ctx);
  } else if (dragAction.type === 'move_reaction_arrow' && ctx.onUpdateReactionArrow) {
    const dx = dragAction.currentX - dragAction.startX;
    const dy = dragAction.currentY - dragAction.startY;
    if (Math.hypot(dx, dy) > 0.5) {
      ctx.onUpdateReactionArrow(
        dragAction.arrowId,
        offsetReactionArrowForDrag(dragAction.origArrow, dx, dy),
      );
    }
  } else if (dragAction.type === 'resize_reaction_arrow' && ctx.onUpdateReactionArrow) {
    const dx = dragAction.currentX - dragAction.startX;
    const dy = dragAction.currentY - dragAction.startY;
    if (Math.hypot(dx, dy) > 0.25) {
      ctx.onUpdateReactionArrow(
        dragAction.arrowId,
        reactionArrowEndpointResizePatch(dragAction.origArrow, dragAction.endpoint, dx, dy),
      );
    }
  }

  ctx.setDragAction(null);
  return true;
};
