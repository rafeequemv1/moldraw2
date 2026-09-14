/**
 * Barrel exports for canvas render submodules. Each `drawXxx(ctx, R)` is pure
 * w.r.t. the supplied `RenderContext` snapshot — it does not touch React state
 * or refs directly.
 */
export type {
  DragActionState,
  DrawingBondState,
  DrawingChainState,
  DrawingRingState,
  DrawingReactionArrowState,
  DrawingCanvasShapeState,
  RenderContext,
} from './types';

export { drawGrid } from './drawGrid';
export {
  drawSelectionAndHoverHighlights,
  drawErrorAtomMarker,
  drawStereoWarningMarkers,
} from './drawHighlights';
export { drawRingFills, drawRingHoverFill } from './drawRingFills';
export { drawBonds } from './drawBonds';
export { CANVAS_IMAGE_LOAD_EVENT, drawCanvasImages } from './drawCanvasImages';
export { drawReactionArrows } from './drawReactionArrows';
export { drawBondGhost, drawBondHoverHint, drawRingGhost, drawChainGhost } from './drawGhosts';
export { drawFragmentPlacementGhost } from './drawFragmentPlacementGhost';
export {
  drawImplicitHydrogenStubs,
  drawAtomLabels,
  drawLonePairs,
} from './drawAtomDecorations';
export { drawCipLabels } from './drawCipLabels';
export { drawAtomMaps } from './drawAtomMaps';
export { drawCanvasTexts } from './drawCanvasTexts';
export { drawAlignmentGuides } from './drawAlignmentGuides';
export { drawCommittedStrokes, drawPencilGhost } from './drawStrokes';
export { drawCommittedCanvasShapes, drawCanvasShapeGhost } from './drawCanvasShapes';
export { drawSelectionTransformHandle, drawMarquee } from './drawSelectionUI';
