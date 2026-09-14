import { PEN_PRIORITY_MS } from './constants';
import type { PointerLike } from './types';

/**
 * Pen-priority tracker. On tablets the hand holding the stylus rests on the
 * glass; size-based palm rejection catches most of it, but small knuckle /
 * finger contacts still slip through and used to start a two-finger gesture
 * that cancelled the pen stroke. While any pen is down (and for a short grace
 * window after it lifts) every touch contact is ignored.
 */
export interface PenPriorityTracker {
  notePointerDown: (e: PointerLike) => void;
  notePointerUp: (e: PointerLike) => void;
  /** True when a touch contact should be dropped because a pen owns the canvas. */
  shouldIgnoreTouch: (e: PointerLike) => boolean;
  /** True while at least one pen contact is down. */
  isPenDown: () => boolean;
  reset: () => void;
}

const now = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

export const createPenPriorityTracker = (
  graceMs: number = PEN_PRIORITY_MS,
): PenPriorityTracker => {
  const penIds = new Set<number>();
  let lastPenUpTs = -Infinity;

  return {
    notePointerDown: e => {
      if (e.pointerType === 'pen') penIds.add(e.pointerId);
    },
    notePointerUp: e => {
      if (e.pointerType === 'pen' && penIds.delete(e.pointerId)) {
        lastPenUpTs = now();
      }
    },
    shouldIgnoreTouch: e => {
      if ((e.pointerType || 'mouse') !== 'touch') return false;
      if (penIds.size > 0) return true;
      return now() - lastPenUpTs < graceMs;
    },
    isPenDown: () => penIds.size > 0,
    reset: () => {
      penIds.clear();
      lastPenUpTs = -Infinity;
    },
  };
};

/**
 * Stylus eraser end (Surface Pen, Wacom, some Android pens). Chromium reports
 * `button === 5` on down and `buttons & 32` while held. Apple Pencil has no
 * eraser end.
 */
export const isPenEraser = (e: { pointerType?: string; button: number; buttons?: number }): boolean =>
  e.pointerType === 'pen' && (e.button === 5 || ((e.buttons ?? 0) & 32) !== 0);

/** Stylus barrel button (secondary) — same as right-click. */
export const isPenBarrelButton = (e: { pointerType?: string; button: number; buttons?: number }): boolean =>
  e.pointerType === 'pen' && (e.button === 2 || ((e.buttons ?? 0) & 2) !== 0);
