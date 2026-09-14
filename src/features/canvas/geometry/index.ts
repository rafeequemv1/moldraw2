/**
 * Barrel exports for canvas geometry/math/hit-test helpers. None of these
 * touch React state — they're pure functions over `Molecule` and primitives.
 */
export type { Point, Viewport } from './polygons';
export { polygonArea, pointInPolygon, findRingsAtPoint, findSmallestRingAtPoint } from './polygons';
export {
  angle0To2Pi,
  shortestAngleDiff,
  pointSegDist,
  snapSegmentEndpointToAngleStep,
  snapAngleToStepRad,
} from './angles';
export { hexToRgba } from './colors';
export {
  BOND_TRIM_GAP_C,
  BOND_TRIM_GAP_HETERO,
  CONDENSED_TERMINAL_BOND_PAD_PX,
  condensedTerminalBondInsetPx,
  shouldTrimBondEndpoints,
  bondEndPoints,
  bondStrokeColor,
  type BondTrimContext,
} from './bondGeometry';
export { measureAliasLabelSize, measureHeadAnchoredLabelSize, aliasLabelBondGapTowardPartnerPx } from './aliasLabelMetrics';
export { computeAutoExtendAngle } from './autoExtendAngle';
export {
  IMPLICIT_H_LABEL_DIST,
  IMPLICIT_H_BOND_END,
  hGoesLeft,
  getHydrogenStubDirections,
} from './hydrogenLayout';
export {
  getLonePairPlacements,
  labelBoxFromExtents,
  LONE_PAIR_DIST_PX,
  LONE_PAIR_DOT_SEP_PX,
  type LabelBoxLocal,
  type LonePairPlacement,
} from './lonePairLayout';
export {
  buildCanvasTextFont,
  measureCanvasTextBox,
  getCanvasTextBox,
  pickCanvasTextAt,
  pickCanvasTextResizeHandle,
  canvasTextResizePatch,
  canvasTextBbox,
  pickTopCanvasTextInRect,
} from './canvasText';
export {
  ROTATE_HANDLE_R,
  ROTATE_HANDLE_OFFSET,
  MOVE_HANDLE_R,
  MOVE_HANDLE_OFFSET,
  TRANSFORM_PAD,
  TRANSFORM_MIN_SPAN,
  type SelectionAabb,
  type SelectionTransformLayout,
  getSelectionAabb,
  getSelectionCentroid,
  getSelectionTransformLayout,
  isNearTransformRotateHandle,
  isNearTransformMoveHandle,
  collectAtomIdsFromLasso,
  expandAtomIdsToConnectedFragments,
  atomIdsForSelectionTransform,
} from './selection';
export { getSmallestRingCenter, getSmallestCycleAtomIds } from './rings';
export {
  drawReactionArrowCanvas,
  drawReactionArrowShape,
  pickReactionArrowAt,
  reactionArrowAfterDelta,
  offsetReactionArrowForDrag,
  defaultCurveControl,
  defaultSCurveControls,
  getReactionArrowKind,
  sampleReactionArrowPolyline,
  pickReactionArrowEndpoint,
  pickReactionArrowCurveHandle,
  getReactionArrowCurveHandleWorld,
  reactionArrowCurveHandlePatch,
  reactionArrowEndpointResizePatch,
  type ReactionArrowEndpoint,
} from './reactionArrow';
export { buildReactionArrowFromDrag } from './reactionArrowFromDrag';
export {
  normalizeShapeBox,
  hitCanvasShape,
  pickCanvasShapeAt,
  strokeShapeKind,
} from './canvasShapes';
export { hitCanvasImage, pickCanvasImageAt } from './canvasImages';
export { getChainPoints } from './chain';
export {
  type AlignmentGuides,
  collectAlignmentTargets,
  guidesForSelectionMove,
  guidesForCanvasTextMove,
  guidesForReactionArrowMove,
  guidesForReactionArrowResize,
  ARROW_ENDPOINT_AXIS_SNAP_WORLD,
  snapReactionArrowResizePointer,
  alignmentGuideThresholdWorld,
} from './alignmentGuides';
