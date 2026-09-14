import { useCallback, useEffect } from 'react';
import type { RefObject } from 'react';
import type { ResolvedCanvasPreferences } from '@moldraw/core/canvasPreferences';
import type { Molecule } from '@moldraw/domain';
import { analyzeStereoIssues } from '@moldraw/domain';
import type { Point, Viewport } from './geometry';
import {
  alignmentGuideThresholdWorld,
  atomIdsForSelectionTransform,
  guidesForCanvasTextMove,
  guidesForReactionArrowMove,
  guidesForReactionArrowResize,
  guidesForSelectionMove,
  shortestAngleDiff,
  type AlignmentGuides,
} from './geometry';
import {
  type RenderContext,
  drawAtomLabels,
  drawBonds,
  CANVAS_IMAGE_LOAD_EVENT,
  drawCanvasImages,
  drawBondGhost,
  drawBondHoverHint,
  drawAlignmentGuides,
  drawCanvasTexts,
  drawChainGhost,
  drawCommittedCanvasShapes,
  drawCanvasShapeGhost,
  drawCommittedStrokes,
  drawErrorAtomMarker,
  drawStereoWarningMarkers,
  drawGrid,
  drawImplicitHydrogenStubs,
  drawLonePairs,
  drawMarquee,
  drawPencilGhost,
  drawReactionArrows,
  drawRingFills,
  drawRingHoverFill,
  drawRingGhost,
  drawFragmentPlacementGhost,
  drawCipLabels,
  drawAtomMaps,
  drawSelectionAndHoverHighlights,
  drawSelectionTransformHandle,
} from './render';
import type { FragmentPlacementSession } from '@moldraw/core/molecule/fragmentPlacement';
import type {
  DragActionState,
  DrawingBondState,
  DrawingChainState,
  DrawingCanvasShapeState,
  DrawingReactionArrowState,
  DrawingRingState,
} from './render/types';

export interface UseCanvasRendererOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  offscreenCanvasRef: RefObject<HTMLCanvasElement | null>;
  viewport: Viewport;
  displayScale: number;
  displayPrefs: ResolvedCanvasPreferences;

  molecule: Molecule;
  showHydrogens: boolean;
  condensedGroupLabels: boolean;
  colorAtomLabels: boolean;
  applyAtomColorsToBonds: boolean;

  activeTool: string;
  isRingTool: boolean;
  numSides: number;
  isBenzene: boolean;
  isBoatTool: boolean;
  isChairTool: boolean;

  selectedAtomIds: string[];
  selectedBondIds?: string[];
  selectedCanvasTextId: string | null;
  selectedReactionArrowId: string | null;
  selectionFragmentRotationRad: number;
  hasRotateCommit: boolean;

  hoveredComponentIds: string[];
  hoveredAtomCircleId: string | null;
  hoveredBondHighlightId: string | null;
  hoverAtomId: string | null;
  hoverBondId: string | null;
  hoverRingAtomIds: string[] | null;
  mouseWorldPos: Point | null;
  errorAtomId: string | null;

  omitAtomAliasBodyId: string | null;
  omitCanvasTextBodyId: string | null;

  /** Indigo CIP R/S (atom id → label) and E/Z (bond id → label). */
  cipAtomLabels?: ReadonlyMap<string, string> | null;
  cipBondLabels?: ReadonlyMap<string, string> | null;
  showCipLabels?: boolean;

  activeColor: string;
  activeThickness: number;
  placementElement: string;

  drawingBond: DrawingBondState | null;
  drawingChain: DrawingChainState | null;
  drawingRing: DrawingRingState | null;
  drawingStroke: Point[] | null;
  drawingReactionArrow: DrawingReactionArrowState | null;
  drawingCanvasShape: DrawingCanvasShapeState | null;
  dragAction: DragActionState | null;
  fragmentPlacement: FragmentPlacementSession | null;
}

/**
 * Builds the per-frame `RenderContext` and dispatches the canvas draw
 * pipeline. Owns the `useEffect` that triggers a redraw whenever any input
 * changes. The pipeline order matches the chemistry surface z-stacking:
 *
 *   grid → highlights → ring fills → bonds → arrows → ghosts → error / stereo markers
 *   → selection transform handle → implicit Hs → strokes → atom labels
 *   → lone pairs → free text → marquee.
 *
 * Returning `render` lets callers force a synchronous redraw (e.g. after a
 * canvas resize) without waiting for React's effect tick.
 */
