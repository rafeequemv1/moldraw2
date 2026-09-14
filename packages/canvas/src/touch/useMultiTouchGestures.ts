import { useCallback, useEffect, useRef } from 'react';
import { MULTI_TAP_MAX_MS, MULTI_TAP_SLOP_PX } from './constants';
import { deltaPinchPan, pickTwoPointers, sampleTwoPointers } from './gestures';
import type { PinchPanDelta, PinchPanSample, TrackedPointer } from './types';
import type { CanvasPointerEvent } from './pointerUtils';
import type { Point } from '../geometry';

export interface MultiTouchHandlers {
  /** Apply screen-space pan (CSS px). */
  onPan: (dx: number, dy: number) => void;
  /** Zoom by scale factor around a client-space focal point. */
  onPinchZoom: (scale: number, focalClientX: number, focalClientY: number) => void;
  /**
   * Fired when a second finger lands — cancel in-progress single-finger tools.
   * `focalClient` is the midpoint between the two fingers. Return `true` to
   * claim the gesture: subsequent motion goes to `onClaimedGesture` instead of
   * viewport pan / zoom (used for two-finger move / rotate / scale of a selection).
   */
  onGestureStart?: (focalClient: Point) => boolean | void;
  /** Two-finger motion while the gesture is claimed (see `onGestureStart`). */
  onClaimedGesture?: (delta: PinchPanDelta) => void;
  /** Fired when multi-touch ends (back to ≤1 contact). `claimed` mirrors `onGestureStart`. */
  onGestureEnd?: (claimed: boolean) => void;
  /**
   * Quick tap with N fingers (no movement, short duration). Fired once when
   * the last finger lifts — used for two-finger undo / three-finger redo.
   */
  onMultiTap?: (fingerCount: number) => void;
}

export interface UseMultiTouchGesturesResult {
  /** True while two+ fingers are driving pinch/pan. */
  isGesturing: () => boolean;
  /** True while a two-finger gesture is claimed by the selection transform. */
  isClaimed: () => boolean;
  notePointerDown: (e: CanvasPointerEvent) => void;
  notePointerMove: (e: CanvasPointerEvent) => boolean;
  notePointerUp: (e: CanvasPointerEvent) => void;
  clear: () => void;
  /** Number of tracked touch contacts. */
  touchCount: () => number;
}

function toTracked(e: CanvasPointerEvent): TrackedPointer {
  return {
    pointerId: e.pointerId,
    pointerType: e.pointerType || 'mouse',
    clientX: e.clientX,
    clientY: e.clientY,
    width: e.width ?? 0,
    height: e.height ?? 0,
    pressure: e.pressure ?? 0,
    isPrimary: e.isPrimary !== false,
  };
}

/**
 * Tracks concurrent touch pointers and emits two-finger pan + pinch-zoom
 * (or a claimed move / rotate / scale gesture). Mouse/pen are ignored here —
 * they stay on the single-pointer drawing path.
 */
export function useMultiTouchGestures(
  handlers: MultiTouchHandlers,
): UseMultiTouchGesturesResult {
  const pointersRef = useRef(new Map<number, TrackedPointer>());
  const sampleRef = useRef<PinchPanSample | null>(null);
  const gesturingRef = useRef(false);
  const claimedRef = useRef(false);
  const handlersRef = useRef(handlers);
  /** Multi-finger tap bookkeeping for the current contact sequence. */
  const tapRef = useRef<{
    startTs: number;
    maxCount: number;
    moved: boolean;
    origins: Map<number, { x: number; y: number }>;
  } | null>(null);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const endGesture = useCallback(() => {
    if (!gesturingRef.current) return;
    gesturingRef.current = false;
    const claimed = claimedRef.current;
    claimedRef.current = false;
    handlersRef.current.onGestureEnd?.(claimed);
  }, []);

  const clear = useCallback(() => {
    pointersRef.current.clear();
    sampleRef.current = null;
    tapRef.current = null;
    endGesture();
  }, [endGesture]);

  const now = (): number =>
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  const syncGestureState = useCallback(() => {
    const pair = pickTwoPointers(pointersRef.current);
    if (pair) {
      const sample = sampleTwoPointers(pair[0], pair[1]);
      sampleRef.current = sample;
      if (!gesturingRef.current) {
        gesturingRef.current = true;
        claimedRef.current = handlersRef.current.onGestureStart?.(sample.midpoint) === true;
      }
    } else {
      sampleRef.current = null;
      endGesture();
    }
  }, [endGesture]);

  const notePointerDown = useCallback(
    (e: CanvasPointerEvent) => {
      if ((e.pointerType || 'mouse') !== 'touch') return;
      pointersRef.current.set(e.pointerId, toTracked(e));
      const tap = tapRef.current;
      if (!tap || pointersRef.current.size === 1) {
        tapRef.current = {
          startTs: now(),
          maxCount: 1,
          moved: false,
          origins: new Map([[e.pointerId, { x: e.clientX, y: e.clientY }]]),
        };
      } else {
        tap.maxCount = Math.max(tap.maxCount, pointersRef.current.size);
        tap.origins.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      syncGestureState();
    },
    [syncGestureState],
  );

  const notePointerMove = useCallback((e: CanvasPointerEvent): boolean => {
    if ((e.pointerType || 'mouse') !== 'touch') return false;
    if (!pointersRef.current.has(e.pointerId)) return false;

    pointersRef.current.set(e.pointerId, toTracked(e));
    const tap = tapRef.current;
    if (tap && !tap.moved) {
      const o = tap.origins.get(e.pointerId);
      if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > MULTI_TAP_SLOP_PX) {
        tap.moved = true;
      }
    }

    if (!gesturingRef.current || pointersRef.current.size < 2) return false;

    const pair = pickTwoPointers(pointersRef.current);
    if (!pair) return false;

    const next = sampleTwoPointers(pair[0], pair[1]);
    const prev = sampleRef.current;
    sampleRef.current = next;
    if (!prev) return true;

    const delta = deltaPinchPan(prev, next);
    if (!delta) return true;

    const h = handlersRef.current;
    if (claimedRef.current) {
      h.onClaimedGesture?.(delta);
      return true;
    }
    if (Math.abs(delta.panDx) > 0 || Math.abs(delta.panDy) > 0) {
      h.onPan(delta.panDx, delta.panDy);
    }
    if (Math.abs(delta.scale - 1) > 0) {
      h.onPinchZoom(delta.scale, delta.focalClientX, delta.focalClientY);
    }
    return true;
  }, []);

  const notePointerUp = useCallback(
    (e: CanvasPointerEvent) => {
      if ((e.pointerType || 'mouse') !== 'touch') return;
      pointersRef.current.delete(e.pointerId);
      syncGestureState();
      if (pointersRef.current.size === 0) {
        const tap = tapRef.current;
        tapRef.current = null;
        if (
          tap &&
          tap.maxCount >= 2 &&
          !tap.moved &&
          now() - tap.startTs <= MULTI_TAP_MAX_MS
        ) {
          handlersRef.current.onMultiTap?.(tap.maxCount);
        }
      }
    },
    [syncGestureState],
  );

  return {
    isGesturing: () => gesturingRef.current,
    isClaimed: () => claimedRef.current,
    notePointerDown,
    notePointerMove,
    notePointerUp,
    clear,
    touchCount: () => pointersRef.current.size,
  };
}
