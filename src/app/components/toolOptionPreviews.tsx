import { useEffect, useRef, useState } from 'react';
import type { CanvasShapeKind, ReactionArrowKind } from '@moldraw/domain';
import { isLabGlasswareShape, isLiquidGlasswareShape } from '@moldraw/domain';
import { drawReactionArrowShape } from '@moldraw/canvas/geometry/reactionArrow';
import { strokeShapeKind } from '@moldraw/canvas/geometry/canvasShapes';
import { previewStrokeForTheme } from '../theme';

const PREVIEW = 26;

/** Re-paint toolbar canvas previews when `data-theme` changes. */
function useThemeTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const root = document.documentElement;
    const obs = new MutationObserver(() => setTick(t => t + 1));
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return tick;
}

export function ArrowKindPreview({
  kind,
  size = PREVIEW,
  headStyle,
}: {
  kind: ReactionArrowKind;
  size?: number;
  headStyle?: import('@moldraw/domain').ArrowHeadStyle;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const themeTick = useThemeTick();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = size * dpr;
    el.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const color = previewStrokeForTheme();
    const pad = Math.max(2, size * 0.12);
    drawReactionArrowShape(
      ctx,
      {
        id: '_',
        x1: pad,
        y1: size / 2,
        x2: size - pad,
        y2: size / 2,
        kind,
        headScale: 0.5,
        ...(kind === 'electron_flow'
          ? {
              headStyle: headStyle ?? 'pair',
              cx: size / 2,
              cy: size * 0.22,
            }
          : kind === 'path'
          ? {
              pathPoints: [
                { x: pad, y: size * 0.3 },
                { x: size * 0.5, y: size * 0.3 },
                { x: size * 0.5, y: size * 0.7 },
                { x: size - pad, y: size * 0.7 },
              ],
            }
          : kind === 'row_wrap'
            ? {
                pathPoints: [
                  { x: pad, y: size * 0.2 },
                  { x: size * 0.38, y: size * 0.2 },
                  { x: size * 0.38, y: size * 0.5 },
                  { x: size - pad * 2, y: size * 0.5 },
                  { x: size - pad * 2, y: size * 0.8 },
                ],
              }
            : kind === 'cycle_arc'
              ? {
                  cx: size / 2,
                  cy: -size * 0.2,
                }
              : {}),
      },
      { color, lineWidth: size > 22 ? 1.35 : 1.1 },
    );
  }, [kind, size, themeTick, headStyle]);
  return <canvas ref={ref} className="toolbar-option-preview" width={size} height={size} aria-hidden />;
}

export function ShapeKindPreview({
  kind,
  size = PREVIEW,
  className = 'toolbar-option-preview',
}: {
  kind: CanvasShapeKind;
  size?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const themeTick = useThemeTick();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = size * dpr;
    el.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const pad = Math.max(3, size * 0.12);
    const x1 = pad;
    const y1 = pad;
    const x2 = size - pad;
    const y2 = size - pad;
    const lineWidth = size > 40 ? 1.8 : 1.5;
    const strokeStyle = previewStrokeForTheme();
    if (kind === 'line') {
      strokeShapeKind(ctx, 'line', x1, y2, x2, y1, { strokeStyle, lineWidth });
    } else if (isLabGlasswareShape(kind)) {
      strokeShapeKind(ctx, kind, x1, y1, x2, y2, {
        strokeStyle,
        lineWidth,
        liquidFill: isLiquidGlasswareShape(kind)
          ? { color: '#8ecae6', level: 0.35 }
          : undefined,
      });
    } else {
      strokeShapeKind(ctx, kind, x1, y1, x2, y2, { strokeStyle, lineWidth });
    }
  }, [kind, size, themeTick]);
  return <canvas ref={ref} className={className} width={size} height={size} aria-hidden />;
}
