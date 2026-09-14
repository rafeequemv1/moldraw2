/**
 * Reaction-arrow drawing, sampling for hit-tests, and chord-based helpers.
 */
import type { ReactionArrow, ReactionArrowKind } from '@moldraw/domain';
import { pointSegDist } from './angles';

const KIND_DEFAULT: ReactionArrowKind = 'straight';

export const getReactionArrowKind = (a: { kind?: ReactionArrowKind }): ReactionArrowKind =>
  a.kind ?? KIND_DEFAULT;

/** Default quadratic control: bump perpendicular from chord midpoint. */
export const defaultCurveControl = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { cx: number; cy: number } => {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bend = len * 0.22;
  return { cx: mx + nx * bend, cy: my + ny * bend };
};

/** Default cubic controls for an S-shaped curve along the chord. */
export const defaultSCurveControls = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { c1x: number; c1y: number; c2x: number; c2y: number } => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bend = len * 0.2;
  return {
    c1x: x1 + dx / 3 + nx * bend,
    c1y: y1 + dy / 3 + ny * bend,
    c2x: x1 + (2 * dx) / 3 - nx * bend,
    c2y: y1 + (2 * dy) / 3 - ny * bend,
  };
};

const quadPt = (
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  t: number,
): { x: number; y: number } => {
  const u = 1 - t;
  return {
    x: u * u * x0 + 2 * u * t * cx + t * t * x2,
    y: u * u * y0 + 2 * u * t * cy + t * t * y2,
  };
};

const cubicPt = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
): { x: number; y: number } => {
  const u = 1 - t;
  const u2 = u * u;
  const u3 = u2 * u;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: u3 * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t3 * p3.x,
    y: u3 * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t3 * p3.y,
  };
};

const quadTan = (
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  t: number,
): { x: number; y: number } => {
  return {
    x: 2 * (1 - t) * (cx - x0) + 2 * t * (x2 - cx),
    y: 2 * (1 - t) * (cy - y0) + 2 * t * (y2 - cy),
  };
};

const cubicTan = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
): { x: number; y: number } => {
  const u = 1 - t;
  const u2 = u * u;
  const t2 = t * t;
  return {
    x: 3 * u2 * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t2 * (p3.x - p2.x),
    y: 3 * u2 * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t2 * (p3.y - p2.y),
  };
};

const norm = (x: number, y: number): { x: number; y: number } => {
  const h = Math.hypot(x, y) || 1;
  return { x: x / h, y: y / h };
};

const pointToPolylineDist = (
  px: number,
  py: number,
  pts: { x: number; y: number }[],
): number => {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const d = pointSegDist(px, py, a.x, a.y, b.x, b.y);
    if (d < best) best = d;
  }
  return best;
};

const sampleStraight = (x1: number, y1: number, x2: number, y2: number, n: number) => {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({ x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) });
  }
  return pts;
};

const sampleQuad = (
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  n: number,
) => {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(quadPt(x1, y1, cx, cy, x2, y2, t));
  }
  return pts;
};

const sampleCubic = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  n: number,
) => {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(cubicPt(p0, p1, p2, p3, t));
  }
  return pts;
};

