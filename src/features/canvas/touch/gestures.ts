import {
  MULTI_PAN_EPSILON_PX,
  PINCH_SCALE_EPSILON,
} from './constants';
import type { PinchPanDelta, PinchPanSample, TrackedPointer } from './types';

/** Midpoint + distance for two tracked contacts. */
export function sampleTwoPointers(a: TrackedPointer, b: TrackedPointer): PinchPanSample {
  const dx = b.clientX - a.clientX;
  const dy = b.clientY - a.clientY;
  return {
    midpoint: {
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2,
    },
    distance: Math.hypot(dx, dy) || 1,
  };
}

/**
 * Compute pan + pinch scale from consecutive two-finger samples.
 * Returns null when the change is below noise thresholds.
 */
export function deltaPinchPan(
  prev: PinchPanSample,
  next: PinchPanSample,
): PinchPanDelta | null {
  const panDx = next.midpoint.x - prev.midpoint.x;
  const panDy = next.midpoint.y - prev.midpoint.y;
  const scale = next.distance / prev.distance;

  const panMag = Math.hypot(panDx, panDy);
  const scaleDelta = Math.abs(scale - 1);

  if (panMag < MULTI_PAN_EPSILON_PX && scaleDelta < PINCH_SCALE_EPSILON) {
    return null;
  }

  return {
    panDx,
    panDy,
    scale,
    focalClientX: next.midpoint.x,
    focalClientY: next.midpoint.y,
  };
}

/** Stable sort of pointer ids for deterministic two-finger pairing. */
export function pickTwoPointers(
  map: Map<number, TrackedPointer>,
): [TrackedPointer, TrackedPointer] | null {
  if (map.size < 2) return null;
  const list = [...map.values()].sort((a, b) => a.pointerId - b.pointerId);
  return [list[0]!, list[1]!];
}
