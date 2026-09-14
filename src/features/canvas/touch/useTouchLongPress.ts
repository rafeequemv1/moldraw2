import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import {
  TOUCH_LONG_PRESS_MS,
  TOUCH_LONG_PRESS_SLOP_PX,
} from './constants';
import { isTouchPointer } from './palmRejection';
import type { CanvasPointerEvent } from './pointerUtils';
import type { Point } from '../geometry';

export interface UseTouchLongPressOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Called with the original pointer event + world position when long-press fires. */
  onLongPress: (e: CanvasPointerEvent, worldPos: Point) => void;
  getWorldPos: (e: { clientX: number; clientY: number }) => Point;
  enabled?: boolean;
}

export interface UseTouchLongPressResult {
  /** Call from pointerdown (touch only). */
  notePointerDown: (e: CanvasPointerEvent) => void;
  /** Call from pointermove — cancels if moved past slop. */
  notePointerMove: (e: CanvasPointerEvent) => void;
  /** Call from pointerup / cancel / multi-touch start. */
  cancel: () => void;
  /** True after long-press already opened the menu (suppress click tools). */
  didFire: () => boolean;
}

/**
 * Touch long-press → context menu (iOS/Android have no reliable right-click).
 * Cancels on movement past slop, second finger, or pointer up.
 */
export function useTouchLongPress({
  onLongPress,
  getWorldPos,
  enabled = true,
}: UseTouchLongPressOptions): UseTouchLongPressResult {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<Point | null>(null);
  const eventRef = useRef<CanvasPointerEvent | null>(null);
  const firedRef = useRef(false);

  const cancel = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
    eventRef.current = null;
  }, []);

  const notePointerDown = useCallback(
    (e: CanvasPointerEvent) => {
      cancel();
      firedRef.current = false;
      if (!enabled || !isTouchPointer(e)) return;

      startRef.current = { x: e.clientX, y: e.clientY };
      eventRef.current = e;
      timerRef.current = setTimeout(() => {
        const ev = eventRef.current;
        if (!ev) return;
        firedRef.current = true;
        onLongPress(ev, getWorldPos(ev));
        cancel();
      }, TOUCH_LONG_PRESS_MS);
    },
    [cancel, enabled, getWorldPos, onLongPress],
  );

  const notePointerMove = useCallback(
    (e: CanvasPointerEvent) => {
      const start = startRef.current;
      if (!start || timerRef.current == null) return;
      const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (dist > TOUCH_LONG_PRESS_SLOP_PX) {
        cancel();
      } else {
        eventRef.current = e;
      }
    },
    [cancel],
  );

  const didFire = useCallback(() => firedRef.current, []);

  useEffect(() => () => cancel(), [cancel]);

  return { notePointerDown, notePointerMove, cancel, didFire };
}
