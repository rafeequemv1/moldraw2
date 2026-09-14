import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import {
  mergeDocumentAtomOpacity,
  projectPerspectiveForDisplay,
  rotate3DPose,
  type ResolvedCanvasPreferences,
} from '@moldraw/core';
import type { Atom, Molecule } from '@moldraw/domain';
import { PERSPECTIVE_RAD_PER_PX } from './interaction/toolPerspective';
import type { Point, Viewport } from './geometry';
import type { PointerDebugInfo } from './touch/types';
import {
  alignmentGuideThresholdWorld,
  applyMarqueeMovePreview,
  atomIdsForSelectionTransform,
  canvasImageWithDragPreview,
  canvasOrbitalWithDragPreview,
  canvasShapeWithDragPreview,
  canvasTextResizePatch,
  canvasTextRotatePatch,
  cullFragmentsToViewport,
  getMoleculeRevisionCache,
  guidesForCanvasTextMove,
  guidesForReactionArrowMove,
  guidesForReactionArrowResize,
  guidesForSelectionMove,
  reactionArrowAfterDelta,
  shortestAngleDiff,
  worldViewportRect,
  type AlignmentGuides,
} from './geometry';
import {
  type RenderContext,
  type StrokeSample,
  CANVAS_IMAGE_LOAD_EVENT,
  drawBondGhost,
  drawReactionArrowGhost,
  drawBondHoverHint,
  drawTouchIndicator,
  drawTouchLoupe,
  drawPointerDebugHud,
  drawAlignmentGuides,
  drawDendrimerGuides,
  drawChainGhost,
  drawCanvasShapeGhost,
  drawErrorAtomMarker,
  drawStereoWarningMarkers,
  drawGrid,
  drawMarquee,
  drawPencilGhost,
  drawRingHoverFill,
  drawRingGhost,
  drawFragmentPlacementGhost,
  drawSelectionFillBehind,
  drawHoverOutlineAndToolHints,
  drawSelectionTransformHandle,
  paintStructureLayers,
} from './render';
import type { FragmentPlacementSession } from '@moldraw/core';
import type {
  DragActionState,
  DrawingBondState,
  DrawingChainState,
  DrawingCanvasShapeState,
  DrawingReactionArrowState,
  DrawingRingState,
  StructureThemeColors,
} from './render/types';
import { DEFAULT_STRUCTURE_THEME } from './render/types';

export interface UseCanvasRendererOptions {
  /** Bottom layer: committed chemistry (bonds, labels, annotations). */
  structureCanvasRef: RefObject<HTMLCanvasElement | null>;
  /** Top layer: selection, hover, ghosts, marquee. */
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  offscreenCanvasRef: RefObject<HTMLCanvasElement | null>;
  viewport: Viewport;
  displayScale: number;
  displayPrefs: ResolvedCanvasPreferences;

  molecule: Molecule;
  showHydrogens: boolean;
  condensedGroupLabels: boolean;
  colorAtomLabels: boolean;
  applyAtomColorsToBonds: boolean;
  structureTheme?: StructureThemeColors;
  structureDrawMode?: 'skeletal' | 'ball-stick';

  activeTool: string;
  isRingTool: boolean;
  numSides: number;
  isBenzene: boolean;
  isBoatTool: boolean;
  isChairTool: boolean;

  selectedAtomIds: string[];
  selectedChargeAtomIds?: string[];
  selectedBondIds?: string[];
  selectedCanvasTextId: string | null;
  selectedCanvasTextIds?: string[];
  selectedReactionArrowId: string | null;
  selectedReactionArrowIds?: string[];
  selectedCanvasImageId?: string | null;
  selectedCanvasImageIds?: string[];
  selectedCanvasShapeId?: string | null;
  selectedCanvasShapeIds?: string[];
  selectedCanvasOrbitalIds?: string[];
  selectedStrokeId?: string | null;
  selectedStrokeIds?: string[];
  selectedSruBracketId?: string | null;
  selectionFragmentRotationRad: number;
  hasRotateCommit: boolean;
  hasScaleCommit: boolean;