export const useCanvasRenderer = (opts: UseCanvasRendererOptions): { render: () => void } => {
  const render = useCallback(() => {
    const canvas = opts.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { viewport, displayScale, molecule, selectedAtomIds, selectionFragmentRotationRad } =
      opts;
    const selectedBondIds = opts.selectedBondIds ?? [];
    const transformAtomIds = atomIdsForSelectionTransform(
      molecule,
      selectedAtomIds,
      selectedBondIds,
    );
    const transformAtomSet = new Set(transformAtomIds);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    const effectiveZoom = viewport.zoom * displayScale;
    ctx.translate(canvas.width / 2 + viewport.x, canvas.height / 2 + viewport.y);
    ctx.scale(effectiveZoom, effectiveZoom);

    drawGrid(ctx, canvas.width, canvas.height, { ...viewport, zoom: effectiveZoom });

    // Pre-compute drag/rotate-aware atom positions so every submodule sees a
    // consistent in-flight molecule (no double-applying transforms).
    const { dragAction } = opts;
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
    }
    const labelCounterRad = selectionFragmentRotationRad + rotatePreviewDelta;

    const renderedAtoms = molecule.atoms.map(a => {
      if (dragAction?.type === 'rotate_selection' && transformAtomSet.has(a.id)) {
        const p = dragAction.snap[a.id];
        if (!p) return a;
        const c = Math.cos(rotatePreviewDelta);
        const s = Math.sin(rotatePreviewDelta);
        const x = p.x - dragAction.cx;
        const y = p.y - dragAction.cy;
        return { ...a, x: dragAction.cx + c * x - s * y, y: dragAction.cy + s * x + c * y };
      }
      if (dragAction?.type === 'move_selection' && transformAtomSet.has(a.id)) {
        return { ...a, x: a.x + dragDx, y: a.y + dragDy };
      }
      return a;
    });
    const renderedMolecule: Molecule = { ...molecule, atoms: renderedAtoms };
    const stereoWarningAtomIds = analyzeStereoIssues(renderedMolecule);

    const valencyMap = new Map<string, number>();
    renderedMolecule.bonds.forEach(b => {
      valencyMap.set(b.fromAtomId, (valencyMap.get(b.fromAtomId) || 0) + b.order);
      valencyMap.set(b.toAtomId, (valencyMap.get(b.toAtomId) || 0) + b.order);
    });

    const applyLabelUpright = (atomId: string, draw: () => void) => {
      if (!selectedAtomIds.includes(atomId) || Math.abs(labelCounterRad) < 1e-5) {
        draw();
        return;
      }
      const at = renderedMolecule.atoms.find(x => x.id === atomId);
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
      valencyMap,
      viewport,
      displayScale,
      displayPrefs: opts.displayPrefs,
      activeTool: opts.activeTool,
      isRingTool: opts.isRingTool,
      numSides: opts.numSides,
      isBenzene: opts.isBenzene,
      isBoatTool: opts.isBoatTool,
      isChairTool: opts.isChairTool,
      selectedAtomIds,
      selectedBondIds,
      selectedCanvasTextId: opts.selectedCanvasTextId,
      selectedReactionArrowId: opts.selectedReactionArrowId,
      hoveredComponentIds: opts.hoveredComponentIds,
      hoveredAtomCircleId: opts.hoveredAtomCircleId,
      hoveredBondHighlightId: opts.hoveredBondHighlightId,
      hoverAtomId: opts.hoverAtomId,
      hoverBondId: opts.hoverBondId,
      hoverRingAtomIds: opts.hoverRingAtomIds,
      mouseWorldPos: opts.mouseWorldPos,
      errorAtomId: opts.errorAtomId,
      stereoWarningAtomIds,
      cipAtomLabels: opts.cipAtomLabels ?? null,
      cipBondLabels: opts.cipBondLabels ?? null,
      showCipLabels: opts.showCipLabels ?? false,
      showHydrogens: opts.showHydrogens,
      condensedGroupLabels: opts.condensedGroupLabels,
      colorAtomLabels: opts.colorAtomLabels,
      applyAtomColorsToBonds: opts.applyAtomColorsToBonds,
      omitAtomAliasBodyId: opts.omitAtomAliasBodyId,
      omitCanvasTextBodyId: opts.omitCanvasTextBodyId,
      activeColor: opts.activeColor,
      activeThickness: opts.activeThickness,
      placementElement: opts.placementElement,
      drawingBond: opts.drawingBond,
      drawingChain: opts.drawingChain,
      drawingRing: opts.drawingRing,
      drawingStroke: opts.drawingStroke,
      drawingReactionArrow: opts.drawingReactionArrow,
      drawingCanvasShape: opts.drawingCanvasShape,
      dragAction: opts.dragAction,
      rotatePreviewDelta,
      labelCounterRad,
      hasRotateCommit: opts.hasRotateCommit,
      applyLabelUpright,
      offscreenCanvas: opts.offscreenCanvasRef.current,
      fragmentPlacement: opts.fragmentPlacement,
    };

    drawSelectionAndHoverHighlights(ctx, R);
    drawCanvasImages(ctx, R);
    drawRingFills(ctx, R);
    drawRingHoverFill(ctx, R);
    drawBonds(ctx, R);
    drawReactionArrows(ctx, R);
    drawBondGhost(ctx, R);
    drawBondHoverHint(ctx, R);
    drawRingGhost(ctx, R);
    drawChainGhost(ctx, R);
    drawFragmentPlacementGhost(ctx, R);
    drawErrorAtomMarker(ctx, R);
    drawStereoWarningMarkers(ctx, R);
    drawSelectionTransformHandle(ctx, R);
    drawImplicitHydrogenStubs(ctx, R);
    drawCommittedStrokes(ctx, R);
    drawCommittedCanvasShapes(ctx, R);
    drawPencilGhost(ctx, R);
    drawCanvasShapeGhost(ctx, R);
    drawAtomLabels(ctx, R);
    drawLonePairs(ctx, R);
    drawCipLabels(ctx, R);
    drawAtomMaps(ctx, R);
    drawCanvasTexts(ctx, R);

    const threshold = alignmentGuideThresholdWorld(effectiveZoom);
    let alignmentGuides: AlignmentGuides = { verticalX: [], horizontalY: [] };
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
      alignmentGuides = guidesForReactionArrowMove(molecule, dragAction.origArrow, dx, dy, threshold);
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
    drawAlignmentGuides(ctx, canvas.width, canvas.height, viewport, effectiveZoom, alignmentGuides);

    drawMarquee(ctx, R);

    ctx.restore();
  }, [opts]);

  useEffect(() => {
    render();
  }, [render]);

  useEffect(() => {
    const onImageLoaded = () => render();
    window.addEventListener(CANVAS_IMAGE_LOAD_EVENT, onImageLoaded);
    return () => window.removeEventListener(CANVAS_IMAGE_LOAD_EVENT, onImageLoaded);
  }, [render]);

  return { render };
};