/** Polyline samples along the visible shaft (both directions for equilibrium). */
export const sampleReactionArrowPolyline = (a: ReactionArrow): { x: number; y: number }[] => {
  const k = getReactionArrowKind(a);
  const { x1, y1, x2, y2 } = a;
  if (k === 'straight' || k === 'retrosynthetic') {
    return sampleStraight(x1, y1, x2, y2, 24);
  }
  if (k === 'curved' || k === 'resonance' || k === 'electron_flow') {
    const { cx, cy } =
      a.cx !== undefined && a.cy !== undefined ? { cx: a.cx, cy: a.cy } : defaultCurveControl(x1, y1, x2, y2);
    return sampleQuad(x1, y1, cx, cy, x2, y2, 28);
  }
  if (k === 's_curve') {
    const c =
      a.c1x !== undefined && a.c1y !== undefined && a.c2x !== undefined && a.c2y !== undefined
        ? { p1: { x: a.c1x, y: a.c1y }, p2: { x: a.c2x, y: a.c2y } }
        : (() => {
            const d = defaultSCurveControls(x1, y1, x2, y2);
            return { p1: { x: d.c1x, y: d.c1y }, p2: { x: d.c2x, y: d.c2y } };
          })();
    return sampleCubic({ x: x1, y: y1 }, c.p1, c.p2, { x: x2, y: y2 }, 32);
  }
  if (k === 'equilibrium' || k === 'half_equilibrium') {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * 5;
    const ny = (dx / len) * 5;
    const f = sampleStraight(x1 + nx, y1 + ny, x2 + nx, y2 + ny, 16);
    const r = sampleStraight(x2 - nx, y2 - ny, x1 - nx, y1 - ny, 16);
    return [...f, ...r];
  }
  return sampleStraight(x1, y1, x2, y2, 24);
};

const drawHeadFilled = (
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  ux: number,
  uy: number,
  headLen: number,
  headW: number,
  strokeOnly: boolean,
) => {
  const px = -uy;
  const py = ux;
  const baseX = tipX - ux * headLen;
  const baseY = tipY - uy * headLen;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(baseX + px * headW, baseY + py * headW);
  ctx.lineTo(baseX - px * headW, baseY - py * headW);
  ctx.closePath();
  if (strokeOnly) ctx.stroke();
  else ctx.fill();
};

const drawShaftHeadStraight = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth: number,
  dashedGhost: boolean,
  headLen: number,
  headW: number,
  hollowHead: boolean,
) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;
  const u = norm(dx, dy);
  const baseX = x2 - u.x * headLen;
  const baseY = y2 - u.y * headLen;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (dashedGhost) ctx.setLineDash([7, 6]);
  else ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(baseX, baseY);
  ctx.stroke();
  drawHeadFilled(ctx, x2, y2, u.x, u.y, headLen, headW, hollowHead || dashedGhost);
  ctx.setLineDash([]);
};

/**
 * Single-electron / fish-hook arrowhead: one barb on the concave (inner) side of the arc,
 * matching textbook curved fish-hook notation (not a filled pair-electron head).
 * Barb side follows the chord×control sign so it does not flip while the control moves.
 */
