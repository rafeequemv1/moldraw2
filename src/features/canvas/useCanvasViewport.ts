import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Point, Viewport } from './geometry';

export interface UseCanvasViewportOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  displayScale?: number;
  onViewportChange?: (vp: Viewport) => void;
}

export interface UseCanvasViewportResult {
  viewport: Viewport;
  isPanning: boolean;
  getWorldPos: (e: { clientX: number; clientY: number }) => Point;
  beginPan: (e: { clientX: number; clientY: number }) => void;
  updatePan: (e: { clientX: number; clientY: number }) => boolean;
  endPan: () => boolean;
  /** Translate viewport by screen-space pixels (two-finger pan). */
  panByScreenDelta: (dx: number, dy: number) => void;
  /** Zoom by a multiplicative scale around a client-space focal point (pinch). */
  zoomAtClientPoint: (scale: number, clientX: number, clientY: number) => void;
  onWheel: (e: { clientX: number; clientY: number; deltaY: number }) => void;
}

/**
 * Owns the canvas viewport (pan offset + zoom) and the screen↔world coord
 * transform. Middle-button / Space drags pan; wheel and pinch zoom around
 * the focal point; two-finger drag pans on touch devices.
 *
 * Invariants:
 *   - `viewport` is the *base* transform; callers multiply by `displayScale`.
 *   - `getWorldPos` is consistent with the matrix used in `render()`:
 *       ctx.translate(W/2 + viewport.x, H/2 + viewport.y);
 *       ctx.scale(zoom * displayScale, zoom * displayScale);
 *   - Wheel events are bound non-passively here so `e.preventDefault()` works.
 */
export const useCanvasViewport = ({
  canvasRef,
  displayScale = 1,
  onViewportChange,
}: UseCanvasViewportOptions): UseCanvasViewportResult => {
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPosRef = useRef<Point>({ x: 0, y: 0 });

  const getWorldPos = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const effectiveZoom = viewport.zoom * displayScale;
      return {
        x: (screenX - canvas.width / 2 - viewport.x) / effectiveZoom,
        y: (screenY - canvas.height / 2 - viewport.y) / effectiveZoom,
      };
    },
    [viewport, displayScale, canvasRef],
  );

  const beginPan = useCallback((e: { clientX: number; clientY: number }) => {
    setIsPanning(true);
    lastPanPosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const updatePan = useCallback(
    (e: { clientX: number; clientY: number }): boolean => {
      if (!isPanning) return false;
      const dx = e.clientX - lastPanPosRef.current.x;
      const dy = e.clientY - lastPanPosRef.current.y;
      setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      lastPanPosRef.current = { x: e.clientX, y: e.clientY };
      return true;
    },
    [isPanning],
  );

  const endPan = useCallback((): boolean => {
    if (!isPanning) return false;
    setIsPanning(false);
    return true;
  }, [isPanning]);

  const panByScreenDelta = useCallback((dx: number, dy: number) => {
    setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const zoomAtClientPoint = useCallback(
    (scale: number, clientX: number, clientY: number) => {
      if (!Number.isFinite(scale) || scale <= 0) return;
      setViewport(prev => {
        const newZoom = Math.max(0.1, Math.min(10, prev.zoom * scale));
        if (newZoom === prev.zoom) return prev;
        const canvas = canvasRef.current;
        if (!canvas) return { ...prev, zoom: newZoom };
        const rect = canvas.getBoundingClientRect();
        const focalX = clientX - rect.left - canvas.width / 2;
        const focalY = clientY - rect.top - canvas.height / 2;
        const scaleRatio = newZoom / prev.zoom;
        return {
          x: focalX - (focalX - prev.x) * scaleRatio,
          y: focalY - (focalY - prev.y) * scaleRatio,
          zoom: newZoom,
        };
      });
    },
    [canvasRef],
  );

  const onWheel = useCallback(
    (e: { clientX: number; clientY: number; deltaY: number }) => {
      const zoomSensitivity = 0.001;
      const zoomDelta = -e.deltaY * zoomSensitivity;
      const scale = Math.exp(zoomDelta);
      zoomAtClientPoint(scale, e.clientX, e.clientY);
    },
    [zoomAtClientPoint],
  );

  // Bind wheel non-passively so we can preventDefault and avoid page scroll.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preventDefault = (e: WheelEvent) => e.preventDefault();
    canvas.addEventListener('wheel', preventDefault, { passive: false });
    return () => canvas.removeEventListener('wheel', preventDefault);
  }, [canvasRef]);

  useEffect(() => {
    onViewportChange?.(viewport);
  }, [viewport, onViewportChange]);

  return {
    viewport,
    isPanning,
    getWorldPos,
    beginPan,
    updatePan,
    endPan,
    panByScreenDelta,
    zoomAtClientPoint,
    onWheel,
  };
};
