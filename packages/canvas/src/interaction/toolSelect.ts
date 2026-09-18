import { reactionArrowSupportsReagentLabels, type ReactionArrowUpdatePatch } from '@moldraw/domain';
import {
  handleCanvasTextPointerDown,
  commitCanvasTextResize,
  beginCanvasTextMove,
} from './canvasTextPointer';
import { handleCanvasImagePointerDown, commitCanvasImageDrag } from './canvasImagePointer';
import { handleCanvasShapePointerDown, commitCanvasShapeDrag } from './canvasShapePointer';
import { handleCanvasOrbitalPointerDown, commitCanvasOrbitalDrag } from './canvasOrbitalPointer';
import { handleStrokePointerDown } from './toolStrokePointer';
import {
  atomIdsForSelectionTransform,
  collectAtomIdsFromLasso,
  ARROW_ENDPOINT_AXIS_SNAP_WORLD,
  snapReactionArrowMovePointer,
  snapReactionArrowResizePointer,
  snapSelectionMovePointer,
  getSelectionCentroid,
  isNearTransformRotateHandle,
  scaleFactorsForBoxHandle,
  isInsideSelectionTransformBox,
  hasMarqueeSelectionContent,
  type MarqueeSelectionBoundsInput,
  findSmallestRingAtPoint,
  offsetReactionArrowForDrag,
  pickReactionArrowAt,
  pickReactionArrowEndpoint,
  pickReactionArrowCurveHandle,
  pickReactionArrowReagentSlot,
  reagentSlotChipHitTolWorld,
  reactionArrowEndpointResizePatch,
  shortestAngleDiff,
  pickSruBracketAt,
  expandAtomIdsToConnectedFragments,
  pickCanvasTextAt,
  pickCanvasImageAt,
  collectAnnotationsInRect,
  collectAnnotationsInPolygon,
  type MarqueeAnnotationSet,
  pickStrokeAt,
  pickCanvasOrbitalAt,
  arrowsForHitTest,
  arrowHandleHitTolWorld,
} from '../geometry';
import { hitCanvasShapeTransformed } from '../geometry/canvasShapeTransform';
import type { Point } from '../geometry';
import {
  applyElectronFlowEndpointResnap,
  clampChargeMarkOffset,
  expandAtomIdsToObjectCollections,
  molblock3DFromPerspectivePose,
  rotate3DPose,
} from '@moldraw/core';
import {
  pickAtomIdsInRect,
  pickAtomOrBondForBondTool,
  pickAtomOrBondForSelectTool,
  pickChargeMarkAt,
} from './hitTest';
import { PERSPECTIVE_RAD_PER_PX } from './toolPerspective';
import type { InteractionContext } from './types';
import { isSelectTool } from './selectTools';

/** Expand to Pattern/Group collections so arrayed molecules move as one unit. */
const expandForGroupedMove = (molecule: InteractionContext['molecule'], atomIds: string[]) =>
  expandAtomIdsToObjectCollections(molecule, atomIds);

const mergeIdLists = (a: string[], b: string[]): string[] => [...new Set([...a, ...b])];

const applyMarqueeSelection = (
  ctx: InteractionContext,
  atomIds: string[],
  bondIds: string[],
  ann: MarqueeAnnotationSet,
  shift: boolean,
): void => {
  const fragmentAtoms =
    ctx.activeTool === 'fragment_select'
      ? expandAtomIdsToConnectedFragments(ctx.molecule, atomIds)
      : atomIds;
  const groupedAtoms = expandForGroupedMove(ctx.molecule, fragmentAtoms);
  const groupedBonds =
    groupedAtoms.length > atomIds.length
      ? bondsFullyInAtomSet(ctx.molecule, groupedAtoms)
      : bondIds;
  const patch = shift
    ? {
        atomIds: mergeIdLists(ctx.selectedAtomIds, groupedAtoms),
        bondIds: mergeIdLists(ctx.selectedBondIds ?? [], groupedBonds),
        reactionArrowIds: mergeIdLists(ctx.selectedReactionArrowIds ?? [], ann.reactionArrowIds),
        strokeIds: mergeIdLists(ctx.selectedStrokeIds ?? [], ann.strokeIds),
        canvasTextIds: mergeIdLists(ctx.selectedCanvasTextIds ?? [], ann.canvasTextIds),
        canvasShapeIds: mergeIdLists(ctx.selectedCanvasShapeIds ?? [], ann.canvasShapeIds),
        canvasImageIds: mergeIdLists(ctx.selectedCanvasImageIds ?? [], ann.canvasImageIds),
        canvasOrbitalIds: [],
      }
    : {
        atomIds: groupedAtoms,
        bondIds: groupedBonds,
        reactionArrowIds: ann.reactionArrowIds,
        strokeIds: ann.strokeIds,
        canvasTextIds: ann.canvasTextIds,
        canvasShapeIds: ann.canvasShapeIds,
        canvasImageIds: ann.canvasImageIds,
        canvasOrbitalIds: [],
      };

  ctx.onSetMarqueeSelection?.(patch);
  if (ctx.onSetMarqueeSelection) {
    ctx.setSelectedSruBracketId?.(null);
    ctx.setSelectedChargeAtomIds?.([]);
    ctx.setSelectedChargeMarkKind?.(null);
    return;
  }
  ctx.setSelectedAtomIds?.(patch.atomIds);
  ctx.setSelectedBondIds?.(patch.bondIds);
  ctx.setSelectedSruBracketId?.(null);
  ctx.setSelectedChargeAtomIds?.([]);
  ctx.setSelectedChargeMarkKind?.(null);
  // Keep singular fields in sync for property panels.
  ctx.setSelectedCanvasTextId?.(patch.canvasTextIds[0] ?? null);
  ctx.setColorEditCanvasShapeId?.(patch.canvasShapeIds[0] ?? null);
  ctx.setSelectedReactionArrowId?.(patch.reactionArrowIds[0] ?? null);
  ctx.setSelectedCanvasImageId?.(patch.canvasImageIds[0] ?? null);
  ctx.setColorEditStrokeId?.(patch.strokeIds[0] ?? null);
  ctx.setSelectedCanvasOrbitalIds?.(patch.canvasOrbitalIds ?? []);
};