const drawFishHookHead = (
  ctx: CanvasRenderingContext2D,
  tailX: number,
  tailY: number,
  tipX: number,
  tipY: number,
  ux: number,
  uy: number,
  cx: number,
  cy: number,
  color: string,
  lineWidth: number,
  headLen: number,
  headW: number,
  dashedGhost: boolean,
): void => {
  const baseX = tipX - ux * headLen;
  const baseY = tipY - uy * headLen;
  let px = -uy;
  let py = ux;
  const bendCross = (tipX - tailX) * (cy - tailY) - (tipY - tailY) * (cx - tailX);
  if (bendCross < 0) {
    px = -px;
    py = -py;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'miter';
  if (dashedGhost) ctx.setLineDash([6, 5]);
  else ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(baseX + px * headW * 0.95, baseY + py * headW * 0.95);
  ctx.stroke();
  ctx.setLineDash([]);
};

const drawElectronFlow = (
  ctx: CanvasRenderingContext2D,
  a: ReactionArrow,
  color: string,
  lineWidth: number,
  dashedGhost: boolean,
): void => {
  const { x1, y1, x2, y2 } = a;
  const { cx, cy } =
    a.cx !== undefined && a.cy !== undefined ? { cx: a.cx, cy: a.cy } : defaultCurveControl(x1, y1, x2, y2);
  const headLen = Math.min(18, Math.hypot(x2 - x1, y2 - y1) * 0.35) * (a.headScale ?? 1);
  const headW = 8 * (a.headScale ?? 1);
  const tEnd = quadTan(x1, y1, cx, cy, x2, y2, 1);
  const tanEnd = norm(tEnd.x, tEnd.y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  if (dashedGhost) ctx.setLineDash([6, 5]);
  else ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cx, cy, x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  drawFishHookHead(ctx, x1, y1, x2, y2, tanEnd.x, tanEnd.y, cx, cy, color, lineWidth, headLen, headW, dashedGhost);
};

const drawCurvedOrResonance = (
  ctx: CanvasRenderingContext2D,
  a: ReactionArrow,
  color: string,
  lineWidth: number,
  dashedGhost: boolean,
  resonance: boolean,
) => {
  const { x1, y1, x2, y2 } = a;
  const { cx, cy } =
    a.cx !== undefined && a.cy !== undefined ? { cx: a.cx, cy: a.cy } : defaultCurveControl(x1, y1, x2, y2);
  const headLen = Math.min(18, Math.hypot(x2 - x1, y2 - y1) * 0.35) * (a.headScale ?? 1);
  const headW = 8 * (a.headScale ?? 1);
  const tEnd = quadTan(x1, y1, cx, cy, x2, y2, 1);
  const tanEnd = norm(tEnd.x, tEnd.y);
  const tStart = quadTan(x1, y1, cx, cy, x2, y2, 0);
  const startHeadDir = norm(-tStart.x, -tStart.y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  if (resonance || dashedGhost) ctx.setLineDash([6, 5]);
  else ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cx, cy, x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  drawHeadFilled(ctx, x2, y2, tanEnd.x, tanEnd.y, headLen, headW, dashedGhost);
  if (resonance && a.doubleHead && !dashedGhost) {
    drawHeadFilled(ctx, x1, y1, startHeadDir.x, startHeadDir.y, headLen, headW, false);
  }
};

const drawSCurve = (
  ctx: CanvasRenderingContext2D,
  a: ReactionArrow,
  color: string,
  lineWidth: number,
  dashedGhost: boolean,
) => {
  const { x1, y1, x2, y2 } = a;
  const c =
    a.c1x !== undefined && a.c1y !== undefined && a.c2x !== undefined && a.c2y !== undefined
      ? { p1: { x: a.c1x, y: a.c1y }, p2: { x: a.c2x, y: a.c2y } }
      : (() => {
          const d = defaultSCurveControls(x1, y1, x2, y2);
          return { p1: { x: d.c1x, y: d.c1y }, p2: { x: d.c2x, y: d.c2y } };
        })();
  const p0 = { x: x1, y: y1 };
  const p3 = { x: x2, y: y2 };
  const headLen = Math.min(18, Math.hypot(x2 - x1, y2 - y1) * 0.35) * (a.headScale ?? 1);
  const headW = 8 * (a.headScale ?? 1);
  const te = cubicTan(p0, c.p1, c.p2, p3, 1);
  const tanEnd = norm(te.x, te.y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  if (dashedGhost) ctx.setLineDash([7, 6]);
  else ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(c.p1.x, c.p1.y, c.p2.x, c.p2.y, x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  drawHeadFilled(ctx, x2, y2, tanEnd.x, tanEnd.y, headLen, headW, dashedGhost);
};

const drawRetrosynthetic = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth: number,
  dashedGhost: boolean,
  headScale: number,
) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;
  const u = norm(dx, dy);
  const px = -u.y;
  const py = u.x;
  const headLen = Math.min(18, len * 0.35) * headScale;
  const headW = 8 * headScale;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.setLineDash(dashedGhost ? [7, 6] : [5, 5]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  const baseX = x2 - u.x * headLen;
  const baseY = y2 - u.y * headLen;
  ctx.lineTo(baseX, baseY);
  ctx.stroke();
  ctx.setLineDash([]);
  drawHeadFilled(ctx, x2, y2, u.x, u.y, headLen, headW, true);
  const t1 = 0.38;
  const t2 = 0.48;
  const bar = Math.min(12, len * 0.08);
  for (const t of [t1, t2]) {
    const bx = x1 + dx * t;
    const by = y1 + dy * t;
    ctx.beginPath();
    ctx.moveTo(bx - px * bar, by - py * bar);
    ctx.lineTo(bx + px * bar, by + py * bar);
    ctx.stroke();
  }
};

const drawEquilibrium = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth: number,
  dashedGhost: boolean,
  headScale: number,
) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;
  const u = norm(dx, dy);
  const nx = -u.y * 4.5;
  const ny = u.x * 4.5;
  const headLen = Math.min(16, len * 0.3) * headScale;
  const headW = 7 * headScale;
  const ax1 = x1 + nx;
  const ay1 = y1 + ny;
  const ax2 = x2 + nx;
  const ay2 = y2 + ny;
  const bx1 = x1 - nx;
  const by1 = y1 - ny;
  const bx2 = x2 - nx;
  const by2 = y2 - ny;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dashedGhost ? [7, 6] : []);
  drawShaftHeadStraight(ctx, ax1, ay1, ax2, ay2, color, lineWidth, dashedGhost, headLen, headW, false);
  drawShaftHeadStraight(ctx, bx2, by2, bx1, by1, color, lineWidth, dashedGhost, headLen, headW, false);
  ctx.setLineDash([]);
};

const drawHalfEquilibrium = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth: number,
  dashedGhost: boolean,
  headScale: number,
) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;
  const u = norm(dx, dy);
  const nx = -u.y * 4;
  const ny = u.x * 4;
  const headLen = Math.min(18, len * 0.32) * headScale;
  const headW = 8 * headScale;
  const ax1 = x1 + nx;
  const ay1 = y1 + ny;
  const ax2 = x2 + nx;
  const ay2 = y2 + ny;
  drawShaftHeadStraight(ctx, ax1, ay1, ax2, ay2, color, lineWidth + 0.35, dashedGhost, headLen, headW, false);
  ctx.globalAlpha = dashedGhost ? 0.45 : 0.85;
  ctx.setLineDash([5, 5]);
  drawShaftHeadStraight(ctx, x2 - nx, y2 - ny, x1 - nx, y1 - ny, color, Math.max(1, lineWidth - 0.5), dashedGhost, headLen * 0.75, headW * 0.75, true);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
};

