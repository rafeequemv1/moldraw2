import { useCallback, useRef } from 'react';
import { PEN_COALESCE_MS, POINTER_COALESCE_MS } from './constants';
import { isPenPointer } from './palmRejection';
import type { CanvasPointerEvent } from './pointerUtils';

/**
 * Throttle high-frequency pointermove events. Pens get a shorter interval
 * for smoother freehand; touch/mouse use the default coalesce window.
 *
 * Returns true when the caller should dispatch to tools.
 */
export function usePointerCoalesce(): {
  shouldDispatchMove: (e: CanvasPointerEvent) => boolean;
  reset: () => void;
} {
  const lastTsRef = useRef(0);

  const reset = useCallback(() => {
    lastTsRef.current = 0;
  }, []);

  const shouldDispatchMove = useCallback((e: CanvasPointerEvent) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const minGap = isPenPointer(e) ? PEN_COALESCE_MS : POINTER_COALESCE_MS;
    if (now - lastTsRef.current < minGap) {
      return false;
    }
    lastTsRef.current = now;
    return true;
  }, []);

  return { shouldDispatchMove, reset };
}