const clearMarqueeSelection = (ctx: InteractionContext): void => {
  applyMarqueeSelection(
    ctx,
    [],
    [],
    {
      reactionArrowIds: [],
      strokeIds: [],
      canvasTextIds: [],
      canvasShapeIds: [],
      canvasImageIds: [],
    },
    false,
  );
};

const annotationCount = (sel: MarqueeSelectionBoundsInput): number =>
  (sel.reactionArrowIds?.length ?? 0) +
  (sel.strokeIds?.length ?? 0) +
  (sel.canvasTextIds?.length ?? 0) +
  (sel.canvasShapeIds?.length ?? 0) +
  (sel.canvasImageIds?.length ?? 0);

const isExclusiveKind = (
  sel: MarqueeSelectionBoundsInput,
  atomCount: number,
  key: keyof MarqueeSelectionBoundsInput,
): boolean =>
  atomCount === 0 &&
  annotationCount(sel) === 1 &&
  (sel[key]?.length ?? 0) === 1;

/** Hide the HTML text overlay so canvas letters + transform chrome move as one. */
const hideTextOverlayIfSelected = (ctx: InteractionContext): void => {
  if ((ctx.selectedCanvasTextIds?.length ?? 0) === 0 && !ctx.selectedCanvasTextId) return;
  ctx.onCanvasTextTransforming?.(true);
  const ae = document.activeElement;
  if (ae instanceof HTMLElement && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) {
    ae.blur();
  }
};

/** Select-tool drag on the structure is a 2D translate. Orbit is the Perspective tool (or Alt+drag). */
const startStructureDrag = (ctx: InteractionContext, worldPos: Point): void => {
  hideTextOverlayIfSelected(ctx);
  ctx.setDragAction({
    type: 'move_selection',
    startX: worldPos.x,
    startY: worldPos.y,
    currentX: worldPos.x,
    currentY: worldPos.y,
  });
};

/** Reagent “+” chips must beat the selection translate box / click-outside clear. */
const handleReactionArrowReagentSlotDown = (ctx: InteractionContext): boolean => {
  const { worldPos, molecule } = ctx;
  if (!ctx.selectedReactionArrowId || !ctx.onRequestArrowReagentEdit) return false;
  const selArrow = molecule.reactionArrows?.find(a => a.id === ctx.selectedReactionArrowId);
  if (!selArrow || !reactionArrowSupportsReagentLabels(selArrow.kind)) return false;
  const zoom = ctx.viewport?.zoom ?? 1;
  const slotHit = pickReactionArrowReagentSlot(
    selArrow,
    worldPos.x,
    worldPos.y,
    reagentSlotChipHitTolWorld(zoom),
  );
  if (!slotHit) return false;
  ctx.setSelectedReactionArrowId(selArrow.id);
  ctx.setSelectedCanvasTextId?.(null);
  ctx.setColorEditCanvasShapeId?.(null);
  ctx.setSelectedCanvasImageId?.(null);
  ctx.setSelectedSruBracketId?.(null);
  ctx.setSelectedAtomIds?.([]);
  ctx.setSelectedBondIds?.([]);
  ctx.onRequestArrowReagentEdit(selArrow.id, slotHit.slot);
  return true;
};

/**
 * Tail / head / curve handle hit → resize_reaction_arrow.
 * When `handlesOnly`, shaft hits are ignored (exclusive arrow still uses the
 * selection box to translate). Reagent “+” chips are treated as handles.
 */
