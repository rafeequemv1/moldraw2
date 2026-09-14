import type { ReactionArrow } from '@moldraw/domain';
import type { DrawingReactionArrowState } from '../render/types';
import { defaultCurveControl, defaultSCurveControls } from './reactionArrow';

/**
 * Turn an in-progress drag segment into a full `ReactionArrow` (control
 * points defaulted for curved / S / resonance).
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
    const { cx, cy } = defaultCurveControl(x1, y1, x2, y2);
    return { ...base, cx, cy, doubleHead: false };
  }
  if (kind === 's_curve') {
    const c = defaultSCurveControls(x1, y1, x2, y2);
    return { ...base, c1x: c.c1x, c1y: c.c1y, c2x: c.c2x, c2y: c.c2y };
  }
  return base;
};
