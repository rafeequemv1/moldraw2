import type { ReactionArrow } from '@moldraw/domain';
import type { DrawingReactionArrowState } from '../render/types';
import {
  defaultCurveControl,
  defaultSCurveControls,
  defaultPathPoints,
  defaultRowWrapPathPoints,
  defaultCycleArcCenter,
} from './reactionArrow';

/**
 * Turn an in-progress drag segment into a full `ReactionArrow` (control
 * points defaulted for curved / S / electron_flow). Resonance is straight ↔.
 */
export const buildReactionArrowFromDrag = (
  d: DrawingReactionArrowState,
  id: string,
): ReactionArrow => {
  const { x1, y1, x2, y2, kind } = d;
  const base: ReactionArrow = { id, x1, y1, x2, y2, kind };
  if (kind === 'curved' || kind === 'electron_flow') {
    const { cx, cy } = defaultCurveControl(x1, y1, x2, y2);
    return { ...base, cx, cy };
  }
  if (kind === 'resonance') {
    return base;
  }
  if (kind === 's_curve') {
    const c = defaultSCurveControls(x1, y1, x2, y2);
    return { ...base, c1x: c.c1x, c1y: c.c1y, c2x: c.c2x, c2y: c.c2y };
  }
  if (kind === 'path') {
    return { ...base, pathPoints: defaultPathPoints(x1, y1, x2, y2) };
  }
  if (kind === 'row_wrap') {
    return { ...base, pathPoints: defaultRowWrapPathPoints(x1, y1, x2, y2) };
  }
  if (kind === 'cycle_arc') {
    const { cx, cy } = defaultCycleArcCenter(x1, y1, x2, y2);
    return { ...base, cx, cy };
  }
  return base;
};