const handleReactionArrowPointerDown = (
  ctx: InteractionContext,
  opts?: { handlesOnly?: boolean },
): boolean => {
  const { worldPos, molecule } = ctx;
  if (!ctx.setSelectedReactionArrowId || !ctx.onUpdateReactionArrow) return false;

  const arrows = arrowsForHitTest(molecule);
  const zoom = ctx.viewport?.zoom ?? 1;
  const handleTol = arrowHandleHitTolWorld(zoom);

  const epHit = pickReactionArrowEndpoint(arrows, worldPos.x, worldPos.y, handleTol);
  if (epHit) {
    const hitArrow = arrows.find(a => a.id === epHit.arrowId);
    if (hitArrow) {
      ctx.setSelectedReactionArrowId(hitArrow.id);
      ctx.setSelectedCanvasTextId?.(null);
      ctx.setColorEditCanvasShapeId?.(null);
      ctx.setSelectedCanvasImageId?.(null);
      ctx.setSelectedSruBracketId?.(null);
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

  const curveHit = pickReactionArrowCurveHandle(arrows, worldPos.x, worldPos.y, handleTol);
  if (curveHit) {
    const hitArrow = arrows.find(a => a.id === curveHit.arrowId);
    if (hitArrow) {
      ctx.setSelectedReactionArrowId(hitArrow.id);
      ctx.setSelectedCanvasTextId?.(null);
      ctx.setColorEditCanvasShapeId?.(null);
      ctx.setSelectedCanvasImageId?.(null);
      ctx.setSelectedSruBracketId?.(null);
      ctx.setSelectedAtomIds?.([]);
      ctx.setSelectedBondIds?.([]);
      ctx.setDragAction({
        type: 'resize_reaction_arrow',
        arrowId: hitArrow.id,
        endpoint: curveHit.end,
        vertexIndex: curveHit.vertexIndex,
        startX: worldPos.x,
        startY: worldPos.y,
        currentX: worldPos.x,
        currentY: worldPos.y,
        origArrow: { ...hitArrow },
      });
      return true;
    }
  }

  if (handleReactionArrowReagentSlotDown(ctx)) return true;

  if (opts?.handlesOnly) return false;

  const hitArrow = pickReactionArrowAt(arrows, worldPos.x, worldPos.y, handleTol);
  if (hitArrow) {
    ctx.setSelectedReactionArrowId(hitArrow.id);
    ctx.setSelectedCanvasTextId?.(null);
    ctx.setColorEditCanvasShapeId?.(null);
    ctx.setSelectedCanvasImageId?.(null);
    ctx.setColorEditStrokeId?.(null);
    ctx.setSelectedSruBracketId?.(null);
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

  return false;
};

/**
 * Select / lasso-select tool — ChemDraw-style individual atoms and bonds.
 *
 * Pointer-down branches (priority order):
 *   1. Existing selection: rotate / scale / move handles.
 *   2. Existing selection: click inside the box (any object) → move all together.
 *   3. Sole image/text/shape/arrow: per-object rotate / resize / curve handles.
 *   4. Hit on canvas text / image / shape / stroke / orbital / arrow.
 *   5. Hit on atom / bond / ring fill (atom disk + implicit H wins over bond).
 *   6. Empty canvas → clear and start marquee or lasso.
 *
 * Whole connected molecules: Select menu → “Select connected”, or context menu
 * “Select connected fragment”, or marquee/lasso. Shift+click adds/toggles.
 */
export const selectToolMouseDown = (ctx: InteractionContext): boolean => {
  const { e, worldPos, molecule, activeTool, selectedAtomIds, selectedBondIds = [] } = ctx;
  if (e.button !== 0) return false;
  if (!isSelectTool(activeTool)) return false;

  const transformAtomIds = expandForGroupedMove(
    molecule,
    atomIdsForSelectionTransform(molecule, selectedAtomIds, selectedBondIds),
  );
  const marqueeBounds: MarqueeSelectionBoundsInput = {
    atomIds: transformAtomIds,
    reactionArrowIds: ctx.selectedReactionArrowIds ?? [],
    strokeIds: ctx.selectedStrokeIds ?? [],
    canvasTextIds: ctx.selectedCanvasTextIds ?? [],
    canvasShapeIds: ctx.selectedCanvasShapeIds ?? [],
    canvasImageIds: ctx.selectedCanvasImageIds ?? [],
  };
  const canvasCtx = ctx.getCanvasContext();
  const hasSelection = hasMarqueeSelectionContent(marqueeBounds);
  const canMoveMarquee = !!(ctx.onTranslateMarqueeSelection || ctx.onMoveAtoms);

  const exclusiveImage = isExclusiveKind(marqueeBounds, transformAtomIds.length, 'canvasImageIds');
  const exclusiveText = isExclusiveKind(marqueeBounds, transformAtomIds.length, 'canvasTextIds');
  const exclusiveShape = isExclusiveKind(marqueeBounds, transformAtomIds.length, 'canvasShapeIds');
  const exclusiveArrow = isExclusiveKind(marqueeBounds, transformAtomIds.length, 'reactionArrowIds');
  if (hasSelection) {
    if (exclusiveImage && handleCanvasImagePointerDown(ctx, { handlesOnly: true })) return true;
    if (exclusiveText && handleCanvasTextPointerDown(ctx, { handlesOnly: true })) return true;
    if (exclusiveShape && handleCanvasShapePointerDown(ctx, { handlesOnly: true })) return true;
    // Curly-arrow tail / mid / head must win over the selection translate box.
    if (exclusiveArrow && handleReactionArrowPointerDown(ctx, { handlesOnly: true })) return true;
  }

  // Plus chips sit in/near the box; they must not start a translate or deselect.
  if (handleReactionArrowReagentSlotDown(ctx)) return true;

  if (
    transformAtomIds.length > 0 &&
    ctx.onRotateSelectionCommit &&
    isNearTransformRotateHandle(
      worldPos.x,
      worldPos.y,
      molecule,
      transformAtomIds,
      marqueeBounds,
      canvasCtx,
    )
  ) {
    if (transformAtomIds.length !== selectedAtomIds.length) {
      ctx.setSelectedAtomIds?.(transformAtomIds);
      ctx.setSelectedBondIds?.(bondsFullyInAtomSet(molecule, transformAtomIds));
    }
    const cen = getSelectionCentroid(molecule, transformAtomIds);
    if (cen) {
      hideTextOverlayIfSelected(ctx);
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

  const insideBox = isInsideSelectionTransformBox(
    worldPos.x,
    worldPos.y,
    molecule,
    transformAtomIds,
    marqueeBounds,
    canvasCtx,
  );
  if (hasSelection && canMoveMarquee && insideBox) {
    if (exclusiveText) {
      const textId = marqueeBounds.canvasTextIds?.[0];
      const picked = textId ? molecule.canvasTexts?.find(t => t.id === textId) : undefined;
      if (picked) {
        beginCanvasTextMove(ctx, picked);
        return true;
      }
    }
    startStructureDrag(ctx, worldPos);
    return true;
  }

  if (handleCanvasTextPointerDown(ctx)) return true;
  if (handleCanvasImagePointerDown(ctx)) return true;
  if (handleCanvasShapePointerDown(ctx)) return true;
  if (handleStrokePointerDown(ctx)) return true;
  if (handleCanvasOrbitalPointerDown(ctx)) return true;

  const sruHit = pickSruBracketAt(molecule.sruBrackets, worldPos.x, worldPos.y);
  if (sruHit && (ctx.setSelectedSruBracketId || ctx.setSelectedAtomIds)) {
    const already = ctx.selectedSruBracketId === sruHit.bracket.id;
    ctx.setSelectedSruBracketId?.(sruHit.bracket.id);
    ctx.setSelectedCanvasTextId?.(null);
    ctx.setColorEditCanvasShapeId?.(null);
    ctx.setSelectedCanvasImageId?.(null);
    ctx.setSelectedReactionArrowId?.(null);
    ctx.setSelectedBondIds?.([]);
    ctx.setSelectedAtomIds?.(sruHit.bracket.atomIds);
    if (sruHit.onLabel) {
      if (already) ctx.onEditSruBracketSubscript?.(sruHit.bracket.id);
      return true;
    }
    if (ctx.onMoveAtoms) {
      ctx.setDragAction({
        type: 'move_selection',
        startX: worldPos.x,
        startY: worldPos.y,
        currentX: worldPos.x,
        currentY: worldPos.y,
      });
    }
    return true;
  }

  if (handleReactionArrowPointerDown(ctx)) return true;

  // Atoms (disk, label, implicit H) win; mid-shaft still selects the bond.
  const { atom: clickedAtom, bond: clickedBond } = pickAtomOrBondForSelectTool(
    molecule,
    worldPos,
    ctx.hit.atomHitRadius,
    ctx.hit.selectBondTolerance,
  );

  // Formal / δ mark wins over atom/bond so drag never becomes move_selection
  // (that was jumping the whole molecule / Pattern group).
  const chargeHit = pickChargeMarkAt(molecule, worldPos);
  if (chargeHit) {
    const { atom: chargeAtom, kind } = chargeHit;
    ctx.setSelectedCanvasTextId?.(null);
    ctx.setColorEditCanvasShapeId?.(null);
    ctx.setSelectedReactionArrowId?.(null);
    ctx.setSelectedCanvasImageId?.(null);
    ctx.setSelectedSruBracketId?.(null);
    ctx.setSelectedBondIds?.([]);
    // Do not put the parent atom in the move selection — only the mark moves.
    ctx.setSelectedAtomIds?.([]);
    ctx.setSelectedChargeAtomIds?.([chargeAtom.id]);
    ctx.setSelectedChargeMarkKind?.(kind);
    const orig =
      kind === 'formal'
        ? chargeAtom.chargeOffset
        : chargeAtom.deltaChargeOffset;
    ctx.setDragAction({
      type: 'move_charge_mark',
      atomId: chargeAtom.id,
      kind,
      startX: worldPos.x,
      startY: worldPos.y,
      currentX: worldPos.x,
      currentY: worldPos.y,
      // Stored / zero; live preview orbits from atom center via pointer.
      origOffsetX: orig?.x ?? 0,
      origOffsetY: orig?.y ?? 0,
      seatAnchorX: chargeAtom.x,
      seatAnchorY: chargeAtom.y,
      placeDragThreshold: 1.5,
    });
    return true;
  }
  ctx.setSelectedChargeAtomIds?.([]);
  ctx.setSelectedChargeMarkKind?.(null);

  if (clickedAtom?.id) {
    ctx.setSelectedCanvasTextId?.(null);
    ctx.setColorEditCanvasShapeId?.(null);
    ctx.setSelectedReactionArrowId?.(null);
    ctx.setSelectedCanvasImageId?.(null);
    ctx.setSelectedSruBracketId?.(null);
    if (ctx.setSelectedAtomIds) {
      // Fragment tool or Ctrl/⌘+click: select the entire connected molecule.
      if (activeTool === 'fragment_select' || ((e.ctrlKey || e.metaKey) && !e.shiftKey)) {
        const atomIds = expandForGroupedMove(
          molecule,
          expandAtomIdsToConnectedFragments(molecule, [clickedAtom.id]),
        );
        const next = e.shiftKey ? mergeIdLists(selectedAtomIds, atomIds) : atomIds;
        ctx.setSelectedAtomIds(next);
        ctx.setSelectedBondIds?.(bondsFullyInAtomSet(molecule, next));
      } else if (e.shiftKey) {
        const merged = new Set(selectedAtomIds);
        if (merged.has(clickedAtom.id)) merged.delete(clickedAtom.id);
        else merged.add(clickedAtom.id);
        ctx.setSelectedAtomIds([...merged]);
        ctx.setSelectedBondIds?.([]);
      } else if (selectedAtomIds.includes(clickedAtom.id) && selectedBondIds.length === 0) {
        // Already in the selection → expand Pattern/Group peers, then drag.
        const atomIds = expandForGroupedMove(molecule, selectedAtomIds);
        if (atomIds.length !== selectedAtomIds.length) {
          ctx.setSelectedAtomIds(atomIds);
          ctx.setSelectedBondIds?.(bondsFullyInAtomSet(molecule, atomIds));
        }
      } else {
        // Fresh click: atom, or whole Pattern/Group collection if grouped.
        const atomIds = expandForGroupedMove(molecule, [clickedAtom.id]);
        ctx.setSelectedAtomIds(atomIds);
        ctx.setSelectedBondIds?.(
          atomIds.length > 1 ? bondsFullyInAtomSet(molecule, atomIds) : [],
        );
      }
    }
    startStructureDrag(ctx, worldPos);
    return true;
  }

  if (clickedBond) {
    ctx.setSelectedCanvasTextId?.(null);
    ctx.setColorEditCanvasShapeId?.(null);
    ctx.setSelectedReactionArrowId?.(null);
    ctx.setSelectedSruBracketId?.(null);
    // Fragment tool or Ctrl/⌘+click: select the entire connected molecule containing this bond.
    if (activeTool === 'fragment_select' || ((e.ctrlKey || e.metaKey) && !e.shiftKey)) {
      const atomIds = expandForGroupedMove(
        molecule,
        expandAtomIdsToConnectedFragments(molecule, [
          clickedBond.fromAtomId,
          clickedBond.toAtomId,
        ]),
      );
      const next = e.shiftKey ? mergeIdLists(selectedAtomIds, atomIds) : atomIds;
      ctx.setSelectedAtomIds?.(next);
      ctx.setSelectedBondIds?.(bondsFullyInAtomSet(molecule, next));
    } else if (e.shiftKey) {
      const merged = new Set(selectedBondIds);
      if (merged.has(clickedBond.id)) merged.delete(clickedBond.id);
      else merged.add(clickedBond.id);
      ctx.setSelectedBondIds?.([...merged]);
    } else if (selectedBondIds.includes(clickedBond.id)) {
      const base = new Set([
        clickedBond.fromAtomId,
        clickedBond.toAtomId,
        ...selectedAtomIds,
      ]);
      const atomIds = expandForGroupedMove(molecule, [...base]);
      // Only widen when a Pattern/Group actually expands the set. A plain
      // re-click keeps the bond-only selection so Delete removes just the bond.
      if (atomIds.length > base.size) {
        ctx.setSelectedAtomIds?.(atomIds);
        ctx.setSelectedBondIds?.(bondsFullyInAtomSet(molecule, atomIds));
      }
    } else {
      // Fresh bond click: whole Pattern/Group if grouped; otherwise the bond
      // only. Endpoints stay out of the atom selection so Delete removes just
      // the bond (atoms keep their positions and implicit-H/valency readjust);
      // dragging still moves both endpoints via atomIdsForSelectionTransform.
      const atomIds = expandForGroupedMove(molecule, [
        clickedBond.fromAtomId,
        clickedBond.toAtomId,
      ]);
      if (atomIds.length > 2) {
        ctx.setSelectedAtomIds?.(atomIds);
        ctx.setSelectedBondIds?.(bondsFullyInAtomSet(molecule, atomIds));
      } else {
        ctx.setSelectedAtomIds?.([]);
        ctx.setSelectedBondIds?.([clickedBond.id]);
      }
    }
    startStructureDrag(ctx, worldPos);
    return true;
  }

  // Ring interior (e.g. benzene hole) — select that ring only (not whole molecule).
  const ringAtPoint = findSmallestRingAtPoint(molecule, worldPos.x, worldPos.y);
  if (ringAtPoint && ringAtPoint.length > 0) {
    ctx.setSelectedCanvasTextId?.(null);
    ctx.setColorEditCanvasShapeId?.(null);
    ctx.setSelectedReactionArrowId?.(null);
    ctx.setSelectedSruBracketId?.(null);
    const ringAlreadySelected = ringAtPoint.every(id => selectedAtomIds.includes(id));
    if (e.shiftKey) {
      const merged = new Set(selectedAtomIds);
      for (const id of ringAtPoint) merged.add(id);
      ctx.setSelectedAtomIds?.([...merged]);
      ctx.setSelectedBondIds?.([]);
    } else if (ringAlreadySelected && selectedBondIds.length === 0) {
      // Ring belongs to current selection → keep and drag.
    } else {
      ctx.setSelectedAtomIds?.(ringAtPoint);
      ctx.setSelectedBondIds?.([]);
    }
    startStructureDrag(ctx, worldPos);
    return true;
  }

  // Empty canvas — marquee / lasso.
  clearMarqueeSelection(ctx);
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

/**
 * Read-only: would select/lasso hit a drawable target (not empty-canvas marquee)?
 * Used so touch on empty canvas can pan instead of starting a selection box.
 */
export function selectToolHasTargetAt(ctx: InteractionContext): boolean {
  const { worldPos, molecule, selectedAtomIds, selectedBondIds = [] } = ctx;
  const canvasCtx = ctx.getCanvasContext();
  const texts = molecule.canvasTexts ?? [];
  if (canvasCtx && texts.length > 0 && pickCanvasTextAt(canvasCtx, texts, worldPos.x, worldPos.y)) {
    return true;
  }
  const images = molecule.canvasImages ?? [];
  if (images.length > 0 && pickCanvasImageAt(images, worldPos.x, worldPos.y)) {
    return true;
  }
  const shapes = molecule.canvasShapes ?? [];
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (hitCanvasShapeTransformed(shapes[i]!, worldPos.x, worldPos.y)) return true;
  }
  if (pickSruBracketAt(molecule.sruBrackets, worldPos.x, worldPos.y)) return true;
  const arrows = arrowsForHitTest(molecule);
  const zoom = ctx.viewport?.zoom ?? 1;
  const handleTol = arrowHandleHitTolWorld(zoom);
  if (pickReactionArrowEndpoint(arrows, worldPos.x, worldPos.y, handleTol)) return true;
  if (pickReactionArrowCurveHandle(arrows, worldPos.x, worldPos.y, handleTol)) return true;
  if (ctx.selectedReactionArrowId) {
    const selArrow = molecule.reactionArrows?.find(a => a.id === ctx.selectedReactionArrowId);
    if (pickReactionArrowReagentSlot(selArrow, worldPos.x, worldPos.y, reagentSlotChipHitTolWorld(zoom))) {
      return true;
    }
  }
  if (pickReactionArrowAt(arrows, worldPos.x, worldPos.y, handleTol)) return true;
  if (pickStrokeAt(molecule, worldPos.x, worldPos.y)) return true;
  if (pickCanvasOrbitalAt(molecule, worldPos.x, worldPos.y)) return true;

  const transformAtomIds = atomIdsForSelectionTransform(molecule, selectedAtomIds, selectedBondIds);
  const marqueeBounds: MarqueeSelectionBoundsInput = {
    atomIds: transformAtomIds,
    reactionArrowIds: ctx.selectedReactionArrowIds ?? [],
    strokeIds: ctx.selectedStrokeIds ?? [],
    canvasTextIds: ctx.selectedCanvasTextIds ?? [],
    canvasShapeIds: ctx.selectedCanvasShapeIds ?? [],
    canvasImageIds: ctx.selectedCanvasImageIds ?? [],
  };
  if (hasMarqueeSelectionContent(marqueeBounds)) {
    if (
      isNearTransformRotateHandle(
        worldPos.x,
        worldPos.y,
        molecule,
        transformAtomIds,
        marqueeBounds,
        canvasCtx,
      )
    ) {
      return true;
    }
    if (
      isInsideSelectionTransformBox(
        worldPos.x,
        worldPos.y,
        molecule,
        transformAtomIds,
        marqueeBounds,
        canvasCtx,
      )
    ) {
      return true;
    }
  }

  const { atom, bond } = pickAtomOrBondForSelectTool(
    molecule,
    worldPos,
    ctx.hit.atomHitRadius,
    ctx.hit.selectBondTolerance,
  );
  if (atom?.id || bond) return true;

  const ringAtPoint = findSmallestRingAtPoint(molecule, worldPos.x, worldPos.y);
  return !!(ringAtPoint && ringAtPoint.length > 0);
}

const LASSO_POINT_SPACING = 2.5;

/**
 * In-flight `dragAction` updates for pointer-move. Returns `true` if a drag
 * action was active and consumed the event; otherwise the caller should fall
 * through to tool-specific move handlers.
 */
export const updateActiveDragAction = (ctx: InteractionContext): boolean => {
  const { dragAction, worldPos } = ctx;
  if (!dragAction) return false;

  // Perspective orbit lives in dragAction; stream live pose to the right 3D viewer.
  // 2D move/rotate/scale of the drawing must not stream — that reloads 3D every frame.
  if (dragAction.type === 'rotate_perspective') {
    ctx.setDragAction({
      ...dragAction,
      currentX: worldPos.x,
      currentY: worldPos.y,
    });
    if (ctx.onPerspectivePosePreview && ctx.molecule.perspective3D) {
      const dAngleY = (worldPos.x - dragAction.startX) * PERSPECTIVE_RAD_PER_PX;
      const dAngleX = (worldPos.y - dragAction.startY) * PERSPECTIVE_RAD_PER_PX;
      const mb = molblock3DFromPerspectivePose(
        rotate3DPose(ctx.molecule, dAngleX, dAngleY),
      );
      if (mb) ctx.onPerspectivePosePreview(mb);
    }
    return true;
  }

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
  } else if (dragAction.type === 'scale_selection') {
    ctx.setDragAction(prev => {
      if (!prev || prev.type !== 'scale_selection') return prev;
      const { factorX, factorY } = scaleFactorsForBoxHandle(
        prev.handle,
        prev.anchorX,
        prev.anchorY,
        prev.startPointerX,
        prev.startPointerY,
        worldPos.x,
        worldPos.y,
      );
      return { ...prev, currentFactorX: factorX, currentFactorY: factorY };
    });
  } else if (dragAction.type === 'rotate_canvas_image') {
    ctx.setDragAction(prev => {
      if (!prev || prev.type !== 'rotate_canvas_image') return prev;
      const ang = Math.atan2(worldPos.y - prev.cy, worldPos.x - prev.cx);
      return { ...prev, currentX: worldPos.x, currentY: worldPos.y, currentPointerAngle: ang };
    });
  } else if (dragAction.type === 'rotate_canvas_shape') {
    ctx.setDragAction(prev => {
      if (!prev || prev.type !== 'rotate_canvas_shape') return prev;
      const ang = Math.atan2(worldPos.y - prev.cy, worldPos.x - prev.cx);
      return { ...prev, currentX: worldPos.x, currentY: worldPos.y, currentPointerAngle: ang };
    });
  } else if (dragAction.type === 'rotate_canvas_text') {
    ctx.setDragAction(prev => {
      if (!prev || prev.type !== 'rotate_canvas_text') return prev;
      const ang = Math.atan2(worldPos.y - prev.cy, worldPos.x - prev.cx);
      return { ...prev, currentX: worldPos.x, currentY: worldPos.y, currentPointerAngle: ang };
    });
  } else if (dragAction.type === 'rotate_canvas_orbital') {
    ctx.setDragAction(prev => {
      if (!prev || prev.type !== 'rotate_canvas_orbital') return prev;
      const ang = Math.atan2(worldPos.y - prev.cy, worldPos.x - prev.cx);
      return { ...prev, currentX: worldPos.x, currentY: worldPos.y, currentPointerAngle: ang };
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
      if (prev.type === 'move_selection' && !ctx.e.shiftKey) {
        const moveIds = atomIdsForSelectionTransform(
          ctx.molecule,
          ctx.selectedAtomIds,
          ctx.selectedBondIds ?? [],
        );
        const snapped = snapSelectionMovePointer(
          ctx.molecule,
          moveIds,
          prev.startX,
          prev.startY,
          worldPos.x,
          worldPos.y,
          ARROW_ENDPOINT_AXIS_SNAP_WORLD,
          {
            snapToGrid: ctx.snapToGrid === true,
            gridSize: ctx.gridSizePx,
            disableAlignSnap: false,
          },
        );
        return { ...prev, currentX: snapped.wx, currentY: snapped.wy };
      }
      if (prev.type === 'move_reaction_arrow' && !ctx.e.shiftKey) {
        const snapped = snapReactionArrowMovePointer(
          ctx.molecule,
          prev.origArrow,
          prev.startX,
          prev.startY,
          worldPos.x,
          worldPos.y,
          ARROW_ENDPOINT_AXIS_SNAP_WORLD,
          {
            snapToGrid: ctx.snapToGrid === true,
            gridSize: ctx.gridSizePx,
            disableAlignSnap: false,
          },
        );
        return { ...prev, currentX: snapped.wx, currentY: snapped.wy };
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

  const moveAtomIds = expandForGroupedMove(
    molecule,
    atomIdsForSelectionTransform(molecule, selectedAtomIds, selectedBondIds),
  );

  if (dragAction.type === 'move_selection' && (ctx.onTranslateMarqueeSelection || ctx.onMoveAtoms)) {
    const dx = dragAction.currentX - dragAction.startX;
    const dy = dragAction.currentY - dragAction.startY;
    if (Math.hypot(dx, dy) > 1) {
      const atomIds = moveAtomIds;
      if (ctx.onTranslateMarqueeSelection) {
        ctx.onTranslateMarqueeSelection({
          atomIds,
          arrowIds: ctx.selectedReactionArrowIds ?? [],
          strokeIds: ctx.selectedStrokeIds ?? [],
          textIds: ctx.selectedCanvasTextIds ?? [],
          shapeIds: ctx.selectedCanvasShapeIds ?? [],
          imageIds: ctx.selectedCanvasImageIds ?? [],
          dx,
          dy,
        });
      } else if (ctx.onMoveAtoms && atomIds.length > 0) {
        ctx.onMoveAtoms(atomIds, dx, dy);
      }
    }
    ctx.onCanvasTextTransforming?.(false);
  } else if (dragAction.type === 'rotate_selection' && ctx.onRotateSelectionCommit) {
    const d = shortestAngleDiff(dragAction.startPointerAngle, dragAction.currentPointerAngle);
    if (Math.abs(d) > 1e-6 && moveAtomIds.length > 0) {
      ctx.onRotateSelectionCommit(moveAtomIds, dragAction.cx, dragAction.cy, d);
    }
    ctx.onCanvasTextTransforming?.(false);
  } else if (dragAction.type === 'scale_selection' && ctx.onScaleSelectionCommit) {
    const { currentFactorX: fx, currentFactorY: fy, anchorX, anchorY } = dragAction;
    if (
      moveAtomIds.length > 0 &&
      (Math.abs(fx - 1) > 1e-4 || Math.abs(fy - 1) > 1e-4)
    ) {
      ctx.onScaleSelectionCommit(moveAtomIds, anchorX, anchorY, fx, fy);
    }
    ctx.onCanvasTextTransforming?.(false);
  } else if (dragAction.type === 'box_select' && ctx.setSelectedAtomIds) {
    const boxW = Math.abs(dragAction.currentX - dragAction.startX);
    const boxH = Math.abs(dragAction.currentY - dragAction.startY);
    if (boxW > BOX_DRAG_THRESHOLD || boxH > BOX_DRAG_THRESHOLD) {
      const minX = Math.min(dragAction.startX, dragAction.currentX);
      const maxX = Math.max(dragAction.startX, dragAction.currentX);
      const minY = Math.min(dragAction.startY, dragAction.currentY);
      const maxY = Math.max(dragAction.startY, dragAction.currentY);
      const atomsInBox = pickAtomIdsInRect(molecule, minX, minY, maxX, maxY);
      const bondsInBox = bondsFullyInAtomSet(molecule, atomsInBox);
      const ann = collectAnnotationsInRect(
        molecule,
        minX,
        minY,
        maxX,
        maxY,
        ctx.getCanvasContext(),
      );
      const hasAny =
        atomsInBox.length > 0 ||
        bondsInBox.length > 0 ||
        ann.reactionArrowIds.length > 0 ||
        ann.strokeIds.length > 0 ||
        ann.canvasTextIds.length > 0 ||
        ann.canvasShapeIds.length > 0 ||
        ann.canvasImageIds.length > 0;
      if (hasAny) {
        applyMarqueeSelection(ctx, atomsInBox, bondsInBox, ann, ctx.e.shiftKey);
      } else {
        clearMarqueeSelection(ctx);
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
      const ann = collectAnnotationsInPolygon(molecule, loop, ctx.getCanvasContext());
      const hasAny =
        ids.length > 0 ||
        bondIds.length > 0 ||
        ann.reactionArrowIds.length > 0 ||
        ann.strokeIds.length > 0 ||
        ann.canvasTextIds.length > 0 ||
        ann.canvasShapeIds.length > 0 ||
        ann.canvasImageIds.length > 0;
      if (hasAny) {
        applyMarqueeSelection(ctx, ids, bondIds, ann, ctx.e.shiftKey);
      } else {
        clearMarqueeSelection(ctx);
      }
    }
  } else if (dragAction.type === 'move_charge_mark') {
    const dx = dragAction.currentX - dragAction.startX;
    const dy = dragAction.currentY - dragAction.startY;
    const thresh = dragAction.placeDragThreshold ?? 1.5;
    // Click-without-drag: keep default seat. Drag: orbit atom center on the ring.
    if (Math.hypot(dx, dy) > thresh) {
      const atom = molecule.atoms.find(a => a.id === dragAction.atomId);
      const ax = dragAction.seatAnchorX ?? atom?.x ?? 0;
      const ay = dragAction.seatAnchorY ?? atom?.y ?? 0;
      const next = clampChargeMarkOffset(
        dragAction.currentX - ax,
        dragAction.currentY - ay,
      );
      if (dragAction.kind === 'formal') {
        ctx.onSetAtomChargeOffset?.(dragAction.atomId, next);
      } else {
        ctx.onSetAtomDeltaChargeOffset?.(dragAction.atomId, next);
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
    ctx.onCanvasTextTransforming?.(false);
  } else if (dragAction.type === 'resize_canvas_text' || dragAction.type === 'rotate_canvas_text') {
    commitCanvasTextResize(ctx);
    ctx.onCanvasTextTransforming?.(false);
  } else if (
    dragAction.type === 'move_canvas_image' ||
    dragAction.type === 'resize_canvas_image' ||
    dragAction.type === 'rotate_canvas_image'
  ) {
    commitCanvasImageDrag(ctx);
  } else if (
    dragAction.type === 'move_canvas_shape' ||
    dragAction.type === 'resize_canvas_shape' ||
    dragAction.type === 'rotate_canvas_shape'
  ) {
    commitCanvasShapeDrag(ctx);
  } else if (
    dragAction.type === 'move_canvas_orbital' ||
    dragAction.type === 'rotate_canvas_orbital'
  ) {
    commitCanvasOrbitalDrag(ctx);
  } else if (dragAction.type === 'move_canvas_stroke' && ctx.onTranslateStroke) {
    const dx = dragAction.currentX - dragAction.startX;
    const dy = dragAction.currentY - dragAction.startY;
    if (Math.hypot(dx, dy) > 0.5) {
      ctx.onTranslateStroke(dragAction.strokeId, dx, dy);
    }
  } else if (dragAction.type === 'move_reaction_arrow' && ctx.onUpdateReactionArrow) {
    const dx = dragAction.currentX - dragAction.startX;
    const dy = dragAction.currentY - dragAction.startY;
    if (Math.hypot(dx, dy) > 0.5) {
      // Free translate: clear chemistry anchors so resolve does not snap back.
      ctx.onUpdateReactionArrow(dragAction.arrowId, {
        ...offsetReactionArrowForDrag(dragAction.origArrow, dx, dy),
        fromAnchor: null,
        toAnchor: null,
      });
    }
  } else if (dragAction.type === 'resize_reaction_arrow' && ctx.onUpdateReactionArrow) {
    const dx = dragAction.currentX - dragAction.startX;
    const dy = dragAction.currentY - dragAction.startY;
    if (Math.hypot(dx, dy) > 0.25) {
      const basePatch = reactionArrowEndpointResizePatch(
        dragAction.origArrow,
        dragAction.endpoint,
        dx,
        dy,
        { vertexIndex: dragAction.vertexIndex },
      ) as ReactionArrowUpdatePatch;
      if (
        dragAction.endpoint === 'curve' &&
        typeof basePatch.cx === 'number' &&
        typeof basePatch.cy === 'number'
      ) {
        const ox = dragAction.origArrow;
        const x1 = basePatch.x1 ?? ox.x1;
        const y1 = basePatch.y1 ?? ox.y1;
        const x2 = basePatch.x2 ?? ox.x2;
        const y2 = basePatch.y2 ?? ox.y2;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const chordDx = x2 - x1;
        const chordDy = y2 - y1;
        const chordLen = Math.hypot(chordDx, chordDy) || 1;
        const nx = -chordDy / chordLen;
        const ny = chordDx / chordLen;
        const signed = (basePatch.cx - mx) * nx + (basePatch.cy - my) * ny;
        basePatch.bulgeSide = signed >= 0 ? 1 : -1;
        basePatch.curveAmount = Math.min(0.55, Math.max(0.08, Math.abs(signed) / chordLen));
      }
      const isElectronFlow = (dragAction.origArrow.kind ?? 'straight') === 'electron_flow';
      if (isElectronFlow && (dragAction.endpoint === 'tail' || dragAction.endpoint === 'head')) {
        const geom = { ...dragAction.origArrow, ...basePatch };
        const snapPatch = applyElectronFlowEndpointResnap(
          ctx.molecule,
          geom,
          dragAction.endpoint,
        );
        ctx.onUpdateReactionArrow(dragAction.arrowId, { ...basePatch, ...snapPatch });
      } else if (isElectronFlow && dragAction.endpoint === 'curve') {
        // Keep chemistry anchors; curveAmount / bulgeSide drive the arc at draw time.
        ctx.onUpdateReactionArrow(dragAction.arrowId, basePatch);
      } else {
        // Free three-point edit (tail / mid / head): drop anchors so draw-time
        // resolve cannot overwrite the user's handle positions.
        ctx.onUpdateReactionArrow(dragAction.arrowId, {
          ...basePatch,
          fromAnchor: null,
          toAnchor: null,
        });
      }
    }
  } else if (dragAction.type === 'rotate_perspective' && ctx.onRotate3DPoseCommit) {
    const DEG = 0.01;
    const dAngleY = (dragAction.currentX - dragAction.startX) * DEG;
    const dAngleX = (dragAction.currentY - dragAction.startY) * DEG;
    if (Math.abs(dAngleX) > 1e-6 || Math.abs(dAngleY) > 1e-6) {
      ctx.onRotate3DPoseCommit(dAngleX, dAngleY);
    }
  }

  ctx.setDragAction(null);
  return true;
};

/**
 * When a draw/annotate tool is active, click an existing arrow / line / text /
 * image to select it (ChemDraw-style) instead of starting a new draw.
 * Pencil strokes are Select-tool only — never selected from a draw tool.
 */
export const trySelectAnnotationAt = (ctx: InteractionContext): boolean => {
  const { activeTool, worldPos, molecule } = ctx;
  if (isSelectTool(activeTool) || activeTool === 'erase') {
    return false;
  }
  // Pencil / Smart Draw must keep the gesture for a new stroke.
  if (activeTool === 'pencil' || activeTool === 'smart_draw') {
    return false;
  }

  const { atom, bond } = pickAtomOrBondForBondTool(molecule, worldPos, 10, 12);
  if (atom || bond) return false;

  const selectCtx: InteractionContext = { ...ctx, activeTool: 'select' };
  if (handleCanvasTextPointerDown(selectCtx)) return true;
  if (handleCanvasImagePointerDown(selectCtx)) return true;
  if (handleCanvasShapePointerDown(selectCtx)) return true;
  if (handleCanvasOrbitalPointerDown(selectCtx)) return true;

  // Allow editing tail / curve / head while the arrow tool is still active.
  if (handleReactionArrowPointerDown(selectCtx)) {
    ctx.setDrawingReactionArrow(null);
    return true;
  }

  return false;
};