  hoveredComponentIds: string[];
  hoveredAtomCircleId: string | null;
  hoveredBondHighlightId: string | null;
  hoverAtomId: string | null;
  hoverBondId: string | null;
  hoverRingAtomIds: string[] | null;
  mouseWorldPos: Point | null;
  touchPointerWorldPos?: Point | null;
  /** Magnifier above the fingertip while drawing on touch (default on). */
  touchLoupe?: boolean;
  /** Developer pointer HUD (null / undefined → hidden). */
  pointerDebugHud?: PointerDebugInfo | null;
  errorAtomId: string | null;

  omitAtomAliasBodyId: string | null;
  omitCanvasTextBodyId: string | null;

  cipAtomLabels?: ReadonlyMap<string, string> | null;
  cipBondLabels?: ReadonlyMap<string, string> | null;
  showCipLabels?: boolean;

  activeColor: string;
  activeThickness: number;
  placementElement: string;

  drawingBond: DrawingBondState | null;
  drawingChain: DrawingChainState | null;
  drawingRing: DrawingRingState | null;
  drawingStroke: StrokeSample[] | null;
  smartDrawSessionStrokes?: { points: Point[] }[];
  drawingReactionArrow: DrawingReactionArrowState | null;
  drawingCanvasShape: DrawingCanvasShapeState | null;
  dragAction: DragActionState | null;
  fragmentPlacement: FragmentPlacementSession | null;
}

type StructurePaintKey = {
  molecule: Molecule;
  zoom: number;
  displayScale: number;
  showHydrogens: boolean;
  condensedGroupLabels: boolean;
  colorAtomLabels: boolean;
  applyAtomColorsToBonds: boolean;
  structureInk: string;
  structureDrawMode: string;
  showCipLabels: boolean;
  prefsKey: string;
  dragKind: string | null;
  selectionFragmentRotationRad: number;
  omitAtomAliasBodyId: string | null;
  omitCanvasTextBodyId: string | null;
  canvasW: number;
  canvasH: number;
  /**
   * Annotation selection is painted into the structure bitmap (arrows, text,
   * strokes, shapes, …). Must invalidate the cache when Select All / marquee
   * selection changes or highlights stay stale while atoms update on overlay.
   */
  annotationSelKey: string;
  atomSelKey: string;
};

const prefsFingerprint = (p: ResolvedCanvasPreferences): string =>
  `${p.bondThicknessPx}|${p.bondSpacingFraction}|${p.bondLengthPx}|${p.stereoWedgeWidthPx}|${p.hashSpacingPx}|${p.elementFontCss}|${p.subFontCss}|${p.showGrid}|${p.gridSizePx}`;

const idsKey = (ids: readonly string[] | undefined): string =>
  ids && ids.length ? ids.slice().sort().join(',') : '';

/** Fingerprint of selection that affects `paintStructureLayers` styling. */
const annotationSelectionFingerprint = (o: UseCanvasRendererOptions): string =>
  [
    idsKey(o.selectedReactionArrowIds),
    o.selectedReactionArrowId ?? '',
    idsKey(o.selectedStrokeIds),
    o.selectedStrokeId ?? '',
    idsKey(o.selectedCanvasTextIds),
    o.selectedCanvasTextId ?? '',
    idsKey(o.selectedCanvasShapeIds),
    o.selectedCanvasShapeId ?? '',
    idsKey(o.selectedCanvasImageIds),
    o.selectedCanvasImageId ?? '',
    idsKey(o.selectedCanvasOrbitalIds),
    o.selectedSruBracketId ?? '',
  ].join('|');