export interface DrawReactionArrowStyle {
  color: string;
  lineWidth: number;
  dashedGhost?: boolean;
}

/**
 * Draw a full reaction arrow (all kinds). Ghost preview uses dashed strokes and
 * open heads where appropriate.
 */
export const drawReactionArrowShape = (
  ctx: CanvasRenderingContext2D,
  a: ReactionArrow,
  style: DrawReactionArrowStyle,
): void => {
  const { x1, y1, x2, y2 } = a;
  const color = a.color ?? style.color;
  const lineWidth = a.strokeWidth ?? style.lineWidth;
  const dashedGhost = style.dashedGhost ?? false;
  const hs = a.headScale ?? 1;
  const k = getReactionArrowKind(a);
  ctx.save();
  ctx.lineJoin = 'round';
  try {
    if (k === 'straight') {
      drawShaftHeadStraight(ctx, x1, y1, x2, y2, color, lineWidth, dashedGhost, 18 * hs, 8 * hs, false);
      return;
    }
    if (k === 'retrosynthetic') {
      drawRetrosynthetic(ctx, x1, y1, x2, y2, color, lineWidth, dashedGhost, hs);
      return;
    }
    if (k === 'equilibrium') {
      drawEquilibrium(ctx, x1, y1, x2, y2, color, lineWidth, dashedGhost, hs);
      return;
    }
    if (k === 'half_equilibrium') {
      drawHalfEquilibrium(ctx, x1, y1, x2, y2, color, lineWidth, dashedGhost, hs);
      return;
    }
    if (k === 'curved') {
      drawCurvedOrResonance(ctx, a, color, lineWidth, dashedGhost, false);
      return;
    }
    if (k === 'resonance') {
      drawCurvedOrResonance(ctx, a, color, lineWidth, dashedGhost, true);
      return;
    }
    if (k === 's_curve') {
      drawSCurve(ctx, a, color, lineWidth, dashedGhost);
      return;
    }
    if (k === 'electron_flow') {
      drawElectronFlow(ctx, a, color, lineWidth, dashedGhost);
      return;
    }
  } finally {
    ctx.restore();
  }
};

