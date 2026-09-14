/**
 * Re-export lone-pair geometry from @moldraw/core so drawing and arrow
 * anchors share one placement model.
 */
export {
  getLonePairPlacements,
  labelBoxFromExtents,
  resolveLonePairWorldPoint,
  LONE_PAIR_DIST_PX,
  LONE_PAIR_DOT_SEP_PX,
  LONE_PAIR_DOT_R_PX,
  RADICAL_DIST_PX,
  RADICAL_DOT_R_PX,
  type LabelBoxLocal,
  type LonePairPlacement,
  type LonePairPreferSide,
  type Point2,
} from '@moldraw/core';
