import {
  PALM_MAX_CONTACT_SIZE_PX,
  PEN_PALM_MAX_CONTACT_SIZE_PX,
} from './constants';
import type { PointerLike } from './types';

/**
 * Heuristic palm / accidental-contact rejection for tablets.
 * Prefer rejecting oversized touch contacts; pens use a tighter size cap.
 * Mouse is never treated as palm.
 */
export function isLikelyPalm(e: PointerLike): boolean {
  const type = e.pointerType || 'mouse';
  if (type === 'mouse') return false;

  const w = e.width ?? 0;
  const h = e.height ?? 0;
  const size = Math.max(w, h);

  // Some browsers report 0×0 for touch until contact settles — don't reject those.
  if (size <= 0) return false;

  if (type === 'pen') {
    return size > PEN_PALM_MAX_CONTACT_SIZE_PX;
  }

  // touch (and unknown): reject large contacts typical of palm / edge grip.
  return size > PALM_MAX_CONTACT_SIZE_PX;
}

/** True when this pointer should drive drawing tools (primary finger / pen / mouse). */
export function isDrawingPointer(e: PointerLike): boolean {
  if (isLikelyPalm(e)) return false;
  const type = e.pointerType || 'mouse';
  if (type === 'mouse' || type === 'pen') return true;
  // Touch: only the primary contact draws; secondary starts multi-touch gestures.
  return e.isPrimary !== false;
}

export function isTouchPointer(e: PointerLike): boolean {
  return (e.pointerType || 'mouse') === 'touch';
}

export function isPenPointer(e: PointerLike): boolean {
  return e.pointerType === 'pen';
}