/** @deprecated Use `drawReactionArrowShape` with `{ kind: 'straight' }`. */
export const drawReactionArrowCanvas = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth = 2,
  dashedGhost = false,
): void => {
  drawReactionArrowShape(
    ctx,
    { id: '_', x1, y1, x2, y2, kind: 'straight' },
    { color, lineWidth, dashedGhost },
  );
};

/** Top-most arrow whose geometry is within `tol` world units of (wx, wy). */
export const pickReactionArrowAt = (
  arrows: ReactionArrow[] | undefined,
  wx: number,
  wy: number,
  tol = 14,
): ReactionArrow | null => {
  const list = arrows ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    const d = pointToPolylineDist(wx, wy, sampleReactionArrowPolyline(a));
    if (d < tol) return a;
  }
  return null;
};

export type ReactionArrowEndpoint = 'tail' | 'head' | 'curve';

/** World position of the curvature handle (on-curve point t=½, not the off-curve Bezier control). */
export const getReactionArrowCurveHandleWorld = (
  a: ReactionArrow,
): { x: number; y: number } | null => {
  const k = getReactionArrowKind(a);
  if (k === 'curved' || k === 'resonance' || k === 'electron_flow') {
    const { cx, cy } =
      a.cx !== undefined && a.cy !== undefined ? { cx: a.cx, cy: a.cy } : defaultCurveControl(a.x1, a.y1, a.x2, a.y2);
    return quadPt(a.x1, a.y1, cx, cy, a.x2, a.y2, 0.5);
  }
  if (k === 's_curve') {
    const c =
      a.c1x !== undefined && a.c1y !== undefined && a.c2x !== undefined && a.c2y !== undefined
        ? { p1: { x: a.c1x, y: a.c1y }, p2: { x: a.c2x, y: a.c2y } }
        : (() => {
            const d = defaultSCurveControls(a.x1, a.y1, a.x2, a.y2);
            return { p1: { x: d.c1x, y: d.c1y }, p2: { x: d.c2x, y: d.c2y } };
          })();
    const p0 = { x: a.x1, y: a.y1 };
    const p3 = { x: a.x2, y: a.y2 };
    return cubicPt(p0, c.p1, c.p2, p3, 0.5);
  }
  return null;
};

/** Hit-test the curvature handle (after tail/head are ruled out). */
export const pickReactionArrowCurveHandle = (
  arrows: ReactionArrow[] | undefined,
  wx: number,
  wy: number,
  tol = 16,
): { arrowId: string } | null => {
  const list = arrows ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    const h = getReactionArrowCurveHandleWorld(a);
    if (h && Math.hypot(wx - h.x, wy - h.y) <= tol) {
      return { arrowId: a.id };
    }
  }
  return null;
};

/** Top-most arrow whose tail or head handle is within `tol` of (wx, wy). */
export const pickReactionArrowEndpoint = (
  arrows: ReactionArrow[] | undefined,
  wx: number,
  wy: number,
  tol = 14,
): { arrowId: string; end: ReactionArrowEndpoint } | null => {
  const list = arrows ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    if (Math.hypot(wx - a.x1, wy - a.y1) <= tol) return { arrowId: a.id, end: 'tail' };
    if (Math.hypot(wx - a.x2, wy - a.y2) <= tol) return { arrowId: a.id, end: 'head' };
  }
  return null;
};