/** Keep the group selection box glued to a lone image / text / shape while it drags. */
const applySoloObjectDragPreview = (mol: Molecule, drag: DragActionState): Molecule => {
  if (
    drag.type === 'move_canvas_image' ||
    drag.type === 'resize_canvas_image' ||
    drag.type === 'rotate_canvas_image'
  ) {
    return {
      ...mol,
      canvasImages: (mol.canvasImages ?? []).map(img => canvasImageWithDragPreview(img, drag)),
    };
  }
  if (
    drag.type === 'move_canvas_shape' ||
    drag.type === 'resize_canvas_shape' ||
    drag.type === 'rotate_canvas_shape'
  ) {
    return {
      ...mol,
      canvasShapes: (mol.canvasShapes ?? []).map(s => canvasShapeWithDragPreview(s, drag)),
    };
  }
  if (drag.type === 'move_canvas_text') {
    const dx = drag.currentX - drag.startX;
    const dy = drag.currentY - drag.startY;
    return {
      ...mol,
      canvasTexts: (mol.canvasTexts ?? []).map(t =>
        t.id === drag.textId ? { ...t, x: drag.origX + dx, y: drag.origY + dy } : t,
      ),
    };
  }
  if (drag.type === 'resize_canvas_text') {
    return {
      ...mol,
      canvasTexts: (mol.canvasTexts ?? []).map(t =>
        t.id === drag.textId
          ? { ...t, ...canvasTextResizePatch(drag.origText, drag.corner, drag.currentX, drag.currentY) }
          : t,
      ),
    };
  }
  if (drag.type === 'rotate_canvas_text') {
    return {
      ...mol,
      canvasTexts: (mol.canvasTexts ?? []).map(t =>
        t.id === drag.textId
          ? {
              ...t,
              ...canvasTextRotatePatch(
                drag.origText,
                drag.startPointerAngle,
                drag.currentPointerAngle,
              ),
            }
          : t,
      ),
    };
  }
  if (drag.type === 'move_reaction_arrow') {
    const dx = drag.currentX - drag.startX;
    const dy = drag.currentY - drag.startY;
    return {
      ...mol,
      reactionArrows: (mol.reactionArrows ?? []).map(a =>
        a.id === drag.arrowId ? reactionArrowAfterDelta(drag.origArrow, dx, dy) : a,
      ),
    };
  }
  if (drag.type === 'move_canvas_stroke') {
    const dx = drag.currentX - drag.startX;
    const dy = drag.currentY - drag.startY;
    return {
      ...mol,
      strokes: (mol.strokes ?? []).map(s =>
        s.id === drag.strokeId
          ? { ...s, points: drag.origPoints.map(p => ({ x: p.x + dx, y: p.y + dy })) }
          : s,
      ),
    };
  }
  if (drag.type === 'move_canvas_orbital' || drag.type === 'rotate_canvas_orbital') {
    return {
      ...mol,
      orbitals: (mol.orbitals ?? []).map(o => canvasOrbitalWithDragPreview(o, drag)),
    };
  }
  return mol;
};

const structureAffectingDrag = (drag: DragActionState | null): string | null => {
  if (!drag) return null;
  if (
    drag.type === 'move_selection' ||
    drag.type === 'rotate_selection' ||
    drag.type === 'scale_selection' ||
    drag.type === 'transform_selection' ||
    drag.type === 'rotate_perspective' ||
    drag.type === 'move_canvas_text' ||
    drag.type === 'move_charge_mark' ||
    drag.type === 'resize_canvas_text' ||
    drag.type === 'rotate_canvas_text' ||
    drag.type === 'move_canvas_image' ||
    drag.type === 'resize_canvas_image' ||
    drag.type === 'rotate_canvas_image' ||
    drag.type === 'move_canvas_shape' ||
    drag.type === 'resize_canvas_shape' ||
    drag.type === 'rotate_canvas_shape' ||
    drag.type === 'move_canvas_orbital' ||
    drag.type === 'rotate_canvas_orbital' ||
    drag.type === 'move_reaction_arrow' ||
    drag.type === 'resize_reaction_arrow'
  ) {
    return drag.type;
  }
  return null;
};

const applyWorldTransform = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  viewport: Viewport,
  displayScale: number,
): number => {
  const effectiveZoom = viewport.zoom * displayScale;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2 + viewport.x, canvas.height / 2 + viewport.y);
  ctx.scale(effectiveZoom, effectiveZoom);
  return effectiveZoom;
};

/**
 * Fill the whole canvas with the background grid *behind* whatever is already
 * painted (structure cache blit included). Using destination-over means pan
 * holes and zoom-out margins get lines instead of blank patches, and molecules
 * stay on top.
 */
const paintBackgroundGrid = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  viewport: Viewport,
  displayScale: number,
  theme: StructureThemeColors,
  showGrid: boolean,
  gridSizePx: number,
): void => {
  if (showGrid === false) return;
  const effectiveZoom = viewport.zoom * displayScale;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-over';
  ctx.translate(canvas.width / 2 + viewport.x, canvas.height / 2 + viewport.y);
  ctx.scale(effectiveZoom, effectiveZoom);
  drawGrid(
    ctx,
    canvas.width,
    canvas.height,
    { ...viewport, zoom: effectiveZoom },
    theme,
    gridSizePx,
  );
  ctx.restore();
};

