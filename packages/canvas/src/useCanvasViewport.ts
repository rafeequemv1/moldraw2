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
  /** Reset pan/zoom to the default 100% view. */
  resetViewport: () => void;
  /** Fit a world-space AABB into the canvas (used after AI / import). */
  fitWorldRect: (
    rect: { minX: number; maxX: number; minY: number; maxY: number },
    paddingPx?: number,
  ) => void;
}

/** Map a viewport client point into canvas layout pixels (honors CSS 90° force-rotate). */
function clientToCanvasLocal(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): Point {
  const rect = canvas.getBoundingClientRect();
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('app-force-landscape')) {
    return { x: clientY - rect.top, y: rect.width - (clientX - rect.left) };
  }
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function clientDeltaToCanvasLocal(dx: number, dy: number): Point {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('app-force-landscape')) {
    return { x: dy, y: -dx };
  }
  return { x: dx, y: dy };
}

/**
 * Owns the canvas viewport (pan offset + zoom) and the screen↔world coord
 * transform. Middle-button drag pans; wheel and pinch zoom around the focal
 * point; two-finger drag pans on touch (select-tool empty-canvas touch also
 * pans via `beginPan`). Holding Space in the App temporarily switches to the
 * hand tool so Space+drag pans.
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
      const local = clientToCanvasLocal(canvas, e.clientX, e.clientY);
      const screenX = local.x;
      const screenY = local.y;
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
      const rawDx = e.clientX - lastPanPosRef.current.x;
      const rawDy = e.clientY - lastPanPosRef.current.y;
      const { x: dx, y: dy } = clientDeltaToCanvasLocal(rawDx, rawDy);
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
        const local = clientToCanvasLocal(canvas, clientX, clientY);
        const focalX = local.x - canvas.width / 2;
        const focalY = local.y - canvas.height / 2;
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

  const resetViewport = useCallback(() => {
    setViewport({ x: 0, y: 0, zoom: 1 });
  }, []);

  const fitWorldRect = useCallback(
    (
      rect: { minX: number; maxX: number; minY: number; maxY: number },
      paddingPx = 56,
    ) => {
      setViewport(() => {
        const canvas = canvasRef.current;
        if (!canvas || canvas.width < 8 || canvas.height < 8) {
          return { x: 0, y: 0, zoom: 1 };
        }
        const bw = Math.max(rect.maxX - rect.minX, 24);
        const bh = Math.max(rect.maxY - rect.minY, 24);
        const cx = (rect.minX + rect.maxX) / 2;
        const cy = (rect.minY + rect.maxY) / 2;
        const pad = Math.max(16, paddingPx);
        const zoomX = (canvas.width - 2 * pad) / (bw * displayScale);
        const zoomY = (canvas.height - 2 * pad) / (bh * displayScale);
        const zoom = Math.max(0.2, Math.min(3.5, Math.min(zoomX, zoomY)));
        const ez = zoom * displayScale;
        return {
          zoom,
          x: -cx * ez,
          y: -cy * ez,
        };
      });
    },
    [canvasRef, displayScale],
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
    resetViewport,
    fitWorldRect,
  };
};
