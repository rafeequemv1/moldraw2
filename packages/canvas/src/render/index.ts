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
  StrokeSample,
  StructureThemeColors,
} from './types';

export { DEFAULT_STRUCTURE_THEME } from './types';
export { drawGrid } from './drawGrid';
export {
  drawSelectionFillBehind,
  drawHoverOutlineAndToolHints,
  drawSelectionAndHoverHighlights,
  drawErrorAtomMarker,
  drawStereoWarningMarkers,
} from './drawHighlights';
export { drawRingFills, drawRingHoverFill } from './drawRingFills';
export { drawBonds } from './drawBonds';
export { collectWedgeChains, drawContinuousWedgeRibbon } from './drawWedgeChains';
export { CANVAS_IMAGE_LOAD_EVENT, drawCanvasImages } from './drawCanvasImages';
export { drawReactionArrows, drawReactionArrowGhost } from './drawReactionArrows';
export { drawBondGhost, drawBondHoverHint, drawRingGhost, drawChainGhost } from './drawGhosts';
export { drawTouchIndicator } from './drawTouchIndicator';
export { drawTouchLoupe, shouldShowTouchLoupe } from './drawTouchLoupe';
export { drawPointerDebugHud } from './drawPointerDebugHud';
export { drawFragmentPlacementGhost } from './drawFragmentPlacementGhost';
export {
  drawImplicitHydrogenStubs,
  drawAtomLabels,
  drawFormalCharges,
  drawDeltaCharges,
  drawLonePairs,
  drawSelectedChargeMarks,
} from './drawAtomDecorations';
export { drawCipLabels } from './drawCipLabels';
export { drawAtomMaps } from './drawAtomMaps';
export { drawCanvasTexts } from './drawCanvasTexts';
export { drawSruBrackets } from './drawSruBrackets';
export { drawAlignmentGuides } from './drawAlignmentGuides';
export { drawDendrimerGuides } from './drawDendrimerGuides';
export { drawCommittedStrokes, drawPencilGhost } from './drawStrokes';
export { drawCommittedCanvasShapes, drawCanvasShapeGhost } from './drawCanvasShapes';
export { drawSelectionTransformHandle, drawMarquee } from './drawSelectionUI';
export { paintStructureLayers } from './paintStructure';