/**
 * Builds the per-frame `RenderContext` and paints structure + overlay layers.
 * Structure redraws only when chemistry / zoom / display prefs change (or a
 * structure-affecting drag). Pure pan reuses a cached structure bitmap.
 */
export const useCanvasRenderer = (opts: UseCanvasRendererOptions): { render: () => void } => {
  const structureCacheRef = useRef<{
    key: StructurePaintKey;
    canvas: HTMLCanvasElement;
    viewportX: number;
    viewportY: number;
  } | null>(null);

  const buildRendered = useCallback((o: UseCanvasRendererOptions) => {
    const { viewport, displayScale, molecule, selectedAtomIds, selectionFragmentRotationRad } = o;
    const selectedBondIds = o.selectedBondIds ?? [];
    const transformAtomIds = atomIdsForSelectionTransform(
      molecule,
      selectedAtomIds,
      selectedBondIds,
    );
    const transformAtomSet = new Set(transformAtomIds);
    const { dragAction } = o;

    let dragDx = 0;
    let dragDy = 0;
    if (dragAction?.type === 'move_selection') {
      dragDx = dragAction.currentX - dragAction.startX;
      dragDy = dragAction.currentY - dragAction.startY;
    }

    let rotatePreviewDelta = 0;
    if (dragAction?.type === 'rotate_selection') {
      rotatePreviewDelta = shortestAngleDiff(
        dragAction.startPointerAngle,
        dragAction.currentPointerAngle,
      );
    } else if (dragAction?.type === 'transform_selection') {
      rotatePreviewDelta = dragAction.deltaRad;
    }
    const labelCounterRad = selectionFragmentRotationRad + rotatePreviewDelta;

    let perspectiveSource: Molecule = molecule;
    if (dragAction?.type === 'rotate_perspective' && molecule.perspective3D) {
      const dAngleY = (dragAction.currentX - dragAction.startX) * PERSPECTIVE_RAD_PER_PX;
      const dAngleX = (dragAction.currentY - dragAction.startY) * PERSPECTIVE_RAD_PER_PX;
      perspectiveSource = rotate3DPose(molecule, dAngleX, dAngleY);
    }
    const { molecule: projected, opacityByAtomId: perspectiveOpacity } =
      projectPerspectiveForDisplay(perspectiveSource);
    const opacityByAtomId = mergeDocumentAtomOpacity(perspectiveSource, perspectiveOpacity);

    const renderedAtoms = projected.atoms.map(a => {
      if (dragAction?.type === 'rotate_selection' && transformAtomSet.has(a.id)) {
        const p = dragAction.snap[a.id];
        if (!p) return a;
        const c = Math.cos(rotatePreviewDelta);
        const s = Math.sin(rotatePreviewDelta);
        const x = p.x - dragAction.cx;
        const y = p.y - dragAction.cy;
        return { ...a, x: dragAction.cx + c * x - s * y, y: dragAction.cy + s * x + c * y };
      }
      if (dragAction?.type === 'scale_selection' && transformAtomSet.has(a.id)) {
        const p = dragAction.snap[a.id];
        if (!p) return a;
        const f = dragAction.currentFactor;
        return {
          ...a,
          x: dragAction.cx + (p.x - dragAction.cx) * f,
          y: dragAction.cy + (p.y - dragAction.cy) * f,
        };
      }
      if (dragAction?.type === 'move_selection' && transformAtomSet.has(a.id)) {
        return { ...a, x: a.x + dragDx, y: a.y + dragDy };
      }
      if (dragAction?.type === 'transform_selection' && transformAtomSet.has(a.id)) {
        const p = dragAction.snap[a.id];
        if (!p) return a;
        const c = Math.cos(dragAction.deltaRad);
        const s = Math.sin(dragAction.deltaRad);
        const f = dragAction.factor;
        const x = (p.x - dragAction.cx) * f;
        const y = (p.y - dragAction.cy) * f;
        return {
          ...a,
          x: dragAction.cx + c * x - s * y + dragAction.dx,
          y: dragAction.cy + s * x + c * y + dragAction.dy,
        };
      }
      return a;
    });
    let renderedMolecule: Molecule = { ...projected, atoms: renderedAtoms };
    if (dragAction?.type === 'move_selection' && (dragDx !== 0 || dragDy !== 0)) {
      renderedMolecule = applyMarqueeMovePreview(
        renderedMolecule,
        {
          reactionArrowIds: o.selectedReactionArrowIds ?? [],
          strokeIds: o.selectedStrokeIds ?? [],
          canvasTextIds: o.selectedCanvasTextIds ?? [],
          canvasShapeIds: o.selectedCanvasShapeIds ?? [],
          canvasImageIds: o.selectedCanvasImageIds ?? [],
        },
        dragDx,
        dragDy,
      );
    } else if (dragAction) {
      renderedMolecule = applySoloObjectDragPreview(renderedMolecule, dragAction);
    }

    const topologyCache = getMoleculeRevisionCache(molecule);
    // Position-sensitive maps: a 2D translation keeps topology — only offset
    // ring centroids. Rotate/scale/perspective still need a full rebuild.
    const dragging = structureAffectingDrag(dragAction) != null;
    const translating =
      dragAction?.type === 'move_selection' && (dragDx !== 0 || dragDy !== 0);
    let atomById: Map<string, Atom>;
    let ringCenterByBondId = topologyCache.ringCenterByBondId;
    let ringAtomIdsByBondId = topologyCache.ringAtomIdsByBondId;
    let stereoWarningAtomIds = topologyCache.stereoWarningAtomIds;
    let valencyMap = topologyCache.valencyMap;
    if (translating) {
      atomById = new Map(renderedAtoms.map(a => [a.id, a]));
      const shifted = new Map<string, { x: number; y: number }>();
      for (const [bondId, c] of topologyCache.ringCenterByBondId) {
        const bond = topologyCache.bondById.get(bondId);
        const moved =
          !!bond &&
          (transformAtomSet.has(bond.fromAtomId) || transformAtomSet.has(bond.toAtomId));
        shifted.set(bondId, moved ? { x: c.x + dragDx, y: c.y + dragDy } : c);
      }
      ringCenterByBondId = shifted;
    } else if (dragging) {
      const renderedCache = getMoleculeRevisionCache(renderedMolecule);
      atomById = renderedCache.atomById;
      ringCenterByBondId = renderedCache.ringCenterByBondId;
      ringAtomIdsByBondId = renderedCache.ringAtomIdsByBondId;
      stereoWarningAtomIds = renderedCache.stereoWarningAtomIds;
      valencyMap = renderedCache.valencyMap;
    } else {
      atomById = new Map(
        renderedAtoms.map(a => {
          const base = topologyCache.atomById.get(a.id);
          return [a.id, base && base.x === a.x && base.y === a.y ? base : a] as const;
        }),
      );
    }

    const structureCanvas = o.structureCanvasRef.current;
    // Viewport culling during drag would rebuild fragment AABBs every frame.
    const cull =
      structureCanvas && renderedMolecule.atoms.length > 40 && !dragging
        ? cullFragmentsToViewport(
            renderedMolecule,
            topologyCache.fragmentBoxes,
            topologyCache.atomToFragmentIndex,
            worldViewportRect(
              structureCanvas.width,
              structureCanvas.height,
              viewport,
              displayScale,
            ),
          )
        : null;

    const effectiveZoom = viewport.zoom * displayScale;

    const applyLabelUpright = (atomId: string, draw: () => void) => {
      const canvas = o.structureCanvasRef.current ?? o.overlayCanvasRef.current;
      if (!canvas) {
        draw();
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        draw();
        return;
      }
      if (!selectedAtomIds.includes(atomId) || Math.abs(labelCounterRad) < 1e-5) {
        draw();
        return;
      }
      const at = atomById.get(atomId);
      if (!at) {
        draw();
        return;
      }
      ctx.save();
      ctx.translate(at.x, at.y);
      ctx.rotate(-labelCounterRad);
      ctx.translate(-at.x, -at.y);
      draw();
      ctx.restore();
    };

    const R: RenderContext = {
      molecule,
      renderedMolecule,
      atomOpacityById: opacityByAtomId,
      valencyMap,
      atomById,
      bondById: topologyCache.bondById,
      ringCenterByBondId,
      ringAtomIdsByBondId,
      visibleAtomIds: cull && !cull.allVisible ? cull.visibleAtomIds : null,
      visibleBondIds: cull && !cull.allVisible ? cull.visibleBondIds : null,
      lodSkipLabels: false,
      viewport,
      displayScale,
      displayPrefs: o.displayPrefs,
      activeTool: o.activeTool,
      isRingTool: o.isRingTool,
      numSides: o.numSides,
      isBenzene: o.isBenzene,
      isBoatTool: o.isBoatTool,
      isChairTool: o.isChairTool,
      selectedAtomIds,
      selectedChargeAtomIds: o.selectedChargeAtomIds ?? [],
      selectedBondIds,
      selectedCanvasTextId: o.selectedCanvasTextId,
      selectedReactionArrowId: o.selectedReactionArrowId,
      selectedReactionArrowIds: o.selectedReactionArrowIds,
      selectedCanvasImageId: o.selectedCanvasImageId ?? null,
      selectedCanvasImageIds: o.selectedCanvasImageIds,
      selectedCanvasShapeId: o.selectedCanvasShapeId ?? null,
      selectedCanvasShapeIds: o.selectedCanvasShapeIds,
      selectedCanvasOrbitalIds: o.selectedCanvasOrbitalIds,
      selectedStrokeId: o.selectedStrokeId ?? null,
      selectedStrokeIds: o.selectedStrokeIds,
      selectedCanvasTextIds: o.selectedCanvasTextIds,
      selectedSruBracketId: o.selectedSruBracketId ?? null,
      hoveredComponentIds: o.hoveredComponentIds,
      hoveredAtomCircleId: o.hoveredAtomCircleId,
      hoveredBondHighlightId: o.hoveredBondHighlightId,
      hoverAtomId: o.hoverAtomId,
      hoverBondId: o.hoverBondId,
      hoverRingAtomIds: o.hoverRingAtomIds,
      mouseWorldPos: o.mouseWorldPos,
      touchPointerWorldPos: o.touchPointerWorldPos ?? null,
      errorAtomId: o.errorAtomId,
      stereoWarningAtomIds,
      cipAtomLabels: o.cipAtomLabels ?? null,
      cipBondLabels: o.cipBondLabels ?? null,
      showCipLabels: o.showCipLabels ?? false,
      showHydrogens: o.showHydrogens,
      condensedGroupLabels: o.condensedGroupLabels,
      colorAtomLabels: o.colorAtomLabels,
      applyAtomColorsToBonds: o.applyAtomColorsToBonds,
      structureTheme: o.structureTheme ?? DEFAULT_STRUCTURE_THEME,
      structureDrawMode: o.structureDrawMode ?? 'skeletal',
      omitAtomAliasBodyId: o.omitAtomAliasBodyId,
      omitCanvasTextBodyId: o.omitCanvasTextBodyId,
      activeColor: o.activeColor,
      activeThickness: o.activeThickness,
      placementElement: o.placementElement,
      drawingBond: o.drawingBond,
      drawingChain: o.drawingChain,
      drawingRing: o.drawingRing,
      drawingStroke: o.drawingStroke,
      smartDrawSessionStrokes: o.smartDrawSessionStrokes ?? [],
      drawingReactionArrow: o.drawingReactionArrow,
      drawingCanvasShape: o.drawingCanvasShape,
      dragAction: o.dragAction,
      rotatePreviewDelta,
      labelCounterRad,
      hasRotateCommit: o.hasRotateCommit,
      hasScaleCommit: o.hasScaleCommit,
      applyLabelUpright,
      offscreenCanvas: o.offscreenCanvasRef.current,
      fragmentPlacement: o.fragmentPlacement,
    };

    return { R, transformAtomIds, effectiveZoom };
  }, []);

  const paintStructure = useCallback((ctx: CanvasRenderingContext2D, R: RenderContext) => {
    drawSelectionFillBehind(ctx, R);
    paintStructureLayers(ctx, R);
  }, []);

  const paintOverlay = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      canvas: HTMLCanvasElement,
      R: RenderContext,
      transformAtomIds: string[],
      effectiveZoom: number,
    ) => {
      drawDendrimerGuides(ctx, R);
    drawHoverOutlineAndToolHints(ctx, R);
    drawRingHoverFill(ctx, R);
    drawBondGhost(ctx, R);
    drawBondHoverHint(ctx, R);
    drawRingGhost(ctx, R);
    drawChainGhost(ctx, R);
      drawReactionArrowGhost(ctx, R);
    drawFragmentPlacementGhost(ctx, R);
    drawErrorAtomMarker(ctx, R);
    drawStereoWarningMarkers(ctx, R);
    drawSelectionTransformHandle(ctx, R);
    drawPencilGhost(ctx, R);
    drawCanvasShapeGhost(ctx, R);
    drawTouchIndicator(ctx, R, effectiveZoom);

    const threshold = alignmentGuideThresholdWorld(effectiveZoom);
    let alignmentGuides: AlignmentGuides = { verticalX: [], horizontalY: [] };
      const { dragAction, molecule } = R;
    if (dragAction?.type === 'move_selection') {
      const dx = dragAction.currentX - dragAction.startX;
      const dy = dragAction.currentY - dragAction.startY;
      alignmentGuides = guidesForSelectionMove(molecule, transformAtomIds, dx, dy, threshold);
    } else if (dragAction?.type === 'move_canvas_text') {
      const dx = dragAction.currentX - dragAction.startX;
      const dy = dragAction.currentY - dragAction.startY;
      alignmentGuides = guidesForCanvasTextMove(
        molecule,
        dragAction.origX,
        dragAction.origY,
        dx,
        dy,
        threshold,
      );
    } else if (dragAction?.type === 'move_reaction_arrow') {
      const dx = dragAction.currentX - dragAction.startX;
      const dy = dragAction.currentY - dragAction.startY;
        alignmentGuides = guidesForReactionArrowMove(
          molecule,
          dragAction.origArrow,
          dx,
          dy,
          threshold,
        );
    } else if (dragAction?.type === 'resize_reaction_arrow') {
      const dx = dragAction.currentX - dragAction.startX;
      const dy = dragAction.currentY - dragAction.startY;
      alignmentGuides = guidesForReactionArrowResize(
        molecule,
        dragAction.origArrow,
        dragAction.endpoint,
        dx,
        dy,
        threshold,
      );
    }
      drawAlignmentGuides(ctx, canvas.width, canvas.height, R.viewport, effectiveZoom, alignmentGuides);
    drawMarquee(ctx, R);
    },
    [],
  );

  const render = useCallback(() => {
    const structureCanvas = opts.structureCanvasRef.current;
    const overlayCanvas = opts.overlayCanvasRef.current;
    if (!structureCanvas || !overlayCanvas) return;
    const sctx = structureCanvas.getContext('2d');
    const octx = overlayCanvas.getContext('2d');
    if (!sctx || !octx) return;

    const { R, transformAtomIds, effectiveZoom } = buildRendered(opts);
    const { viewport, displayScale, molecule } = opts;
    const dragKind = structureAffectingDrag(opts.dragAction);

    const key: StructurePaintKey = {
      molecule,
      zoom: viewport.zoom,
      displayScale,
      showHydrogens: opts.showHydrogens,
      condensedGroupLabels: opts.condensedGroupLabels,
      colorAtomLabels: opts.colorAtomLabels,
      applyAtomColorsToBonds: opts.applyAtomColorsToBonds,
      structureInk: (opts.structureTheme ?? DEFAULT_STRUCTURE_THEME).ink,
      structureDrawMode: opts.structureDrawMode ?? 'skeletal',
      showCipLabels: opts.showCipLabels ?? false,
      prefsKey: prefsFingerprint(opts.displayPrefs),
      dragKind,
      selectionFragmentRotationRad: opts.selectionFragmentRotationRad,
      omitAtomAliasBodyId: opts.omitAtomAliasBodyId,
      omitCanvasTextBodyId: opts.omitCanvasTextBodyId,
      canvasW: structureCanvas.width,
      canvasH: structureCanvas.height,
      annotationSelKey: annotationSelectionFingerprint(opts),
      atomSelKey: `${idsKey(opts.selectedAtomIds)}#${idsKey(opts.selectedBondIds)}`,
    };

    const prev = structureCacheRef.current;
    // Structure cache is only reusable when idle (no structure-affecting drag).
    const sameStructure =
      dragKind === null &&
      !!prev &&
      prev.key.molecule === key.molecule &&
      prev.key.zoom === key.zoom &&
      prev.key.displayScale === key.displayScale &&
      prev.key.showHydrogens === key.showHydrogens &&
      prev.key.condensedGroupLabels === key.condensedGroupLabels &&
      prev.key.colorAtomLabels === key.colorAtomLabels &&
      prev.key.applyAtomColorsToBonds === key.applyAtomColorsToBonds &&
      prev.key.structureInk === key.structureInk &&
      prev.key.structureDrawMode === key.structureDrawMode &&
      prev.key.showCipLabels === key.showCipLabels &&
      prev.key.prefsKey === key.prefsKey &&
      prev.key.selectionFragmentRotationRad === key.selectionFragmentRotationRad &&
      prev.key.omitAtomAliasBodyId === key.omitAtomAliasBodyId &&
      prev.key.omitCanvasTextBodyId === key.omitCanvasTextBodyId &&
      prev.key.canvasW === key.canvasW &&
      prev.key.canvasH === key.canvasH &&
      prev.key.annotationSelKey === key.annotationSelKey &&
      prev.key.atomSelKey === key.atomSelKey;

    const panOnly =
      sameStructure &&
      !!prev &&
      (prev.viewportX !== viewport.x || prev.viewportY !== viewport.y);

    const theme = opts.structureTheme ?? DEFAULT_STRUCTURE_THEME;
    const showGrid = opts.displayPrefs.showGrid !== false;
    const gridSizePx = opts.displayPrefs.gridSizePx || 50;

    if (panOnly && prev) {
      // Shift the cached *structure* bitmap. Do not bake the blit back into the
      // cache — that used to stamp empty margins (no grid, no molecules) as the
      // new source, so zoom-out/pan showed patches of canvas with no grid.
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, structureCanvas.width, structureCanvas.height);
      const dx = viewport.x - prev.viewportX;
      const dy = viewport.y - prev.viewportY;
      sctx.drawImage(prev.canvas, dx, dy);
      paintBackgroundGrid(
        sctx,
        structureCanvas,
        viewport,
        displayScale,
        theme,
        showGrid,
        gridSizePx,
      );
    } else if (!sameStructure || !prev) {
      applyWorldTransform(sctx, structureCanvas, viewport, displayScale);
      paintStructure(sctx, R);
      sctx.restore();

      const cacheCanvas =
        prev?.canvas &&
        prev.canvas.width === structureCanvas.width &&
        prev.canvas.height === structureCanvas.height
          ? prev.canvas
          : document.createElement('canvas');
      cacheCanvas.width = structureCanvas.width;
      cacheCanvas.height = structureCanvas.height;
      const cctx = cacheCanvas.getContext('2d');
      if (cctx) {
        cctx.setTransform(1, 0, 0, 1, 0, 0);
        cctx.clearRect(0, 0, cacheCanvas.width, cacheCanvas.height);
        cctx.drawImage(structureCanvas, 0, 0);
      }
      structureCacheRef.current = {
        key,
        canvas: cacheCanvas,
        viewportX: viewport.x,
        viewportY: viewport.y,
      };
      paintBackgroundGrid(
        sctx,
        structureCanvas,
        viewport,
        displayScale,
        theme,
        showGrid,
        gridSizePx,
      );
    }

    applyWorldTransform(octx, overlayCanvas, viewport, displayScale);
    paintOverlay(octx, overlayCanvas, R, transformAtomIds, effectiveZoom);
    octx.restore();
    if (opts.touchLoupe !== false) {
      drawTouchLoupe(octx, overlayCanvas, structureCanvas, viewport, displayScale, R);
    }
    drawPointerDebugHud(octx, displayScale, opts.pointerDebugHud);
  }, [opts, buildRendered, paintStructure, paintOverlay]);

  useEffect(() => {
    render();
  }, [render]);

  useEffect(() => {
    const onImageLoaded = () => {
      structureCacheRef.current = null;
      render();
    };
    window.addEventListener(CANVAS_IMAGE_LOAD_EVENT, onImageLoaded);
    return () => window.removeEventListener(CANVAS_IMAGE_LOAD_EVENT, onImageLoaded);
  }, [render]);

  return { render };
};
