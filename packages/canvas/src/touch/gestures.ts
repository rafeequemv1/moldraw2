import {
  MULTI_PAN_EPSILON_PX,
  PINCH_ROTATE_EPSILON_RAD,
  PINCH_SCALE_EPSILON,
} from './constants';
import type { PinchPanDelta, PinchPanSample, TrackedPointer } from './types';

/** Midpoint + distance + angle for two tracked contacts. */
export function sampleTwoPointers(a: TrackedPointer, b: TrackedPointer): PinchPanSample {
  const dx = b.clientX - a.clientX;
  const dy = b.clientY - a.clientY;
  return {
    midpoint: {
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2,
    },
    distance: Math.hypot(dx, dy) || 1,
    angle: Math.atan2(dy, dx),
  };
}

/** Wrap an angle difference into (-π, π]. */
const wrapAngle = (d: number): number => {
  let a = d;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
};

/**
 * Compute pan + pinch scale + twist from consecutive two-finger samples.
 * Returns null when every component is below its noise threshold.
 */
export function deltaPinchPan(
  prev: PinchPanSample,
  next: PinchPanSample,
): PinchPanDelta | null {
  const panDx = next.midpoint.x - prev.midpoint.x;
  const panDy = next.midpoint.y - prev.midpoint.y;
  const scale = next.distance / prev.distance;
  const rotateRad = wrapAngle(next.angle - prev.angle);

  const panMag = Math.hypot(panDx, panDy);
  const scaleDelta = Math.abs(scale - 1);

  if (
    panMag < MULTI_PAN_EPSILON_PX &&
    scaleDelta < PINCH_SCALE_EPSILON &&
    Math.abs(rotateRad) < PINCH_ROTATE_EPSILON_RAD
  ) {
    return null;
  }

  return {
    panDx,
    panDy,
    scale,
    rotateRad,
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