/** Move quadratic control or translate both cubic controls together. */
export const reactionArrowCurveHandlePatch = (
  orig: ReactionArrow,
  dx: number,
  dy: number,
): Partial<ReactionArrow> => {
  const k = getReactionArrowKind(orig);
  if (k === 'curved' || k === 'resonance' || k === 'electron_flow') {
    const x1 = orig.x1;
    const y1 = orig.y1;
    const x2 = orig.x2;
    const y2 = orig.y2;
    const base =
      orig.cx !== undefined && orig.cy !== undefined
        ? { cx: orig.cx, cy: orig.cy }
        : defaultCurveControl(x1, y1, x2, y2);
    const origMid = quadPt(x1, y1, base.cx, base.cy, x2, y2, 0.5);
    const targetMid = { x: origMid.x + dx, y: origMid.y + dy };
    // B(½) = ¼·P0 + ½·P1 + ¼·P2  ⇒  cx = 2·Mx − ½·x1 − ½·x2
    return {
      cx: 2 * targetMid.x - 0.5 * x1 - 0.5 * x2,
      cy: 2 * targetMid.y - 0.5 * y1 - 0.5 * y2,
    };
  }
  if (k === 's_curve') {
    const c =
      orig.c1x !== undefined && orig.c1y !== undefined && orig.c2x !== undefined && orig.c2y !== undefined
        ? { c1x: orig.c1x, c1y: orig.c1y, c2x: orig.c2x, c2y: orig.c2y }
        : defaultSCurveControls(orig.x1, orig.y1, orig.x2, orig.y2);
    return {
      c1x: c.c1x + dx,
      c1y: c.c1y + dy,
      c2x: c.c2x + dx,
      c2y: c.c2y + dy,
    };
  }
  return {};
};

/** Patch for dragging tail, head, or curve handle. */
export const reactionArrowEndpointResizePatch = (
  orig: ReactionArrow,
  end: ReactionArrowEndpoint,
  dx: number,
  dy: number,
): Partial<ReactionArrow> => {
  if (end === 'curve') {
    return reactionArrowCurveHandlePatch(orig, dx, dy);
  }
  if (end === 'tail') {
    const p: Partial<ReactionArrow> = { x1: orig.x1 + dx, y1: orig.y1 + dy };
    if (orig.cx !== undefined && orig.cy !== undefined) {
      p.cx = orig.cx + dx;
      p.cy = orig.cy + dy;
    }
    if (orig.c1x !== undefined && orig.c1y !== undefined) {
      p.c1x = orig.c1x + dx;
      p.c1y = orig.c1y + dy;
    }
    return p;
  }
  const p: Partial<ReactionArrow> = { x2: orig.x2 + dx, y2: orig.y2 + dy };
  if (orig.c2x !== undefined && orig.c2y !== undefined) {
    p.c2x = orig.c2x + dx;
    p.c2y = orig.c2y + dy;
  }
  return p;
};

/** Translate all stored coordinates by (dx, dy). */
export const offsetReactionArrowForDrag = (
  a: ReactionArrow,
  dx: number,
  dy: number,
): Partial<ReactionArrow> => {
  const patch: Partial<ReactionArrow> = {
    x1: a.x1 + dx,
    y1: a.y1 + dy,
    x2: a.x2 + dx,
    y2: a.y2 + dy,
  };
  if (a.cx !== undefined && a.cy !== undefined) {
    patch.cx = a.cx + dx;
    patch.cy = a.cy + dy;
  }
  if (a.c1x !== undefined && a.c1y !== undefined) {
    patch.c1x = a.c1x + dx;
    patch.c1y = a.c1y + dy;
  }
  if (a.c2x !== undefined && a.c2y !== undefined) {
    patch.c2x = a.c2x + dx;
    patch.c2y = a.c2y + dy;
  }
  return patch;
};

/** Full arrow after moving from drag snapshot. */
export const reactionArrowAfterDelta = (
  orig: ReactionArrow,
  dx: number,
  dy: number,
): ReactionArrow => ({ ...orig, ...offsetReactionArrowForDrag(orig, dx, dy) });
