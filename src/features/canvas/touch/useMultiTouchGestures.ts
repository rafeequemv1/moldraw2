import { useCallback, useEffect, useRef } from 'react';
import { deltaPinchPan, pickTwoPointers, sampleTwoPointers } from './gestures';
import type { PinchPanSample, TrackedPointer } from './types';
import type { CanvasPointerEvent } from './pointerUtils';

export interface MultiTouchHandlers {
  /** Apply screen-space pan (CSS px). */
  onPan: (dx: number, dy: number) => void;
  /** Zoom by scale factor around a client-space focal point. */
  onPinchZoom: (scale: number, focalClientX: number, focalClientY: number) => void;
  /** Fired when a second finger lands — cancel in-progress single-finger tools. */
  onGestureStart?: () => void;
  /** Fired when multi-touch ends (back to ≤1 contact). */
  onGestureEnd?: () => void;
}

export interface UseMultiTouchGesturesResult {
  /** True while two+ fingers are driving pinch/pan. */
  isGesturing: () => boolean;
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
 * Tracks concurrent touch pointers and emits two-finger pan + pinch-zoom.
 * Mouse/pen are ignored here — they stay on the single-pointer drawing path.
 */
export function useMultiTouchGestures(
  handlers: MultiTouchHandlers,
): UseMultiTouchGesturesResult {
  const pointersRef = useRef(new Map<number, TrackedPointer>());
  const sampleRef = useRef<PinchPanSample | null>(null);
  const gesturingRef = useRef(false);
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const clear = useCallback(() => {
    pointersRef.current.clear();
    sampleRef.current = null;
    if (gesturingRef.current) {
      gesturingRef.current = false;
      handlersRef.current.onGestureEnd?.();
    }
  }, []);

  const syncGestureState = useCallback(() => {
    const pair = pickTwoPointers(pointersRef.current);
    if (pair) {
      sampleRef.current = sampleTwoPointers(pair[0], pair[1]);
      if (!gesturingRef.current) {
        gesturingRef.current = true;
        handlersRef.current.onGestureStart?.();
      }
    } else {
      sampleRef.current = null;
      if (gesturingRef.current) {
        gesturingRef.current = false;
        handlersRef.current.onGestureEnd?.();
      }
    }
  }, []);

  const notePointerDown = useCallback(
    (e: CanvasPointerEvent) => {
      if ((e.pointerType || 'mouse') !== 'touch') return;
      pointersRef.current.set(e.pointerId, toTracked(e));
      syncGestureState();
    },
    [syncGestureState],
  );

  const notePointerMove = useCallback((e: CanvasPointerEvent): boolean => {
    if ((e.pointerType || 'mouse') !== 'touch') return false;
    if (!pointersRef.current.has(e.pointerId)) return false;

    pointersRef.current.set(e.pointerId, toTracked(e));

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
    },
    [syncGestureState],
  );

  return {
    isGesturing: () => gesturingRef.current,
    notePointerDown,
    notePointerMove,
    notePointerUp,
    clear,
    touchCount: () => pointersRef.current.size,
  };
}
