import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { canvasCssSize, type Point, type Viewport } from './geometry';

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
  onWheel: (e: {
    clientX: number;
    clientY: number;
    deltaX?: number;
    deltaY: number;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
  }) => void;
  /** Reset pan/zoom to the default 100% view. */
  resetViewport: () => void;
  /** Fit a world-space AABB into the canvas (used after AI / import). */
  fitWorldRect: (
    rect: { minX: number; maxX: number; minY: number; maxY: number },
    paddingPx?: number,
  ) => void;
  /**
   * Pan (never zoom) so `rect` intersects the CSS viewport. No-op when the
   * AABB is already at least partly inside the padded view.
   */
  ensureWorldRectVisible: (
    rect: { minX: number; maxX: number; minY: number; maxY: number },
    padPx?: number,
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
 * transform. Middle-button drag pans. Wheel is Ketcher-style: Ctrl/Cmd+wheel
 * (and Chrome pinch, which reports ctrlKey) zooms at the cursor; Shift+wheel
 * pans horizontally; unmodified wheel pans (vertical from a mouse wheel;
 * both axes from a trackpad). Two-finger drag pans on touch (select-tool
 * empty-canvas touch also pans via `beginPan`). Holding Space in the App
 * temporarily switches to the hand tool so Space+drag pans.
 *
 * Invariants:
 *   - `viewport` is the *base* transform; callers multiply by `displayScale`.
 *   - `getWorldPos` is consistent with the matrix used in `render()`:
 *       W/H are CSS layout pixels (clientWidth), not backing-store size.
 *       ctx.setTransform(dpr); ctx.translate(W/2 + viewport.x, H/2 + viewport.y);
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
      const { w, h } = canvasCssSize(canvas);
      const effectiveZoom = viewport.zoom * displayScale;
      return {
        x: (local.x - w / 2 - viewport.x) / effectiveZoom,
        y: (local.y - h / 2 - viewport.y) / effectiveZoom,
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
        const { w, h } = canvasCssSize(canvas);
        const focalX = local.x - w / 2;
        const focalY = local.y - h / 2;
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
    (e: {
      clientX: number;
      clientY: number;
      deltaX?: number;
      deltaY: number;
      ctrlKey?: boolean;
      metaKey?: boolean;
      shiftKey?: boolean;
    }) => {
      // Ctrl/Cmd+wheel (and Chrome pinch, which reports ctrlKey) zoom at cursor.
      if (e.ctrlKey || e.metaKey) {
        const zoomSensitivity = 0.001;
        const zoomDelta = -e.deltaY * zoomSensitivity;
        const scale = Math.exp(zoomDelta);
        zoomAtClientPoint(scale, e.clientX, e.clientY);
        return;
      }

      const deltaX = e.deltaX ?? 0;
      const deltaY = e.deltaY;

      if (e.shiftKey) {
        // Horizontal pan only. Mouse wheels send deltaY; trackpads may send
        // deltaX. Prefer the dominant axis as X (classic Shift+mousewheel).
        const horizontal = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
        const { x: dx, y: dy } = clientDeltaToCanvasLocal(-horizontal, 0);
        panByScreenDelta(dx, dy);
        return;
      }

      // Unmodified: mouse wheel (deltaX=0) pans vertically; trackpad two-finger
      // gestures can send both axes, including a horizontal swipe as deltaX.
      const { x: dx, y: dy } = clientDeltaToCanvasLocal(-deltaX, -deltaY);
      panByScreenDelta(dx, dy);
    },
    [panByScreenDelta, zoomAtClientPoint],
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
        if (!canvas) {
          return { x: 0, y: 0, zoom: 1 };
        }
        const { w, h } = canvasCssSize(canvas);
        if (w < 8 || h < 8) {
          return { x: 0, y: 0, zoom: 1 };
        }
        const bw = Math.max(rect.maxX - rect.minX, 24);
        const bh = Math.max(rect.maxY - rect.minY, 24);
        const cx = (rect.minX + rect.maxX) / 2;
        const cy = (rect.minY + rect.maxY) / 2;
        const pad = Math.max(16, paddingPx);
        const zoomX = (w - 2 * pad) / (bw * displayScale);
        const zoomY = (h - 2 * pad) / (bh * displayScale);
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

  const ensureWorldRectVisible = useCallback(
    (
      rect: { minX: number; maxX: number; minY: number; maxY: number },
      padPx = 32,
    ) => {
      setViewport(prev => {
        const canvas = canvasRef.current;
        if (!canvas) return prev;
        const { w, h } = canvasCssSize(canvas);
        const ez = prev.zoom * displayScale;
        if (w < 8 || h < 8 || !Number.isFinite(ez) || ez <= 0) return prev;

        const minSx = w / 2 + prev.x + rect.minX * ez;
        const maxSx = w / 2 + prev.x + rect.maxX * ez;
        const minSy = h / 2 + prev.y + rect.minY * ez;
        const maxSy = h / 2 + prev.y + rect.maxY * ez;

        const pad = Math.max(8, padPx);
        const viewMinX = pad;
        const viewMaxX = w - pad;
        const viewMinY = pad;
        const viewMaxY = h - pad;

        const fullyOutside =
          maxSx < viewMinX || minSx > viewMaxX || maxSy < viewMinY || minSy > viewMaxY;
        if (!fullyOutside) return prev;

        const boxW = maxSx - minSx;
        const boxH = maxSy - minSy;
        const viewW = Math.max(1, viewMaxX - viewMinX);
        const viewH = Math.max(1, viewMaxY - viewMinY);

        let dx = 0;
        let dy = 0;
        if (boxW >= viewW) {
          dx = (viewMinX + viewMaxX) / 2 - (minSx + maxSx) / 2;
        } else if (maxSx < viewMinX) {
          dx = viewMinX - maxSx;
        } else if (minSx > viewMaxX) {
          dx = viewMaxX - minSx;
        }

        if (boxH >= viewH) {
          dy = (viewMinY + viewMaxY) / 2 - (minSy + maxSy) / 2;
        } else if (maxSy < viewMinY) {
          dy = viewMinY - maxSy;
        } else if (minSy > viewMaxY) {
          dy = viewMaxY - minSy;
        }

        if (dx === 0 && dy === 0) return prev;
        return { ...prev, x: prev.x + dx, y: prev.y + dy };
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
    ensureWorldRectVisible,
  };
};
