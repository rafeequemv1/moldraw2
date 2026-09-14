/**
 * Hit-testing and canvas stroking for annotation shapes (rectangle, line, …).
 */
import type { CanvasShape, CanvasShapeKind } from '@moldraw/domain';
import { pointSegDist } from './angles';

/** Normalize drag corners to axis-aligned box (for non-line shapes). */
export const normalizeShapeBox = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { x1: number; y1: number; x2: number; y2: number } => ({
  x1: Math.min(x1, x2),
  y1: Math.min(y1, y2),
  x2: Math.max(x1, x2),
  y2: Math.max(y1, y2),
});

const distToRectEdge = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number => {
  const dx = Math.max(x1 - px, 0, px - x2);
  const dy = Math.max(y1 - py, 0, py - y2);
  if (dx === 0 && dy === 0) return 0;
  if (dx === 0) return dy;
  if (dy === 0) return dx;
  return Math.hypot(dx, dy);
};

/** Approximate hit: distance to shape outline ≤ tol (world px). */
export const hitCanvasShape = (shape: CanvasShape, wx: number, wy: number, tol = 12): boolean => {
  const sw = shape.strokeWidth * 0.5;
  const t = tol + sw;

  if (shape.kind === 'line') {
    return pointSegDist(wx, wy, shape.x1, shape.y1, shape.x2, shape.y2) <= t;
  }

  const { x1, y1, x2, y2 } = normalizeShapeBox(shape.x1, shape.y1, shape.x2, shape.y2);
  if (shape.kind === 'rectangle') {
    return distToRectEdge(wx, wy, x1, y1, x2, y2) <= t;
  }

  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rx = Math.abs(x2 - x1) / 2;
  const ry = Math.abs(y2 - y1) / 2;
  if (rx < 1e-6 || ry < 1e-6) return Math.hypot(wx - cx, wy - cy) <= t;

  if (shape.kind === 'circle') {
    const nx = (wx - cx) / rx;
    const ny = (wy - cy) / ry;
    const d = Math.abs(Math.hypot(nx, ny) - 1) * Math.min(rx, ry);
    return d <= t;
  }

  // Triangle / star / flask: bbox hit with slightly generous tol (good enough for erase)
  return wx >= x1 - t && wx <= x2 + t && wy >= y1 - t && wy <= y2 + t;
};

export const pickCanvasShapeAt = (
  shapes: CanvasShape[] | undefined,
  wx: number,
  wy: number,
): CanvasShape | null => {
  const list = shapes ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (hitCanvasShape(list[i], wx, wy)) return list[i];
  }
  return null;
};

/** Build a 5-point star path centered in the box; outer radius = min(rx, ry). */
export const starPathInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void => {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rx = Math.abs(x2 - x1) / 2;
  const ry = Math.abs(y2 - y1) / 2;
  const R = Math.min(rx, ry);
  const r = R * 0.4;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? R : r;
    const x = cx + rad * Math.cos(ang);
    const y = cy + rad * Math.sin(ang);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
};

export const trianglePathInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void => {
  const apexX = (x1 + x2) / 2;
  const apexY = y1;
  const baseLeftX = x1;
  const baseLeftY = y2;
  const baseRightX = x2;
  const baseRightY = y2;
  ctx.beginPath();
  ctx.moveTo(apexX, apexY);
  ctx.lineTo(baseRightX, baseRightY);
  ctx.lineTo(baseLeftX, baseLeftY);
  ctx.closePath();
};

/** Flask outline is always black (independent of shape.color). */
export const CONICAL_FLASK_OUTLINE = '#000000';

/**
 * Erlenmeyer flask geometry: thin rounded-rect mouth above the neck (no overlap),
 * flared body, rounded bottom corners.
 */
type FlaskGeom = {
  cx: number;
  mouthX: number;
  mouthY: number;
  mouthW: number;
  mouthH: number;
  mouthR: number;
  neckTopY: number;
  neckBotY: number;
  neckHalf: number;
  bodyTopY: number;
  bottomY: number;
  bottomHalf: number;
  cornerR: number;
};

const flaskGeomInBox = (x1: number, y1: number, x2: number, y2: number): FlaskGeom => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;

  // Thin rounded rectangle mouth, sitting just above the neck (gap so it does not overlap).
  const mouthH = Math.max(2, h * 0.028);
  const mouthW = w * 0.36;
  const mouthY = B.y1 + h * 0.02;
  const mouthGap = Math.max(1.5, h * 0.012);
  const mouthR = Math.min(mouthH * 0.45, mouthW * 0.12);

  const neckHalf = w * 0.095;
  const neckTopY = mouthY + mouthH + mouthGap;
  const neckBotY = B.y1 + h * 0.3;
  const bodyTopY = neckBotY;
  const bottomY = B.y2 - h * 0.05;
  const bottomHalf = w * 0.44;
  const cornerR = Math.min(w, h) * 0.1;

  return {
    cx,
    mouthX: cx - mouthW / 2,
    mouthY,
    mouthW,
    mouthH,
    mouthR,
    neckTopY,
    neckBotY,
    neckHalf,
    bodyTopY,
    bottomY,
    bottomHalf,
    cornerR,
  };
};

const roundRectPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void => {
  const rr = Math.min(r, w / 2, h / 2);
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, rr);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
};

/** Closed body path (neck + cone + rounded base), excluding mouth. */
export const conicalFlaskBodyPath = (ctx: CanvasRenderingContext2D, g: FlaskGeom): void => {
  const leftNeck = g.cx - g.neckHalf;
  const rightNeck = g.cx + g.neckHalf;
  const leftBot = g.cx - g.bottomHalf;
  const rightBot = g.cx + g.bottomHalf;
  const r = Math.min(g.cornerR, g.bottomHalf * 0.5, (g.bottomY - g.bodyTopY) * 0.4);

  ctx.beginPath();
  ctx.moveTo(leftNeck, g.neckTopY);
  ctx.lineTo(leftNeck, g.neckBotY);
  ctx.lineTo(leftBot, g.bottomY - r);
  ctx.quadraticCurveTo(leftBot, g.bottomY, leftBot + r, g.bottomY);
  ctx.lineTo(rightBot - r, g.bottomY);
  ctx.quadraticCurveTo(rightBot, g.bottomY, rightBot, g.bottomY - r);
  ctx.lineTo(rightNeck, g.neckBotY);
  ctx.lineTo(rightNeck, g.neckTopY);
  ctx.closePath();
};

export const conicalFlaskPathInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void => {
  conicalFlaskBodyPath(ctx, flaskGeomInBox(x1, y1, x2, y2));
};

/**
 * Full Erlenmeyer draw: glass fill, solid liquid, thin rounded-rect mouth, black outline.
 */
export const drawConicalFlaskInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: {
    strokeStyle: string;
    lineWidth: number;
    liquidColor: string;
    liquidLevel: number;
    outlineOnly?: boolean;
  },
): void => {
  const g = flaskGeomInBox(x1, y1, x2, y2);
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  const outline = CONICAL_FLASK_OUTLINE;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  if (!opts.outlineOnly && level > 1e-4) {
    // Liquid only — empty glass stays transparent
    const bodyH = Math.max(g.bottomY - g.bodyTopY, 1e-6);
    const fillY = g.bottomY - bodyH * level;

    ctx.save();
    conicalFlaskBodyPath(ctx, g);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(B.x1 - 2, fillY, B.x2 - B.x1 + 4, g.bottomY - fillY + 4);
    ctx.fillStyle = opts.liquidColor;
    ctx.fill();
    ctx.restore();
  }

  // Thin rounded-rect mouth above the neck (stroke only)
  roundRectPath(ctx, g.mouthX, g.mouthY, g.mouthW, g.mouthH, g.mouthR);
  ctx.strokeStyle = outline;
  ctx.stroke();

  // Body outline
  conicalFlaskBodyPath(ctx, g);
  ctx.stroke();

  ctx.restore();
};

/**
 * Griffin beaker: straight walls, flat base, thin rim above the body (no spout).
 */
type BeakerGeom = {
  cx: number;
  bodyTopY: number;
  bottomY: number;
  leftX: number;
  rightX: number;
  mouthX: number;
  mouthY: number;
  mouthW: number;
  mouthH: number;
  mouthR: number;
  cornerR: number;
};

const beakerGeomInBox = (x1: number, y1: number, x2: number, y2: number): BeakerGeom => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;

  const mouthH = Math.max(2, h * 0.03);
  const mouthW = w * 0.72;
  const mouthY = B.y1 + h * 0.02;
  const mouthGap = Math.max(1.5, h * 0.012);
  const mouthR = Math.min(mouthH * 0.45, mouthW * 0.08);

  const bodyTopY = mouthY + mouthH + mouthGap;
  const bottomY = B.y2 - h * 0.04;
  const half = w * 0.34;
  const leftX = cx - half;
  const rightX = cx + half;
  const cornerR = Math.min(w, h) * 0.06;

  return {
    cx,
    bodyTopY,
    bottomY,
    leftX,
    rightX,
    mouthX: cx - mouthW / 2,
    mouthY,
    mouthW,
    mouthH,
    mouthR,
    cornerR,
  };
};

export const beakerBodyPath = (ctx: CanvasRenderingContext2D, g: BeakerGeom): void => {
  const r = Math.min(g.cornerR, (g.rightX - g.leftX) * 0.2, (g.bottomY - g.bodyTopY) * 0.25);
  ctx.beginPath();
  ctx.moveTo(g.leftX, g.bodyTopY);
  ctx.lineTo(g.leftX, g.bottomY - r);
  ctx.quadraticCurveTo(g.leftX, g.bottomY, g.leftX + r, g.bottomY);
  ctx.lineTo(g.rightX - r, g.bottomY);
  ctx.quadraticCurveTo(g.rightX, g.bottomY, g.rightX, g.bottomY - r);
  ctx.lineTo(g.rightX, g.bodyTopY);
  ctx.closePath();
};

export const drawBeakerInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: {
    lineWidth: number;
    liquidColor: string;
    liquidLevel: number;
    outlineOnly?: boolean;
  },
): void => {
  const g = beakerGeomInBox(x1, y1, x2, y2);
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  const outline = CONICAL_FLASK_OUTLINE;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  if (!opts.outlineOnly && level > 1e-4) {
    const bodyH = Math.max(g.bottomY - g.bodyTopY, 1e-6);
    const fillY = g.bottomY - bodyH * level;
    ctx.save();
    beakerBodyPath(ctx, g);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(B.x1 - 2, fillY, B.x2 - B.x1 + 4, g.bottomY - fillY + 4);
    ctx.fillStyle = opts.liquidColor;
    ctx.fill();
    ctx.restore();
  }

  // Rim above body (stroke only)
  roundRectPath(ctx, g.mouthX, g.mouthY, g.mouthW, g.mouthH, g.mouthR);
  ctx.stroke();

  beakerBodyPath(ctx, g);
  ctx.stroke();

  ctx.restore();
};

/**
 * Test tube: tall thin cylinder, U-shaped bottom, thin rim above the open end.
 */
type TestTubeGeom = {
  cx: number;
  bodyTopY: number;
  bottomY: number;
  leftX: number;
  rightX: number;
  mouthX: number;
  mouthY: number;
  mouthW: number;
  mouthH: number;
  mouthR: number;
  bottomR: number;
};

const testTubeGeomInBox = (x1: number, y1: number, x2: number, y2: number): TestTubeGeom => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;

  const mouthH = Math.max(2, h * 0.025);
  const half = Math.min(w * 0.18, h * 0.12);
  const mouthW = half * 2.15;
  const mouthY = B.y1 + h * 0.02;
  const mouthGap = Math.max(1.5, h * 0.01);
  const mouthR = Math.min(mouthH * 0.45, mouthW * 0.12);

  const bodyTopY = mouthY + mouthH + mouthGap;
  const bottomY = B.y2 - h * 0.03;
  const bottomR = half;

  return {
    cx,
    bodyTopY,
    bottomY,
    leftX: cx - half,
    rightX: cx + half,
    mouthX: cx - mouthW / 2,
    mouthY,
    mouthW,
    mouthH,
    mouthR,
    bottomR,
  };
};

export const testTubeBodyPath = (ctx: CanvasRenderingContext2D, g: TestTubeGeom): void => {
  const r = Math.min(g.bottomR, (g.bottomY - g.bodyTopY) * 0.45);
  ctx.beginPath();
  ctx.moveTo(g.leftX, g.bodyTopY);
  ctx.lineTo(g.leftX, g.bottomY - r);
  ctx.quadraticCurveTo(g.leftX, g.bottomY, g.cx, g.bottomY);
  ctx.quadraticCurveTo(g.rightX, g.bottomY, g.rightX, g.bottomY - r);
  ctx.lineTo(g.rightX, g.bodyTopY);
  ctx.closePath();
};

export const drawTestTubeInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: {
    lineWidth: number;
    liquidColor: string;
    liquidLevel: number;
    outlineOnly?: boolean;
  },
): void => {
  const g = testTubeGeomInBox(x1, y1, x2, y2);
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  const outline = CONICAL_FLASK_OUTLINE;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  if (!opts.outlineOnly && level > 1e-4) {
    const bodyH = Math.max(g.bottomY - g.bodyTopY, 1e-6);
    const fillY = g.bottomY - bodyH * level;
    ctx.save();
    testTubeBodyPath(ctx, g);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(B.x1 - 2, fillY, B.x2 - B.x1 + 4, g.bottomY - fillY + 4);
    ctx.fillStyle = opts.liquidColor;
    ctx.fill();
    ctx.restore();
  }

  roundRectPath(ctx, g.mouthX, g.mouthY, g.mouthW, g.mouthH, g.mouthR);
  ctx.stroke();

  testTubeBodyPath(ctx, g);
  ctx.stroke();

  ctx.restore();
};

/** Round-bottom flask: spherical body, neck, thin rim, simple stopper. */
type RbfGeom = {
  cx: number;
  ballCy: number;
  ballR: number;
  neckTopY: number;
  neckBotY: number;
  neckHalf: number;
  mouthX: number;
  mouthY: number;
  mouthW: number;
  mouthH: number;
  mouthR: number;
  stopperW: number;
  stopperH: number;
};

const rbfGeomInBox = (x1: number, y1: number, x2: number, y2: number): RbfGeom => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;

  const mouthH = Math.max(2, h * 0.028);
  const mouthW = w * 0.22;
  const mouthY = B.y1 + h * 0.02;
  const mouthGap = Math.max(1.2, h * 0.01);
  const neckTopY = mouthY + mouthH + mouthGap;
  const neckHalf = w * 0.08;
  const ballR = Math.min(w * 0.42, h * 0.38);
  const ballCy = B.y2 - ballR - h * 0.04;
  const neckBotY = ballCy - ballR * 0.55;
  const stopperH = Math.max(3, h * 0.06);
  const stopperW = mouthW * 0.55;

  return {
    cx,
    ballCy,
    ballR,
    neckTopY,
    neckBotY,
    neckHalf,
    mouthX: cx - mouthW / 2,
    mouthY,
    mouthW,
    mouthH,
    mouthR: Math.min(mouthH * 0.45, mouthW * 0.15),
    stopperW,
    stopperH,
  };
};

export const drawRoundBottomFlaskInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: {
    lineWidth: number;
    liquidColor: string;
    liquidLevel: number;
    outlineOnly?: boolean;
  },
): void => {
  const g = rbfGeomInBox(x1, y1, x2, y2);
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  const outline = CONICAL_FLASK_OUTLINE;
  const left = g.cx - g.neckHalf;
  const right = g.cx + g.neckHalf;
  // Where neck meets the sphere (canvas y increases downward)
  const joinY = g.ballCy - Math.sqrt(Math.max(0, g.ballR * g.ballR - g.neckHalf * g.neckHalf));

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  if (!opts.outlineOnly && level > 1e-4) {
    const ballTop = g.ballCy - g.ballR;
    const ballBot = g.ballCy + g.ballR;
    const fillY = ballBot - (ballBot - ballTop) * level;
    ctx.save();
    ctx.beginPath();
    ctx.arc(g.cx, g.ballCy, g.ballR, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(B.x1 - 2, fillY, B.x2 - B.x1 + 4, ballBot - fillY + 4);
    ctx.fillStyle = opts.liquidColor;
    ctx.fill();
    ctx.restore();
  }

  // Rim + stopper
  roundRectPath(ctx, g.mouthX, g.mouthY, g.mouthW, g.mouthH, g.mouthR);
  ctx.stroke();
  const sx = g.cx - g.stopperW / 2;
  const sy = g.mouthY - g.stopperH * 0.55;
  roundRectPath(ctx, sx, sy, g.stopperW, g.stopperH, Math.min(g.stopperH * 0.35, g.stopperW * 0.25));
  ctx.stroke();

  // Neck
  ctx.beginPath();
  ctx.moveTo(left, g.neckTopY);
  ctx.lineTo(left, joinY);
  ctx.moveTo(right, g.neckTopY);
  ctx.lineTo(right, joinY);
  ctx.stroke();

  // Spherical body
  ctx.beginPath();
  ctx.arc(g.cx, g.ballCy, g.ballR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
};

/** Liebig-style condenser: jacketed vertical tube with joint flares. */
export const drawCondenserInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;

  const outerHalf = w * 0.28;
  const innerHalf = w * 0.1;
  const top = B.y1 + h * 0.08;
  const bot = B.y2 - h * 0.08;
  const jacketTop = top + h * 0.12;
  const jacketBot = bot - h * 0.12;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  // Outer jacket
  ctx.beginPath();
  ctx.rect(cx - outerHalf, jacketTop, outerHalf * 2, jacketBot - jacketTop);
  ctx.stroke();

  // Inner tube
  ctx.beginPath();
  ctx.moveTo(cx - innerHalf, top);
  ctx.lineTo(cx - innerHalf, bot);
  ctx.moveTo(cx + innerHalf, top);
  ctx.lineTo(cx + innerHalf, bot);
  ctx.stroke();

  // Top joint flare
  ctx.beginPath();
  ctx.moveTo(cx - innerHalf, top);
  ctx.lineTo(cx - outerHalf * 0.7, top - h * 0.04);
  ctx.lineTo(cx + outerHalf * 0.7, top - h * 0.04);
  ctx.lineTo(cx + innerHalf, top);
  ctx.stroke();

  // Bottom joint flare
  ctx.beginPath();
  ctx.moveTo(cx - innerHalf, bot);
  ctx.lineTo(cx - outerHalf * 0.7, bot + h * 0.04);
  ctx.lineTo(cx + outerHalf * 0.7, bot + h * 0.04);
  ctx.lineTo(cx + innerHalf, bot);
  ctx.stroke();

  // Side hose stubs on jacket
  const stubY1 = jacketTop + (jacketBot - jacketTop) * 0.22;
  const stubY2 = jacketTop + (jacketBot - jacketTop) * 0.78;
  ctx.beginPath();
  ctx.moveTo(cx + outerHalf, stubY1);
  ctx.lineTo(cx + outerHalf + w * 0.12, stubY1);
  ctx.moveTo(cx - outerHalf, stubY2);
  ctx.lineTo(cx - outerHalf - w * 0.12, stubY2);
  ctx.stroke();

  ctx.restore();
};

/** Separatory funnel: pear body, neck, rim, stopcock. */
type SepFunnelGeom = {
  cx: number;
  neckTopY: number;
  neckBotY: number;
  neckHalf: number;
  bodyTopY: number;
  waistY: number;
  tipY: number;
  bodyHalf: number;
  tipHalf: number;
  mouthX: number;
  mouthY: number;
  mouthW: number;
  mouthH: number;
  mouthR: number;
  cockY: number;
  cockW: number;
};

const sepFunnelGeomInBox = (x1: number, y1: number, x2: number, y2: number): SepFunnelGeom => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;

  const mouthH = Math.max(2, h * 0.028);
  const mouthW = w * 0.28;
  const mouthY = B.y1 + h * 0.02;
  const mouthGap = Math.max(1.2, h * 0.01);
  const neckTopY = mouthY + mouthH + mouthGap;
  const neckHalf = w * 0.09;
  const neckBotY = B.y1 + h * 0.22;
  const bodyTopY = neckBotY;
  const waistY = B.y1 + h * 0.55;
  const tipY = B.y2 - h * 0.14;
  const cockY = tipY + h * 0.04;
  const bodyHalf = w * 0.4;
  const tipHalf = w * 0.06;

  return {
    cx,
    neckTopY,
    neckBotY,
    neckHalf,
    bodyTopY,
    waistY,
    tipY,
    bodyHalf,
    tipHalf,
    mouthX: cx - mouthW / 2,
    mouthY,
    mouthW,
    mouthH,
    mouthR: Math.min(mouthH * 0.45, mouthW * 0.15),
    cockY,
    cockW: w * 0.22,
  };
};

export const sepFunnelBodyPath = (ctx: CanvasRenderingContext2D, g: SepFunnelGeom): void => {
  const leftN = g.cx - g.neckHalf;
  const rightN = g.cx + g.neckHalf;
  ctx.beginPath();
  ctx.moveTo(leftN, g.neckTopY);
  ctx.lineTo(leftN, g.neckBotY);
  // Pear: bulge then taper to tip
  ctx.quadraticCurveTo(g.cx - g.bodyHalf, g.waistY, g.cx - g.tipHalf, g.tipY);
  ctx.lineTo(g.cx + g.tipHalf, g.tipY);
  ctx.quadraticCurveTo(g.cx + g.bodyHalf, g.waistY, rightN, g.neckBotY);
  ctx.lineTo(rightN, g.neckTopY);
  ctx.closePath();
};

export const drawSeparatoryFunnelInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: {
    lineWidth: number;
    liquidColor: string;
    liquidLevel: number;
    outlineOnly?: boolean;
  },
): void => {
  const g = sepFunnelGeomInBox(x1, y1, x2, y2);
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  const outline = CONICAL_FLASK_OUTLINE;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  if (!opts.outlineOnly && level > 1e-4) {
    const bodyH = Math.max(g.tipY - g.bodyTopY, 1e-6);
    const fillY = g.tipY - bodyH * level;
    ctx.save();
    sepFunnelBodyPath(ctx, g);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(B.x1 - 2, fillY, B.x2 - B.x1 + 4, g.tipY - fillY + 4);
    ctx.fillStyle = opts.liquidColor;
    ctx.fill();
    ctx.restore();
  }

  roundRectPath(ctx, g.mouthX, g.mouthY, g.mouthW, g.mouthH, g.mouthR);
  ctx.stroke();

  sepFunnelBodyPath(ctx, g);
  ctx.stroke();

  // Stopcock: short stem + horizontal key
  ctx.beginPath();
  ctx.moveTo(g.cx, g.tipY);
  ctx.lineTo(g.cx, g.cockY + (B.y2 - g.cockY) * 0.5);
  ctx.moveTo(g.cx - g.cockW / 2, g.cockY);
  ctx.lineTo(g.cx + g.cockW / 2, g.cockY);
  ctx.stroke();

  ctx.restore();
};

/** Simple conical filter funnel with short stem. */
export const drawFilterFunnelInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;

  const rimY = B.y1 + h * 0.08;
  const rimHalf = w * 0.42;
  const coneBotY = B.y1 + h * 0.62;
  const stemHalf = w * 0.07;
  const stemBot = B.y2 - h * 0.06;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  // Cone
  ctx.beginPath();
  ctx.moveTo(cx - rimHalf, rimY);
  ctx.lineTo(cx + rimHalf, rimY);
  ctx.lineTo(cx + stemHalf, coneBotY);
  ctx.lineTo(cx - stemHalf, coneBotY);
  ctx.closePath();
  ctx.stroke();

  // Stem
  ctx.beginPath();
  ctx.moveTo(cx - stemHalf, coneBotY);
  ctx.lineTo(cx - stemHalf, stemBot);
  ctx.lineTo(cx + stemHalf, stemBot);
  ctx.lineTo(cx + stemHalf, coneBotY);
  ctx.stroke();

  // Rim lip (thin rounded bar above cone)
  const lipH = Math.max(2, h * 0.03);
  roundRectPath(ctx, cx - rimHalf, rimY - lipH - h * 0.01, rimHalf * 2, lipH, lipH * 0.4);
  ctx.stroke();

  ctx.restore();
};

type LiquidOpts = {
  lineWidth: number;
  liquidColor: string;
  liquidLevel: number;
  outlineOnly?: boolean;
};

/** Addition / dropping funnel with pressure-equalizing sidearm. */
export const drawDroppingFunnelInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));

  const mouthY = B.y1 + h * 0.04;
  const mouthW = w * 0.28;
  const mouthH = Math.max(2, h * 0.025);
  const resTop = mouthY + mouthH + h * 0.02;
  const resBot = B.y1 + h * 0.55;
  const resHalf = w * 0.22;
  const stemHalf = w * 0.06;
  const cockY = B.y1 + h * 0.72;
  const stemBot = B.y2 - h * 0.05;
  const peX = cx + resHalf;
  const peTop = resTop + h * 0.08;
  const peBot = resBot - h * 0.08;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  if (!opts.outlineOnly && level > 1e-4) {
    const fillY = resBot - (resBot - resTop) * level;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - resHalf, resTop);
    ctx.lineTo(cx + resHalf, resTop);
    ctx.lineTo(cx + resHalf, resBot);
    ctx.lineTo(cx - resHalf, resBot);
    ctx.closePath();
    ctx.clip();
    ctx.beginPath();
    ctx.rect(B.x1 - 2, fillY, w + 4, resBot - fillY + 2);
    ctx.fillStyle = opts.liquidColor;
    ctx.fill();
    ctx.restore();
  }

  roundRectPath(ctx, cx - mouthW / 2, mouthY, mouthW, mouthH, mouthH * 0.4);
  ctx.stroke();

  // Reservoir
  ctx.beginPath();
  ctx.moveTo(cx - resHalf, resTop);
  ctx.lineTo(cx - resHalf, resBot);
  ctx.lineTo(cx - stemHalf, resBot + h * 0.04);
  ctx.moveTo(cx + resHalf, resTop);
  ctx.lineTo(cx + resHalf, resBot);
  ctx.lineTo(cx + stemHalf, resBot + h * 0.04);
  ctx.moveTo(cx - resHalf, resTop);
  ctx.lineTo(cx + resHalf, resTop);
  ctx.stroke();

  // Stem + stopcock
  ctx.beginPath();
  ctx.moveTo(cx - stemHalf, resBot + h * 0.04);
  ctx.lineTo(cx - stemHalf, stemBot);
  ctx.moveTo(cx + stemHalf, resBot + h * 0.04);
  ctx.lineTo(cx + stemHalf, stemBot);
  ctx.moveTo(cx - w * 0.12, cockY);
  ctx.lineTo(cx + w * 0.12, cockY);
  ctx.stroke();

  // Pressure-equalizing sidearm (loop to neck)
  ctx.beginPath();
  ctx.moveTo(peX, peBot);
  ctx.lineTo(peX + w * 0.14, peBot);
  ctx.lineTo(peX + w * 0.14, peTop);
  ctx.lineTo(cx + mouthW * 0.35, peTop);
  ctx.stroke();

  ctx.restore();
};

/** Three-neck round-bottom flask. */
export const drawThreeNeckRbfInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));

  const ballR = Math.min(w * 0.36, h * 0.36);
  const ballCy = B.y2 - ballR - h * 0.06;
  const neckHalf = w * 0.055;
  const centerNeckTop = B.y1 + h * 0.08;
  const sideNeckLen = h * 0.22;
  const sideAngle = 0.55; // radians from vertical

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  if (!opts.outlineOnly && level > 1e-4) {
    const ballTop = ballCy - ballR;
    const ballBot = ballCy + ballR;
    const fillY = ballBot - (ballBot - ballTop) * level;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, ballCy, ballR, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(B.x1 - 2, fillY, w + 4, ballBot - fillY + 4);
    ctx.fillStyle = opts.liquidColor;
    ctx.fill();
    ctx.restore();
  }

  const joinY = ballCy - Math.sqrt(Math.max(0, ballR * ballR - neckHalf * neckHalf));

  // Center neck + rim
  ctx.beginPath();
  ctx.moveTo(cx - neckHalf, centerNeckTop);
  ctx.lineTo(cx - neckHalf, joinY);
  ctx.moveTo(cx + neckHalf, centerNeckTop);
  ctx.lineTo(cx + neckHalf, joinY);
  ctx.stroke();
  roundRectPath(
    ctx,
    cx - neckHalf * 1.6,
    centerNeckTop - h * 0.02,
    neckHalf * 3.2,
    Math.max(2, h * 0.03),
    2,
  );
  ctx.stroke();

  // Side necks (left / right, angled)
  for (const sign of [-1, 1] as const) {
    const baseX = cx + sign * ballR * 0.55;
    const baseY = ballCy - ballR * 0.35;
    const tipX = baseX + sign * Math.sin(sideAngle) * sideNeckLen;
    const tipY = baseY - Math.cos(sideAngle) * sideNeckLen;
    const ox = -sign * Math.cos(sideAngle) * neckHalf;
    const oy = -Math.sin(sideAngle) * neckHalf;
    ctx.beginPath();
    ctx.moveTo(baseX + ox, baseY + oy);
    ctx.lineTo(tipX + ox, tipY + oy);
    ctx.moveTo(baseX - ox, baseY - oy);
    ctx.lineTo(tipX - ox, tipY - oy);
    ctx.stroke();
    // Rim at tip
    ctx.beginPath();
    ctx.moveTo(tipX + ox * 1.4, tipY + oy * 1.4);
    ctx.lineTo(tipX - ox * 1.4, tipY - oy * 1.4);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(cx, ballCy, ballR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
};

/** Büchner / filter flask with vacuum sidearm. */
export const drawBuchnerFlaskInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));

  const mouthY = B.y1 + h * 0.04;
  const mouthW = w * 0.22;
  const mouthH = Math.max(2, h * 0.03);
  const neckBot = B.y1 + h * 0.22;
  const neckHalf = w * 0.08;
  const bodyTop = neckBot + h * 0.02;
  const bodyBot = B.y2 - h * 0.06;
  const bodyTopHalf = w * 0.18;
  const bodyBotHalf = w * 0.4;
  const armY = bodyTop + (bodyBot - bodyTop) * 0.28;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(cx - bodyTopHalf, bodyTop);
    ctx.lineTo(cx - bodyBotHalf, bodyBot);
    ctx.lineTo(cx + bodyBotHalf, bodyBot);
    ctx.lineTo(cx + bodyTopHalf, bodyTop);
    ctx.closePath();
  };

  if (!opts.outlineOnly && level > 1e-4) {
    const fillY = bodyBot - (bodyBot - bodyTop) * level;
    ctx.save();
    bodyPath();
    ctx.clip();
    ctx.beginPath();
    ctx.rect(B.x1 - 2, fillY, w + 4, bodyBot - fillY + 2);
    ctx.fillStyle = opts.liquidColor;
    ctx.fill();
    ctx.restore();
  }

  roundRectPath(ctx, cx - mouthW / 2, mouthY, mouthW, mouthH, mouthH * 0.4);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - neckHalf, mouthY + mouthH);
  ctx.lineTo(cx - neckHalf, neckBot);
  ctx.moveTo(cx + neckHalf, mouthY + mouthH);
  ctx.lineTo(cx + neckHalf, neckBot);
  ctx.stroke();

  bodyPath();
  ctx.stroke();

  // Sidearm
  const armX0 = cx + bodyTopHalf + (bodyBotHalf - bodyTopHalf) * 0.28;
  ctx.beginPath();
  ctx.moveTo(armX0, armY);
  ctx.lineTo(B.x2 - w * 0.06, armY);
  ctx.lineTo(B.x2 - w * 0.06, armY + h * 0.06);
  ctx.stroke();

  ctx.restore();
};

/** Claisen Y-adapter. */
export const drawClaisenAdapterInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const tube = w * 0.08;

  const topY = B.y1 + h * 0.08;
  const forkY = B.y1 + h * 0.45;
  const botY = B.y2 - h * 0.08;
  const sideTipX = B.x2 - w * 0.12;
  const sideTipY = B.y1 + h * 0.18;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  // Vertical trunk
  ctx.beginPath();
  ctx.moveTo(cx - tube, topY);
  ctx.lineTo(cx - tube, botY);
  ctx.moveTo(cx + tube, topY);
  ctx.lineTo(cx + tube, botY);
  ctx.stroke();

  // Top joint flare
  ctx.beginPath();
  ctx.moveTo(cx - tube * 1.6, topY);
  ctx.lineTo(cx + tube * 1.6, topY);
  ctx.stroke();

  // Bottom joint flare
  ctx.beginPath();
  ctx.moveTo(cx - tube * 1.6, botY);
  ctx.lineTo(cx + tube * 1.6, botY);
  ctx.stroke();

  // Angled side arm
  ctx.beginPath();
  ctx.moveTo(cx + tube, forkY);
  ctx.lineTo(sideTipX - tube * 0.3, sideTipY + tube);
  ctx.moveTo(cx + tube * 0.2, forkY - tube);
  ctx.lineTo(sideTipX - tube * 0.3, sideTipY - tube);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sideTipX - tube * 1.2, sideTipY - tube * 1.2);
  ctx.lineTo(sideTipX + tube * 0.4, sideTipY + tube * 0.2);
  ctx.stroke();

  ctx.restore();
};

/** Distillation / still head with takeoff. */
export const drawDistillationHeadInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const tube = w * 0.09;

  const topY = B.y1 + h * 0.1;
  const elbowY = B.y1 + h * 0.42;
  const botY = B.y2 - h * 0.1;
  const takeX = B.x2 - w * 0.1;
  const takeY = elbowY;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  // Vertical
  ctx.beginPath();
  ctx.moveTo(cx - tube, topY);
  ctx.lineTo(cx - tube, botY);
  ctx.moveTo(cx + tube, topY);
  ctx.lineTo(cx + tube, elbowY);
  ctx.stroke();

  // Top / bottom flares
  ctx.beginPath();
  ctx.moveTo(cx - tube * 1.5, topY);
  ctx.lineTo(cx + tube * 1.5, topY);
  ctx.moveTo(cx - tube * 1.5, botY);
  ctx.lineTo(cx + tube * 1.5, botY);
  ctx.stroke();

  // Takeoff bend to the right
  ctx.beginPath();
  ctx.moveTo(cx + tube, elbowY);
  ctx.quadraticCurveTo(cx + tube, takeY, takeX, takeY);
  ctx.moveTo(cx + tube, elbowY + tube * 1.6);
  ctx.quadraticCurveTo(cx + w * 0.2, takeY + tube * 1.6, takeX, takeY + tube * 1.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(takeX, takeY);
  ctx.lineTo(takeX, takeY + tube * 1.6);
  ctx.stroke();

  ctx.restore();
};

/** Compact receiving RBF. */
export const drawReceivingFlaskInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  // Same silhouette as RBF but slightly shorter neck (compact receiver look).
  drawRoundBottomFlaskInBox(ctx, x1, y1, x2, y2, opts);
};

/** Dean–Stark azeotropic trap. */
export const drawDeanStarkTrapInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  const tube = w * 0.1;

  const topY = B.y1 + h * 0.06;
  const trapTop = B.y1 + h * 0.35;
  const trapBot = B.y2 - h * 0.12;
  const trapHalf = w * 0.28;
  const returnX = cx - trapHalf - w * 0.08;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  if (!opts.outlineOnly && level > 1e-4) {
    const fillY = trapBot - (trapBot - trapTop) * level;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - trapHalf, trapTop);
    ctx.lineTo(cx - trapHalf, trapBot);
    ctx.lineTo(cx + trapHalf, trapBot);
    ctx.lineTo(cx + trapHalf, trapTop);
    ctx.closePath();
    ctx.clip();
    ctx.beginPath();
    ctx.rect(B.x1 - 2, fillY, w + 4, trapBot - fillY + 2);
    ctx.fillStyle = opts.liquidColor;
    ctx.fill();
    ctx.restore();
  }

  // Upper joint (to condenser)
  ctx.beginPath();
  ctx.moveTo(cx - tube, topY);
  ctx.lineTo(cx - tube, trapTop);
  ctx.moveTo(cx + tube, topY);
  ctx.lineTo(cx + tube, trapTop);
  ctx.moveTo(cx - tube * 1.5, topY);
  ctx.lineTo(cx + tube * 1.5, topY);
  ctx.stroke();

  // Trap body
  ctx.beginPath();
  ctx.moveTo(cx - trapHalf, trapTop);
  ctx.lineTo(cx - trapHalf, trapBot);
  ctx.lineTo(cx + trapHalf, trapBot);
  ctx.lineTo(cx + trapHalf, trapTop);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - trapHalf, trapTop);
  ctx.lineTo(cx + trapHalf, trapTop);
  ctx.stroke();

  // Side takeoff / return arm toward flask
  ctx.beginPath();
  ctx.moveTo(cx - trapHalf, trapTop + h * 0.08);
  ctx.lineTo(returnX, trapTop + h * 0.08);
  ctx.lineTo(returnX, B.y2 - h * 0.05);
  ctx.stroke();

  // Drain tip under trap
  ctx.beginPath();
  ctx.moveTo(cx, trapBot);
  ctx.lineTo(cx, B.y2 - h * 0.02);
  ctx.stroke();

  ctx.restore();
};

/** Graduated cylinder with spout and tick marks. */
export const drawGraduatedCylinderInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  const half = w * 0.28;
  const top = B.y1 + h * 0.08;
  const bot = B.y2 - h * 0.06;
  const baseY = bot - h * 0.04;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  if (!opts.outlineOnly && level > 1e-4) {
    const fillY = baseY - (baseY - top) * level;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - half, top, half * 2, baseY - top);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(cx - half - 1, fillY, half * 2 + 2, baseY - fillY + 1);
    ctx.fillStyle = opts.liquidColor;
    ctx.fill();
    ctx.restore();
  }

  // Body
  ctx.beginPath();
  ctx.moveTo(cx - half, top);
  ctx.lineTo(cx - half, baseY);
  ctx.lineTo(cx + half, baseY);
  ctx.lineTo(cx + half, top);
  ctx.stroke();
  // Base foot
  ctx.beginPath();
  ctx.moveTo(cx - half * 1.35, bot);
  ctx.lineTo(cx + half * 1.35, bot);
  ctx.stroke();
  // Spout lip
  ctx.beginPath();
  ctx.moveTo(cx + half, top);
  ctx.quadraticCurveTo(cx + half + w * 0.12, top - h * 0.02, cx + half + w * 0.08, top + h * 0.04);
  ctx.stroke();
  // Tick marks
  for (let i = 1; i <= 4; i++) {
    const ty = top + ((baseY - top) * i) / 5;
    ctx.beginPath();
    ctx.moveTo(cx + half * 0.15, ty);
    ctx.lineTo(cx + half * 0.85, ty);
    ctx.stroke();
  }

  ctx.restore();
};

/** Volumetric flask with calibration mark. */
export const drawVolumetricFlaskInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  const mouthY = B.y1 + h * 0.04;
  const mouthW = w * 0.2;
  const mouthH = Math.max(2, h * 0.025);
  const neckBot = B.y1 + h * 0.42;
  const neckHalf = w * 0.07;
  const bodyBot = B.y2 - h * 0.06;
  const bodyHalf = w * 0.42;
  const calY = neckBot - h * 0.02;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(cx - neckHalf, neckBot);
    ctx.quadraticCurveTo(cx - bodyHalf, neckBot + h * 0.08, cx - bodyHalf, bodyBot - h * 0.08);
    ctx.quadraticCurveTo(cx - bodyHalf * 0.3, bodyBot, cx, bodyBot);
    ctx.quadraticCurveTo(cx + bodyHalf * 0.3, bodyBot, cx + bodyHalf, bodyBot - h * 0.08);
    ctx.quadraticCurveTo(cx + bodyHalf, neckBot + h * 0.08, cx + neckHalf, neckBot);
    ctx.closePath();
  };

  if (!opts.outlineOnly && level > 1e-4) {
    const fillTop = neckBot;
    const fillBot = bodyBot;
    const fillY = fillBot - (fillBot - fillTop) * level;
    ctx.save();
    bodyPath();
    ctx.clip();
    ctx.beginPath();
    ctx.rect(B.x1 - 2, fillY, w + 4, fillBot - fillY + 2);
    ctx.fillStyle = opts.liquidColor;
    ctx.fill();
    ctx.restore();
  }

  roundRectPath(ctx, cx - mouthW / 2, mouthY, mouthW, mouthH, mouthH * 0.4);
  ctx.stroke();
  const stopperW = mouthW * 0.55;
  const stopperH = h * 0.05;
  roundRectPath(
    ctx,
    cx - stopperW / 2,
    mouthY - stopperH * 0.6,
    stopperW,
    stopperH,
    Math.min(stopperH * 0.35, stopperW * 0.25),
  );
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - neckHalf, mouthY + mouthH);
  ctx.lineTo(cx - neckHalf, neckBot);
  ctx.moveTo(cx + neckHalf, mouthY + mouthH);
  ctx.lineTo(cx + neckHalf, neckBot);
  ctx.stroke();

  bodyPath();
  ctx.stroke();

  // Calibration mark
  ctx.beginPath();
  ctx.moveTo(cx - neckHalf * 1.8, calY);
  ctx.lineTo(cx + neckHalf * 1.8, calY);
  ctx.stroke();

  ctx.restore();
};

/** Chromatography column with packing band and stopcock. */
export const drawChromatographyColumnInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  const half = w * 0.22;
  const top = B.y1 + h * 0.12;
  const bot = B.y2 - h * 0.14;
  const funnelY = B.y1 + h * 0.04;
  const cockY = bot + h * 0.04;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  if (!opts.outlineOnly && level > 1e-4) {
    const fillY = bot - (bot - top) * level;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - half, top, half * 2, bot - top);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(cx - half - 1, fillY, half * 2 + 2, bot - fillY + 1);
    ctx.fillStyle = opts.liquidColor;
    ctx.fill();
    ctx.restore();
  }

  // Top funnel / joint
  ctx.beginPath();
  ctx.moveTo(cx - half * 1.6, funnelY);
  ctx.lineTo(cx + half * 1.6, funnelY);
  ctx.lineTo(cx + half, top);
  ctx.lineTo(cx - half, top);
  ctx.closePath();
  ctx.stroke();

  // Column tube
  ctx.beginPath();
  ctx.moveTo(cx - half, top);
  ctx.lineTo(cx - half, bot);
  ctx.lineTo(cx + half, bot);
  ctx.lineTo(cx + half, top);
  ctx.stroke();

  // Packing band
  const packTop = top + (bot - top) * 0.35;
  const packBot = top + (bot - top) * 0.72;
  ctx.beginPath();
  ctx.moveTo(cx - half * 0.85, packTop);
  ctx.lineTo(cx + half * 0.85, packTop);
  ctx.moveTo(cx - half * 0.85, packBot);
  ctx.lineTo(cx + half * 0.85, packBot);
  for (let i = 0; i < 4; i++) {
    const y = packTop + ((packBot - packTop) * (i + 0.5)) / 4;
    ctx.moveTo(cx - half * 0.7, y);
    ctx.lineTo(cx + half * 0.7, y);
  }
  ctx.stroke();

  // Stopcock + tip
  ctx.beginPath();
  ctx.moveTo(cx, bot);
  ctx.lineTo(cx, B.y2 - h * 0.02);
  ctx.moveTo(cx - w * 0.14, cockY);
  ctx.lineTo(cx + w * 0.14, cockY);
  ctx.stroke();

  ctx.restore();
};

/** TLC developing chamber with plate. */
export const drawTlcChamberInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const outline = CONICAL_FLASK_OUTLINE;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  const left = B.x1 + w * 0.12;
  const right = B.x2 - w * 0.12;
  const top = B.y1 + h * 0.14;
  const bot = B.y2 - h * 0.08;
  const lidY = B.y1 + h * 0.06;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  if (!opts.outlineOnly && level > 1e-4) {
    const fillY = bot - (bot - top) * level;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, right - left, bot - top);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(left - 1, fillY, right - left + 2, bot - fillY + 1);
    ctx.fillStyle = opts.liquidColor;
    ctx.fill();
    ctx.restore();
  }

  // Lid
  ctx.beginPath();
  ctx.moveTo(left - w * 0.04, lidY);
  ctx.lineTo(right + w * 0.04, lidY);
  ctx.stroke();
  // Jar body
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, bot);
  ctx.lineTo(right, bot);
  ctx.lineTo(right, top);
  ctx.lineTo(left, top);
  ctx.stroke();
  // TLC plate upright
  const px = left + (right - left) * 0.55;
  ctx.beginPath();
  ctx.moveTo(px, bot - h * 0.04);
  ctx.lineTo(px, top + h * 0.08);
  ctx.lineTo(px + w * 0.12, top + h * 0.08);
  ctx.lineTo(px + w * 0.12, bot - h * 0.04);
  ctx.stroke();
  // Spot line on plate
  ctx.beginPath();
  ctx.moveTo(px + w * 0.02, bot - h * 0.18);
  ctx.lineTo(px + w * 0.1, bot - h * 0.18);
  ctx.stroke();

  ctx.restore();
};

/** Allihn (bulb) condenser. */
export const drawAllihnCondenserInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const outer = w * 0.28;
  const inner = w * 0.1;
  const top = B.y1 + h * 0.08;
  const bot = B.y2 - h * 0.08;
  const jacketTop = top + h * 0.1;
  const jacketBot = bot - h * 0.1;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  ctx.beginPath();
  ctx.rect(cx - outer, jacketTop, outer * 2, jacketBot - jacketTop);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - inner, top);
  ctx.lineTo(cx - inner, jacketTop);
  ctx.moveTo(cx + inner, top);
  ctx.lineTo(cx + inner, jacketTop);
  ctx.moveTo(cx - inner, jacketBot);
  ctx.lineTo(cx - inner, bot);
  ctx.moveTo(cx + inner, jacketBot);
  ctx.lineTo(cx + inner, bot);
  ctx.stroke();

  // Bulb segments
  const n = 4;
  for (let i = 0; i < n; i++) {
    const cy = jacketTop + ((jacketBot - jacketTop) * (i + 0.5)) / n;
    const rx = outer * 0.72;
    const ry = ((jacketBot - jacketTop) / n) * 0.38;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Joint flares + hose stubs
  ctx.beginPath();
  ctx.moveTo(cx - inner * 1.5, top);
  ctx.lineTo(cx + inner * 1.5, top);
  ctx.moveTo(cx - inner * 1.5, bot);
  ctx.lineTo(cx + inner * 1.5, bot);
  ctx.moveTo(cx + outer, jacketTop + (jacketBot - jacketTop) * 0.2);
  ctx.lineTo(cx + outer + w * 0.12, jacketTop + (jacketBot - jacketTop) * 0.2);
  ctx.moveTo(cx - outer, jacketTop + (jacketBot - jacketTop) * 0.8);
  ctx.lineTo(cx - outer - w * 0.12, jacketTop + (jacketBot - jacketTop) * 0.8);
  ctx.stroke();

  ctx.restore();
};

/** Dimroth (coil) condenser. */
export const drawDimrothCondenserInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const outer = w * 0.28;
  const inner = w * 0.1;
  const top = B.y1 + h * 0.08;
  const bot = B.y2 - h * 0.08;
  const jacketTop = top + h * 0.1;
  const jacketBot = bot - h * 0.1;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  ctx.beginPath();
  ctx.rect(cx - outer, jacketTop, outer * 2, jacketBot - jacketTop);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - inner, top);
  ctx.lineTo(cx - inner, bot);
  ctx.moveTo(cx + inner, top);
  ctx.lineTo(cx + inner, bot);
  ctx.stroke();

  // Coil (sinusoidal)
  ctx.beginPath();
  const turns = 6;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const y = jacketTop + (jacketBot - jacketTop) * t;
    const x = cx + Math.sin(t * Math.PI * turns) * outer * 0.55;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - inner * 1.5, top);
  ctx.lineTo(cx + inner * 1.5, top);
  ctx.moveTo(cx - inner * 1.5, bot);
  ctx.lineTo(cx + inner * 1.5, bot);
  ctx.moveTo(cx + outer, jacketTop + (jacketBot - jacketTop) * 0.22);
  ctx.lineTo(cx + outer + w * 0.12, jacketTop + (jacketBot - jacketTop) * 0.22);
  ctx.moveTo(cx - outer, jacketTop + (jacketBot - jacketTop) * 0.78);
  ctx.lineTo(cx - outer - w * 0.12, jacketTop + (jacketBot - jacketTop) * 0.78);
  ctx.stroke();

  ctx.restore();
};

/** Soxhlet extractor body with siphon and thimble. */
export const drawSoxhletInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  const half = w * 0.28;
  const top = B.y1 + h * 0.08;
  const bot = B.y2 - h * 0.1;
  const siphonX = cx + half + w * 0.1;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  if (!opts.outlineOnly && level > 1e-4) {
    const fillY = bot - (bot - top) * level;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - half, top, half * 2, bot - top);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(cx - half - 1, fillY, half * 2 + 2, bot - fillY + 1);
    ctx.fillStyle = opts.liquidColor;
    ctx.fill();
    ctx.restore();
  }

  // Body
  ctx.beginPath();
  ctx.moveTo(cx - half, top);
  ctx.lineTo(cx - half, bot);
  ctx.lineTo(cx + half, bot);
  ctx.lineTo(cx + half, top);
  ctx.stroke();
  // Top / bottom joints
  ctx.beginPath();
  ctx.moveTo(cx - half * 0.7, top);
  ctx.lineTo(cx - half * 0.7, B.y1 + h * 0.02);
  ctx.moveTo(cx + half * 0.7, top);
  ctx.lineTo(cx + half * 0.7, B.y1 + h * 0.02);
  ctx.moveTo(cx - half * 0.55, bot);
  ctx.lineTo(cx - half * 0.55, B.y2 - h * 0.02);
  ctx.moveTo(cx + half * 0.55, bot);
  ctx.lineTo(cx + half * 0.55, B.y2 - h * 0.02);
  ctx.stroke();
  // Thimble
  const thL = cx - half * 0.55;
  const thR = cx + half * 0.55;
  const thTop = top + h * 0.12;
  const thBot = top + h * 0.55;
  ctx.beginPath();
  ctx.moveTo(thL, thTop);
  ctx.lineTo(thL, thBot);
  ctx.lineTo(thR, thBot);
  ctx.lineTo(thR, thTop);
  ctx.stroke();
  // Siphon arm
  ctx.beginPath();
  ctx.moveTo(cx + half, thBot);
  ctx.lineTo(siphonX, thBot);
  ctx.lineTo(siphonX, bot - h * 0.05);
  ctx.lineTo(cx + half, bot - h * 0.05);
  ctx.stroke();

  ctx.restore();
};

/** Hirsch funnel (shallow perforated cone). */
export const drawHirschFunnelInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const rimY = B.y1 + h * 0.12;
  const rimHalf = w * 0.42;
  const plateY = B.y1 + h * 0.42;
  const stemHalf = w * 0.08;
  const stemBot = B.y2 - h * 0.08;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  ctx.beginPath();
  ctx.moveTo(cx - rimHalf, rimY);
  ctx.lineTo(cx + rimHalf, rimY);
  ctx.lineTo(cx + stemHalf, plateY);
  ctx.lineTo(cx - stemHalf, plateY);
  ctx.closePath();
  ctx.stroke();

  // Perforated plate
  ctx.beginPath();
  ctx.moveTo(cx - stemHalf * 2.2, plateY);
  ctx.lineTo(cx + stemHalf * 2.2, plateY);
  for (let i = -2; i <= 2; i++) {
    ctx.moveTo(cx + i * stemHalf * 0.7, plateY - h * 0.02);
    ctx.lineTo(cx + i * stemHalf * 0.7, plateY + h * 0.02);
  }
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - stemHalf, plateY);
  ctx.lineTo(cx - stemHalf, stemBot);
  ctx.lineTo(cx + stemHalf, stemBot);
  ctx.lineTo(cx + stemHalf, plateY);
  ctx.stroke();

  ctx.restore();
};

/** Schlenk flask with sidearm stopcock. */
export const drawSchlenkFlaskInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2 - w * 0.06;
  const outline = CONICAL_FLASK_OUTLINE;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  const ballR = Math.min(w * 0.34, h * 0.34);
  const ballCy = B.y2 - ballR - h * 0.08;
  const neckHalf = w * 0.07;
  const neckTop = B.y1 + h * 0.1;
  const joinY = ballCy - Math.sqrt(Math.max(0, ballR * ballR - neckHalf * neckHalf));

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  if (!opts.outlineOnly && level > 1e-4) {
    const ballTop = ballCy - ballR;
    const ballBot = ballCy + ballR;
    const fillY = ballBot - (ballBot - ballTop) * level;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, ballCy, ballR, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(B.x1 - 2, fillY, w + 4, ballBot - fillY + 4);
    ctx.fillStyle = opts.liquidColor;
    ctx.fill();
    ctx.restore();
  }

  roundRectPath(ctx, cx - neckHalf * 1.5, neckTop - h * 0.03, neckHalf * 3, Math.max(2, h * 0.03), 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - neckHalf, neckTop);
  ctx.lineTo(cx - neckHalf, joinY);
  ctx.moveTo(cx + neckHalf, neckTop);
  ctx.lineTo(cx + neckHalf, joinY);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, ballCy, ballR, 0, Math.PI * 2);
  ctx.stroke();

  // Sidearm + stopcock
  const armY = ballCy - ballR * 0.15;
  const armX0 = cx + Math.sqrt(Math.max(0, ballR * ballR - (armY - ballCy) ** 2));
  ctx.beginPath();
  ctx.moveTo(armX0, armY);
  ctx.lineTo(B.x2 - w * 0.08, armY);
  ctx.moveTo(B.x2 - w * 0.18, armY - h * 0.04);
  ctx.lineTo(B.x2 - w * 0.18, armY + h * 0.04);
  ctx.stroke();

  ctx.restore();
};

/** Gas bubbler / oil trap inlet. */
export const drawGasBubblerInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  const half = w * 0.32;
  const chamberTop = B.y1 + h * 0.35;
  const chamberBot = B.y2 - h * 0.1;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  if (!opts.outlineOnly && level > 1e-4) {
    const fillY = chamberBot - (chamberBot - chamberTop) * level;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - half, chamberTop, half * 2, chamberBot - chamberTop);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(cx - half - 1, fillY, half * 2 + 2, chamberBot - fillY + 1);
    ctx.fillStyle = opts.liquidColor;
    ctx.fill();
    ctx.restore();
  }

  // Chamber
  ctx.beginPath();
  ctx.moveTo(cx - half, chamberTop);
  ctx.lineTo(cx - half, chamberBot);
  ctx.lineTo(cx + half, chamberBot);
  ctx.lineTo(cx + half, chamberTop);
  ctx.lineTo(cx - half, chamberTop);
  ctx.stroke();

  // Inlet dip tube
  ctx.beginPath();
  ctx.moveTo(cx - half * 0.35, B.y1 + h * 0.06);
  ctx.lineTo(cx - half * 0.35, chamberBot - h * 0.08);
  ctx.stroke();
  // Outlet
  ctx.beginPath();
  ctx.moveTo(cx + half * 0.35, chamberTop);
  ctx.lineTo(cx + half * 0.35, B.y1 + h * 0.06);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.06);
  ctx.stroke();

  ctx.restore();
};

/** Thermometer adapter. */
export const drawThermometerAdapterInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const jointHalf = w * 0.22;
  const jointTop = B.y1 + h * 0.42;
  const jointBot = B.y2 - h * 0.12;
  const stemHalf = w * 0.06;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  // Ground joint
  ctx.beginPath();
  ctx.moveTo(cx - jointHalf, jointTop);
  ctx.lineTo(cx - jointHalf * 0.7, jointBot);
  ctx.lineTo(cx + jointHalf * 0.7, jointBot);
  ctx.lineTo(cx + jointHalf, jointTop);
  ctx.closePath();
  ctx.stroke();

  // Thermometer stem
  ctx.beginPath();
  ctx.moveTo(cx - stemHalf, B.y1 + h * 0.06);
  ctx.lineTo(cx - stemHalf, jointBot - h * 0.02);
  ctx.moveTo(cx + stemHalf, B.y1 + h * 0.06);
  ctx.lineTo(cx + stemHalf, jointBot - h * 0.02);
  ctx.stroke();
  // Capillary bulb
  ctx.beginPath();
  ctx.arc(cx, B.y1 + h * 0.1, stemHalf * 1.3, 0, Math.PI * 2);
  ctx.stroke();
  // Capillary line
  ctx.beginPath();
  ctx.moveTo(cx, B.y1 + h * 0.14);
  ctx.lineTo(cx, jointBot - h * 0.08);
  ctx.stroke();

  ctx.restore();
};

/** Straight ground-glass joint adapter (neck-to-neck coupler). */
export const drawStraightAdapterInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const topHalf = w * 0.28;
  const botHalf = w * 0.22;
  const midHalf = w * 0.16;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  ctx.beginPath();
  ctx.moveTo(cx - topHalf, B.y1 + h * 0.08);
  ctx.lineTo(cx - midHalf, B.y1 + h * 0.35);
  ctx.lineTo(cx - midHalf, B.y1 + h * 0.65);
  ctx.lineTo(cx - botHalf, B.y2 - h * 0.08);
  ctx.moveTo(cx + topHalf, B.y1 + h * 0.08);
  ctx.lineTo(cx + midHalf, B.y1 + h * 0.35);
  ctx.lineTo(cx + midHalf, B.y1 + h * 0.65);
  ctx.lineTo(cx + botHalf, B.y2 - h * 0.08);
  ctx.stroke();
  // Joint flares
  ctx.beginPath();
  ctx.moveTo(cx - topHalf, B.y1 + h * 0.08);
  ctx.lineTo(cx + topHalf, B.y1 + h * 0.08);
  ctx.moveTo(cx - botHalf, B.y2 - h * 0.08);
  ctx.lineTo(cx + botHalf, B.y2 - h * 0.08);
  ctx.stroke();

  ctx.restore();
};

/** Vacuum takeoff adapter (vertical joint + sidearm). */
export const drawVacuumAdapterInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const jointHalf = w * 0.18;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  ctx.beginPath();
  ctx.moveTo(cx - jointHalf, B.y1 + h * 0.1);
  ctx.lineTo(cx - jointHalf * 0.7, B.y2 - h * 0.12);
  ctx.lineTo(cx + jointHalf * 0.7, B.y2 - h * 0.12);
  ctx.lineTo(cx + jointHalf, B.y1 + h * 0.1);
  ctx.closePath();
  ctx.stroke();

  // Sidearm hose barb
  const armY = B.y1 + h * 0.45;
  ctx.beginPath();
  ctx.moveTo(cx + jointHalf * 0.85, armY);
  ctx.lineTo(B.x2 - w * 0.08, armY);
  ctx.lineTo(B.x2 - w * 0.08, armY + h * 0.08);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(B.x2 - w * 0.14, armY - h * 0.04);
  ctx.lineTo(B.x2 - w * 0.05, armY + h * 0.04);
  ctx.moveTo(B.x2 - w * 0.14, armY + h * 0.12);
  ctx.lineTo(B.x2 - w * 0.05, armY + h * 0.04);
  ctx.stroke();

  ctx.restore();
};

/** 105° bent distillation adapter (L-shape in upright AABB). */
export const drawBentAdapterInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const outline = CONICAL_FLASK_OUTLINE;
  const leftX = B.x1 + w * 0.28;
  const tubeHalf = Math.min(w, h) * 0.08;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  // Vertical leg
  ctx.beginPath();
  ctx.moveTo(leftX - tubeHalf, B.y1 + h * 0.08);
  ctx.lineTo(leftX - tubeHalf, B.y1 + h * 0.55);
  ctx.lineTo(leftX + tubeHalf, B.y1 + h * 0.55);
  ctx.lineTo(leftX + tubeHalf, B.y1 + h * 0.08);
  ctx.stroke();
  // Bend + horizontal takeoff
  ctx.beginPath();
  ctx.moveTo(leftX - tubeHalf, B.y1 + h * 0.55);
  ctx.quadraticCurveTo(leftX - tubeHalf, B.y1 + h * 0.78, leftX + w * 0.15, B.y1 + h * 0.78);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.78);
  ctx.moveTo(leftX + tubeHalf, B.y1 + h * 0.55);
  ctx.quadraticCurveTo(leftX + tubeHalf, B.y1 + h * 0.62, leftX + w * 0.15, B.y1 + h * 0.62);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.62);
  ctx.stroke();
  // Joint flares
  ctx.beginPath();
  ctx.moveTo(leftX - tubeHalf * 1.6, B.y1 + h * 0.08);
  ctx.lineTo(leftX + tubeHalf * 1.6, B.y1 + h * 0.08);
  ctx.moveTo(B.x2 - w * 0.08, B.y1 + h * 0.58);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.82);
  ctx.stroke();

  ctx.restore();
};

/** Rubber / vacuum tubing (curved hose). */
export const drawVacuumTubingInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cy = (B.y1 + B.y2) / 2;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#5c4033';
  ctx.lineWidth = Math.max(opts.lineWidth * 2.2, 3);

  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.06, cy);
  ctx.bezierCurveTo(
    B.x1 + w * 0.3,
    B.y1 + h * 0.15,
    B.x1 + w * 0.7,
    B.y2 - h * 0.15,
    B.x2 - w * 0.06,
    cy,
  );
  ctx.stroke();

  ctx.restore();
};

/** Coolant tubing loop with hose-barb ends. */
export const drawCoolantTubingInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const left = B.x1 + w * 0.2;
  const right = B.x2 - w * 0.2;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#3a7ca5';
  ctx.lineWidth = Math.max(opts.lineWidth * 1.6, 2.5);

  ctx.beginPath();
  ctx.moveTo(left, B.y1 + h * 0.2);
  ctx.lineTo(left, B.y2 - h * 0.25);
  ctx.quadraticCurveTo((left + right) / 2, B.y2 - h * 0.05, right, B.y2 - h * 0.25);
  ctx.lineTo(right, B.y1 + h * 0.2);
  ctx.stroke();

  // Hose barbs
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  for (const x of [left, right]) {
    ctx.beginPath();
    ctx.moveTo(x - w * 0.08, B.y1 + h * 0.12);
    ctx.lineTo(x + w * 0.08, B.y1 + h * 0.12);
    ctx.moveTo(x - w * 0.06, B.y1 + h * 0.18);
    ctx.lineTo(x + w * 0.06, B.y1 + h * 0.18);
    ctx.stroke();
  }

  ctx.restore();
};

/** Glass stopper. */
export const drawStopperInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;

  roundRectPath(ctx, cx - w * 0.35, B.y1 + h * 0.08, w * 0.7, h * 0.28, 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.22, B.y1 + h * 0.38);
  ctx.lineTo(cx - w * 0.16, B.y2 - h * 0.1);
  ctx.lineTo(cx + w * 0.16, B.y2 - h * 0.1);
  ctx.lineTo(cx + w * 0.22, B.y1 + h * 0.38);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
};

/** Rubber septum. */
export const drawSeptumInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const cy = B.y1 + h * 0.45;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#6b3a3a';
  ctx.lineWidth = opts.lineWidth;
  ctx.fillStyle = 'rgba(140, 70, 70, 0.25)';

  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.38, h * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.2, B.y2 - h * 0.15);
  ctx.lineTo(cx + w * 0.2, B.y2 - h * 0.15);
  ctx.stroke();

  ctx.restore();
};

/** Keck clip (small plastic joint clip). */
export const drawKeckClipInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const cy = (B.y1 + B.y2) / 2;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#c45c26';
  ctx.lineWidth = Math.max(opts.lineWidth, 2);

  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(w, h) * 0.38, 0.35, Math.PI * 2 - 0.35);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.12, cy - h * 0.35);
  ctx.lineTo(cx + w * 0.12, cy - h * 0.35);
  ctx.stroke();

  ctx.restore();
};

/** Büchner funnel with perforated plate. */
export const drawBuchnerFunnelInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const rimY = B.y1 + h * 0.12;
  const plateY = B.y1 + h * 0.42;
  const stemHalf = w * 0.08;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.08, rimY);
  ctx.lineTo(B.x2 - w * 0.08, rimY);
  ctx.lineTo(cx + w * 0.28, plateY);
  ctx.lineTo(cx - w * 0.28, plateY);
  ctx.closePath();
  ctx.stroke();
  // Perforations
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(cx + i * w * 0.08, (rimY + plateY) / 2, 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - stemHalf, plateY);
  ctx.lineTo(cx - stemHalf, B.y2 - h * 0.08);
  ctx.moveTo(cx + stemHalf, plateY);
  ctx.lineTo(cx + stemHalf, B.y2 - h * 0.08);
  ctx.stroke();

  ctx.restore();
};

/** Sintered / fritted funnel. */
export const drawSinteredFunnelInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const rimY = B.y1 + h * 0.1;
  const fritY = B.y1 + h * 0.48;
  const stemHalf = w * 0.07;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.12, rimY);
  ctx.lineTo(B.x2 - w * 0.12, rimY);
  ctx.lineTo(cx + w * 0.22, fritY);
  ctx.lineTo(cx - w * 0.22, fritY);
  ctx.closePath();
  ctx.stroke();
  // Frit band
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.22, fritY);
  ctx.lineTo(cx + w * 0.22, fritY);
  ctx.moveTo(cx - w * 0.2, fritY + h * 0.04);
  ctx.lineTo(cx + w * 0.2, fritY + h * 0.04);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - stemHalf, fritY + h * 0.04);
  ctx.lineTo(cx - stemHalf, B.y2 - h * 0.08);
  ctx.moveTo(cx + stemHalf, fritY + h * 0.04);
  ctx.lineTo(cx + stemHalf, B.y2 - h * 0.08);
  ctx.stroke();

  ctx.restore();
};

/** Lab syringe. */
export const drawSyringeInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  const bodyTop = B.y1 + h * 0.22;
  const bodyBot = B.y2 - h * 0.18;
  const half = w * 0.28;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  if (!opts.outlineOnly && level > 1e-4) {
    const fillTop = bodyBot - (bodyBot - bodyTop) * level;
    ctx.fillStyle = opts.liquidColor;
    ctx.fillRect(cx - half + 1, fillTop, half * 2 - 2, bodyBot - fillTop);
  }

  roundRectPath(ctx, cx - half, bodyTop, half * 2, bodyBot - bodyTop, 2);
  ctx.stroke();
  // Plunger
  ctx.beginPath();
  ctx.moveTo(cx - half * 0.7, B.y1 + h * 0.06);
  ctx.lineTo(cx - half * 0.7, bodyTop);
  ctx.moveTo(cx + half * 0.7, B.y1 + h * 0.06);
  ctx.lineTo(cx + half * 0.7, bodyTop);
  ctx.moveTo(cx - half, B.y1 + h * 0.06);
  ctx.lineTo(cx + half, B.y1 + h * 0.06);
  ctx.stroke();
  // Needle
  ctx.beginPath();
  ctx.moveTo(cx, bodyBot);
  ctx.lineTo(cx, B.y2 - h * 0.04);
  ctx.stroke();

  ctx.restore();
};

/** Transfer cannula (horizontal needle). */
export const drawCannulaInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cy = (B.y1 + B.y2) / 2;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#555555';
  ctx.lineWidth = Math.max(opts.lineWidth * 1.2, 2);

  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.05, cy);
  ctx.lineTo(B.x2 - w * 0.05, cy);
  ctx.stroke();
  // Tips
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.05, cy);
  ctx.lineTo(B.x1 + w * 0.12, cy - h * 0.25);
  ctx.moveTo(B.x2 - w * 0.05, cy);
  ctx.lineTo(B.x2 - w * 0.12, cy - h * 0.25);
  ctx.stroke();

  ctx.restore();
};

/** NMR tube. */
export const drawNmrTubeInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  const half = w * 0.28;
  const top = B.y1 + h * 0.08;
  const bot = B.y2 - h * 0.06;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  if (!opts.outlineOnly && level > 1e-4) {
    const fillTop = bot - (bot - top) * level * 0.55;
    ctx.fillStyle = opts.liquidColor;
    ctx.beginPath();
    ctx.moveTo(cx - half, fillTop);
    ctx.lineTo(cx + half, fillTop);
    ctx.lineTo(cx + half, bot - half);
    ctx.arc(cx, bot - half, half, 0, Math.PI, false);
    ctx.closePath();
    ctx.fill();
  }

  ctx.beginPath();
  ctx.moveTo(cx - half, top);
  ctx.lineTo(cx - half, bot - half);
  ctx.arc(cx, bot - half, half, Math.PI, 0, true);
  ctx.lineTo(cx + half, top);
  ctx.stroke();
  // Cap
  roundRectPath(ctx, cx - half * 1.15, B.y1 + h * 0.02, half * 2.3, h * 0.08, 2);
  ctx.stroke();

  ctx.restore();
};

/** CaCl₂ drying tube. */
export const drawDryingTubeInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const half = w * 0.28;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  // Joint bottom
  ctx.beginPath();
  ctx.moveTo(cx - half * 0.7, B.y2 - h * 0.08);
  ctx.lineTo(cx - half, B.y1 + h * 0.55);
  ctx.lineTo(cx + half, B.y1 + h * 0.55);
  ctx.lineTo(cx + half * 0.7, B.y2 - h * 0.08);
  ctx.stroke();
  // Bent tube body
  ctx.beginPath();
  ctx.moveTo(cx - half, B.y1 + h * 0.55);
  ctx.lineTo(cx - half, B.y1 + h * 0.28);
  ctx.quadraticCurveTo(cx - half, B.y1 + h * 0.12, cx, B.y1 + h * 0.12);
  ctx.quadraticCurveTo(cx + half, B.y1 + h * 0.12, cx + half, B.y1 + h * 0.28);
  ctx.lineTo(cx + half, B.y1 + h * 0.55);
  ctx.stroke();
  // Desiccant dots
  ctx.fillStyle = outline;
  for (const [dx, dy] of [
    [-0.12, 0.35],
    [0.1, 0.4],
    [-0.05, 0.45],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx + w * dx, B.y1 + h * dy, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
};

/** Heating mantle (bowl + base). */
export const drawHeatingMantleInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#444444';
  ctx.lineWidth = opts.lineWidth;
  ctx.fillStyle = 'rgba(80,80,80,0.15)';
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.08, B.y2 - h * 0.15);
  ctx.lineTo(B.x1 + w * 0.12, B.y1 + h * 0.45);
  ctx.quadraticCurveTo(cx, B.y1 + h * 0.15, B.x2 - w * 0.12, B.y1 + h * 0.45);
  ctx.lineTo(B.x2 - w * 0.08, B.y2 - h * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  roundRectPath(ctx, B.x1 + w * 0.15, B.y2 - h * 0.22, w * 0.7, h * 0.16, 3);
  ctx.stroke();
  ctx.restore();
};

/** Generic bath dish (oil / ice / dry-ice share silhouette; caller adds fill). */
const drawBathDishInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
  decor: 'oil' | 'ice' | 'dryice',
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  const rimY = B.y1 + h * 0.2;
  const botY = B.y2 - h * 0.12;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  if (!opts.outlineOnly && level > 1e-4) {
    const fillTop = botY - (botY - rimY) * level;
    ctx.fillStyle = opts.liquidColor;
    ctx.beginPath();
    ctx.moveTo(B.x1 + w * 0.1, rimY);
    ctx.lineTo(B.x2 - w * 0.1, rimY);
    ctx.lineTo(B.x2 - w * 0.18, botY);
    ctx.lineTo(B.x1 + w * 0.18, botY);
    ctx.closePath();
    ctx.clip();
    ctx.fillRect(B.x1, fillTop, w, botY - fillTop + 2);
  }
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.1, rimY);
  ctx.lineTo(B.x2 - w * 0.1, rimY);
  ctx.lineTo(B.x2 - w * 0.18, botY);
  ctx.lineTo(B.x1 + w * 0.18, botY);
  ctx.closePath();
  ctx.stroke();
  if (decor === 'ice') {
    for (const [u, v] of [
      [0.3, 0.45],
      [0.5, 0.55],
      [0.68, 0.42],
    ] as const) {
      ctx.strokeRect(B.x1 + w * u, B.y1 + h * v, w * 0.1, h * 0.12);
    }
  } else if (decor === 'dryice') {
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.15, B.y1 + h * 0.12);
    ctx.quadraticCurveTo(cx - w * 0.05, B.y1 + h * 0.02, cx + w * 0.05, B.y1 + h * 0.12);
    ctx.moveTo(cx, B.y1 + h * 0.1);
    ctx.quadraticCurveTo(cx + w * 0.1, B.y1 + h * 0.0, cx + w * 0.18, B.y1 + h * 0.14);
    ctx.stroke();
  }
  ctx.restore();
};

export const drawOilBathInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => drawBathDishInBox(ctx, x1, y1, x2, y2, opts, 'oil');

export const drawIceBathInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => drawBathDishInBox(ctx, x1, y1, x2, y2, opts, 'ice');

export const drawDryIceBathInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => drawBathDishInBox(ctx, x1, y1, x2, y2, opts, 'dryice');

export const drawChillerInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#3a7ca5';
  ctx.lineWidth = opts.lineWidth;
  roundRectPath(ctx, B.x1 + w * 0.1, B.y1 + h * 0.15, w * 0.8, h * 0.7, 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.05, B.y1 + h * 0.35);
  ctx.lineTo(B.x1 + w * 0.1, B.y1 + h * 0.35);
  ctx.moveTo(B.x2 - w * 0.1, B.y1 + h * 0.35);
  ctx.lineTo(B.x2 - w * 0.05, B.y1 + h * 0.35);
  ctx.stroke();
  ctx.strokeRect(B.x1 + w * 0.35, B.y1 + h * 0.3, w * 0.3, h * 0.2);
  ctx.restore();
};

export const drawLabJackInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  ctx.strokeRect(B.x1 + w * 0.15, B.y1 + h * 0.1, w * 0.7, h * 0.12);
  ctx.strokeRect(B.x1 + w * 0.1, B.y2 - h * 0.18, w * 0.8, h * 0.12);
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.25, B.y1 + h * 0.22);
  ctx.lineTo(B.x2 - w * 0.25, B.y2 - h * 0.22);
  ctx.moveTo(B.x2 - w * 0.25, B.y1 + h * 0.22);
  ctx.lineTo(B.x1 + w * 0.25, B.y2 - h * 0.22);
  ctx.stroke();
  ctx.restore();
};

export const drawRetortStandInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const rodX = B.x1 + w * 0.55;
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = Math.max(opts.lineWidth, 2);
  ctx.beginPath();
  ctx.moveTo(rodX, B.y1 + h * 0.05);
  ctx.lineTo(rodX, B.y2 - h * 0.18);
  ctx.stroke();
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.1, B.y2 - h * 0.12);
  ctx.lineTo(B.x2 - w * 0.05, B.y2 - h * 0.12);
  ctx.lineTo(B.x2 - w * 0.15, B.y2 - h * 0.05);
  ctx.lineTo(B.x1 + w * 0.2, B.y2 - h * 0.05);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
};

export const drawThreeProngClampInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cy = (B.y1 + B.y2) / 2;
  ctx.save();
  ctx.strokeStyle = '#666666';
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.08, cy);
  ctx.lineTo(B.x1 + w * 0.45, cy);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(B.x1 + w * 0.7, cy, Math.min(w, h) * 0.28, -0.8, 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.55, cy - h * 0.25);
  ctx.lineTo(B.x1 + w * 0.85, cy - h * 0.35);
  ctx.moveTo(B.x1 + w * 0.55, cy + h * 0.25);
  ctx.lineTo(B.x1 + w * 0.85, cy + h * 0.35);
  ctx.stroke();
  ctx.restore();
};

export const drawStirBarInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cy = (B.y1 + B.y2) / 2;
  ctx.save();
  ctx.strokeStyle = '#222222';
  ctx.fillStyle = 'rgba(40,40,40,0.35)';
  ctx.lineWidth = opts.lineWidth;
  roundRectPath(ctx, B.x1 + w * 0.08, cy - h * 0.28, w * 0.84, h * 0.56, h * 0.28);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
};

export const drawPasteurPipetteInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.ellipse(cx, B.y1 + h * 0.12, w * 0.35, h * 0.1, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.18, B.y1 + h * 0.2);
  ctx.lineTo(cx - w * 0.1, B.y2 - h * 0.08);
  ctx.lineTo(cx + w * 0.1, B.y2 - h * 0.08);
  ctx.lineTo(cx + w * 0.18, B.y1 + h * 0.2);
  ctx.stroke();
  ctx.restore();
};

export const drawSpatulaInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cy = (B.y1 + B.y2) / 2;
  ctx.save();
  ctx.strokeStyle = '#555555';
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.08, cy);
  ctx.lineTo(B.x1 + w * 0.55, cy);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.55, cy - h * 0.25);
  ctx.lineTo(B.x2 - w * 0.08, cy - h * 0.15);
  ctx.lineTo(B.x2 - w * 0.08, cy + h * 0.15);
  ctx.lineTo(B.x1 + w * 0.55, cy + h * 0.25);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
};

export const drawPowderFunnelInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.08, B.y1 + h * 0.12);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.12);
  ctx.lineTo(cx + w * 0.18, B.y1 + h * 0.55);
  ctx.lineTo(cx - w * 0.18, B.y1 + h * 0.55);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.1, B.y1 + h * 0.55);
  ctx.lineTo(cx - w * 0.1, B.y2 - h * 0.08);
  ctx.moveTo(cx + w * 0.1, B.y1 + h * 0.55);
  ctx.lineTo(cx + w * 0.1, B.y2 - h * 0.08);
  ctx.stroke();
  ctx.restore();
};

export const drawTwoNeckRbfInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  const ballR = Math.min(w * 0.36, h * 0.36);
  const ballCy = B.y2 - ballR - h * 0.06;
  const neckHalf = w * 0.055;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  if (!opts.outlineOnly && level > 1e-4) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, ballCy, ballR, 0, Math.PI * 2);
    ctx.clip();
    const fillY = ballCy + ballR - 2 * ballR * level;
    ctx.fillStyle = opts.liquidColor;
    ctx.fillRect(cx - ballR - 2, fillY, ballR * 2 + 4, ballCy + ballR - fillY + 2);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(cx, ballCy, ballR, 0, Math.PI * 2);
  ctx.stroke();
  // Center neck
  ctx.beginPath();
  ctx.moveTo(cx - neckHalf, ballCy - ballR * 0.7);
  ctx.lineTo(cx - neckHalf, B.y1 + h * 0.08);
  ctx.moveTo(cx + neckHalf, ballCy - ballR * 0.7);
  ctx.lineTo(cx + neckHalf, B.y1 + h * 0.08);
  ctx.stroke();
  // Side neck
  const sx = cx + w * 0.22;
  ctx.beginPath();
  ctx.moveTo(cx + neckHalf * 1.2, ballCy - ballR * 0.55);
  ctx.lineTo(sx - neckHalf, B.y1 + h * 0.22);
  ctx.moveTo(cx + neckHalf * 2.2, ballCy - ballR * 0.35);
  ctx.lineTo(sx + neckHalf, B.y1 + h * 0.22);
  ctx.stroke();
  ctx.restore();
};

export const drawVigreuxColumnInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const half = w * 0.22;
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.moveTo(cx - half, B.y1 + h * 0.06);
  ctx.lineTo(cx - half, B.y2 - h * 0.06);
  ctx.moveTo(cx + half, B.y1 + h * 0.06);
  ctx.lineTo(cx + half, B.y2 - h * 0.06);
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const y = B.y1 + h * (0.18 + i * 0.12);
    const side = i % 2 === 0 ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + side * half, y);
    ctx.lineTo(cx + side * half * 0.25, y + h * 0.04);
    ctx.stroke();
  }
  ctx.restore();
};

export const drawCowReceiverInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  if (!opts.outlineOnly && opts.liquidLevel > 1e-4) {
    ctx.fillStyle = opts.liquidColor;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(B.x1 + w * 0.15, B.y1 + h * 0.55, w * 0.7, h * 0.25);
    ctx.globalAlpha = 1;
  }
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.08, B.y1 + h * 0.08);
  ctx.lineTo(cx - w * 0.08, B.y1 + h * 0.35);
  ctx.lineTo(B.x1 + w * 0.15, B.y1 + h * 0.55);
  ctx.moveTo(cx + w * 0.08, B.y1 + h * 0.08);
  ctx.lineTo(cx + w * 0.08, B.y1 + h * 0.35);
  ctx.lineTo(B.x2 - w * 0.15, B.y1 + h * 0.55);
  ctx.stroke();
  for (const u of [0.22, 0.5, 0.78]) {
    const x = B.x1 + w * u;
    ctx.beginPath();
    ctx.moveTo(x, B.y1 + h * 0.55);
    ctx.lineTo(x, B.y2 - h * 0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x, B.y2 - h * 0.1, w * 0.08, h * 0.06, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
};

export const drawColdFingerInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.25, B.y1 + h * 0.1);
  ctx.lineTo(cx - w * 0.18, B.y2 - h * 0.15);
  ctx.quadraticCurveTo(cx, B.y2 - h * 0.05, cx + w * 0.18, B.y2 - h * 0.15);
  ctx.lineTo(cx + w * 0.25, B.y1 + h * 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.12, B.y1 + h * 0.12);
  ctx.lineTo(cx - w * 0.08, B.y1 + h * 0.55);
  ctx.moveTo(cx + w * 0.12, B.y1 + h * 0.12);
  ctx.lineTo(cx + w * 0.08, B.y1 + h * 0.55);
  ctx.stroke();
  ctx.restore();
};

export const drawColdTrapInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.28, B.y1 + h * 0.25);
  ctx.lineTo(cx - w * 0.28, B.y2 - h * 0.12);
  ctx.quadraticCurveTo(cx, B.y2 - h * 0.02, cx + w * 0.28, B.y2 - h * 0.12);
  ctx.lineTo(cx + w * 0.28, B.y1 + h * 0.25);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.15, B.y1 + h * 0.12);
  ctx.lineTo(B.x1 + w * 0.15, B.y1 + h * 0.28);
  ctx.lineTo(cx - w * 0.1, B.y1 + h * 0.28);
  ctx.moveTo(B.x2 - w * 0.15, B.y1 + h * 0.12);
  ctx.lineTo(B.x2 - w * 0.15, B.y1 + h * 0.28);
  ctx.lineTo(cx + w * 0.1, B.y1 + h * 0.28);
  ctx.stroke();
  ctx.restore();
};

export const drawVacuumPumpInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  roundRectPath(ctx, B.x1 + w * 0.2, B.y1 + h * 0.25, w * 0.65, h * 0.55, 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(B.x1 + w * 0.55, B.y1 + h * 0.5, Math.min(w, h) * 0.15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.05, B.y1 + h * 0.4);
  ctx.lineTo(B.x1 + w * 0.2, B.y1 + h * 0.4);
  ctx.stroke();
  ctx.restore();
};

export const drawGasInletAdapterInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.2, B.y1 + h * 0.12);
  ctx.lineTo(cx - w * 0.15, B.y2 - h * 0.1);
  ctx.lineTo(cx + w * 0.15, B.y2 - h * 0.1);
  ctx.lineTo(cx + w * 0.2, B.y1 + h * 0.12);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.18, B.y1 + h * 0.4);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.4);
  ctx.stroke();
  ctx.restore();
};

export const drawBalloonInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.strokeStyle = '#888888';
  ctx.fillStyle = 'rgba(200,200,220,0.25)';
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.ellipse(cx, B.y1 + h * 0.38, w * 0.38, h * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.08, B.y1 + h * 0.68);
  ctx.lineTo(cx - w * 0.06, B.y2 - h * 0.08);
  ctx.lineTo(cx + w * 0.06, B.y2 - h * 0.08);
  ctx.lineTo(cx + w * 0.08, B.y1 + h * 0.68);
  ctx.stroke();
  ctx.restore();
};

export const drawReducingAdapterInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.32, B.y1 + h * 0.1);
  ctx.lineTo(cx - w * 0.14, B.y2 - h * 0.1);
  ctx.lineTo(cx + w * 0.14, B.y2 - h * 0.1);
  ctx.lineTo(cx + w * 0.32, B.y1 + h * 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.32, B.y1 + h * 0.1);
  ctx.lineTo(cx + w * 0.32, B.y1 + h * 0.1);
  ctx.moveTo(cx - w * 0.14, B.y2 - h * 0.1);
  ctx.lineTo(cx + w * 0.14, B.y2 - h * 0.1);
  ctx.stroke();
  ctx.restore();
};

export const drawRotovapBumpTrapInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.12, B.y1 + h * 0.08);
  ctx.lineTo(cx - w * 0.12, B.y1 + h * 0.28);
  ctx.quadraticCurveTo(cx - w * 0.35, B.y1 + h * 0.55, cx - w * 0.2, B.y2 - h * 0.12);
  ctx.lineTo(cx + w * 0.2, B.y2 - h * 0.12);
  ctx.quadraticCurveTo(cx + w * 0.35, B.y1 + h * 0.55, cx + w * 0.12, B.y1 + h * 0.28);
  ctx.lineTo(cx + w * 0.12, B.y1 + h * 0.08);
  ctx.stroke();
  ctx.restore();
};

export const drawRotovapFlaskInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  if (!opts.outlineOnly && level > 1e-4) {
    ctx.fillStyle = opts.liquidColor;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.28, B.y1 + h * 0.55);
    ctx.quadraticCurveTo(cx, B.y2 - h * 0.05, cx + w * 0.28, B.y1 + h * 0.55);
    ctx.closePath();
    ctx.globalAlpha = 0.5;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.1, B.y1 + h * 0.08);
  ctx.lineTo(cx - w * 0.12, B.y1 + h * 0.35);
  ctx.quadraticCurveTo(cx - w * 0.4, B.y1 + h * 0.7, cx, B.y2 - h * 0.08);
  ctx.quadraticCurveTo(cx + w * 0.4, B.y1 + h * 0.7, cx + w * 0.12, B.y1 + h * 0.35);
  ctx.lineTo(cx + w * 0.1, B.y1 + h * 0.08);
  ctx.stroke();
  ctx.restore();
};

/** Magnetic stirrer hotplate. */
export const drawHotplateStirrerInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  // Body
  roundRectPath(ctx, B.x1 + w * 0.08, B.y1 + h * 0.28, w * 0.84, h * 0.62, 4);
  ctx.stroke();
  // Ceramic plate
  ctx.strokeStyle = '#666666';
  roundRectPath(ctx, B.x1 + w * 0.18, B.y1 + h * 0.12, w * 0.64, h * 0.28, 3);
  ctx.stroke();
  // Knobs
  ctx.strokeStyle = '#333333';
  for (const u of [0.28, 0.5, 0.72]) {
    ctx.beginPath();
    ctx.arc(B.x1 + w * u, B.y1 + h * 0.72, Math.min(w, h) * 0.06, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Plate center mark
  ctx.beginPath();
  ctx.arc(cx, B.y1 + h * 0.26, Math.min(w, h) * 0.04, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

/** Vacuum-insulated Dewar flask. */
export const drawDewarFlaskInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  const outerHalf = w * 0.32;
  const innerHalf = w * 0.22;
  const top = B.y1 + h * 0.1;
  const bot = B.y2 - h * 0.1;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  if (!opts.outlineOnly && level > 1e-4) {
    const fillTop = bot - (bot - top) * level * 0.7;
    ctx.fillStyle = opts.liquidColor;
    ctx.beginPath();
    ctx.moveTo(cx - innerHalf, fillTop);
    ctx.lineTo(cx + innerHalf, fillTop);
    ctx.lineTo(cx + innerHalf, bot - h * 0.08);
    ctx.quadraticCurveTo(cx, bot - h * 0.02, cx - innerHalf, bot - h * 0.08);
    ctx.closePath();
    ctx.fill();
  }
  // Outer wall
  ctx.beginPath();
  ctx.moveTo(cx - outerHalf, top);
  ctx.lineTo(cx - outerHalf, bot - h * 0.1);
  ctx.quadraticCurveTo(cx, bot, cx + outerHalf, bot - h * 0.1);
  ctx.lineTo(cx + outerHalf, top);
  ctx.stroke();
  // Inner wall (vacuum gap)
  ctx.beginPath();
  ctx.moveTo(cx - innerHalf, top + h * 0.06);
  ctx.lineTo(cx - innerHalf, bot - h * 0.16);
  ctx.quadraticCurveTo(cx, bot - h * 0.08, cx + innerHalf, bot - h * 0.16);
  ctx.lineTo(cx + innerHalf, top + h * 0.06);
  ctx.stroke();
  // Rim
  ctx.beginPath();
  ctx.moveTo(cx - outerHalf, top);
  ctx.lineTo(cx + outerHalf, top);
  ctx.stroke();
  ctx.restore();
};

/** Standalone lab thermometer. */
export const drawThermometerInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const stemHalf = w * 0.12;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  // Stem
  ctx.beginPath();
  ctx.moveTo(cx - stemHalf, B.y1 + h * 0.08);
  ctx.lineTo(cx - stemHalf, B.y2 - h * 0.22);
  ctx.moveTo(cx + stemHalf, B.y1 + h * 0.08);
  ctx.lineTo(cx + stemHalf, B.y2 - h * 0.22);
  ctx.stroke();
  // Capillary
  ctx.beginPath();
  ctx.moveTo(cx, B.y1 + h * 0.12);
  ctx.lineTo(cx, B.y2 - h * 0.28);
  ctx.stroke();
  // Scale ticks
  for (let i = 0; i < 8; i++) {
    const y = B.y1 + h * (0.18 + i * 0.08);
    ctx.beginPath();
    ctx.moveTo(cx + stemHalf, y);
    ctx.lineTo(cx + stemHalf + w * 0.18, y);
    ctx.stroke();
  }
  // Bulb
  ctx.beginPath();
  ctx.arc(cx, B.y2 - h * 0.14, w * 0.22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(200, 60, 60, 0.35)';
  ctx.beginPath();
  ctx.arc(cx, B.y2 - h * 0.14, w * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

/** Concave watch glass. */
export const drawWatchGlassInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const cy = (B.y1 + B.y2) / 2;
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.42, h * 0.28, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy + h * 0.04, w * 0.34, h * 0.16, 0, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
};

/** Graduated burette with stopcock. */
export const drawBuretteInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  const half = w * 0.18;
  const top = B.y1 + h * 0.06;
  const cockY = B.y1 + h * 0.78;
  const tipY = B.y2 - h * 0.06;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  if (!opts.outlineOnly && level > 1e-4) {
    const fillTop = cockY - (cockY - top) * level;
    ctx.fillStyle = opts.liquidColor;
    ctx.fillRect(cx - half + 1, fillTop, half * 2 - 2, cockY - fillTop);
  }
  ctx.beginPath();
  ctx.moveTo(cx - half, top);
  ctx.lineTo(cx - half, cockY);
  ctx.moveTo(cx + half, top);
  ctx.lineTo(cx + half, cockY);
  ctx.stroke();
  // Funnel top
  ctx.beginPath();
  ctx.moveTo(cx - half * 1.6, top);
  ctx.lineTo(cx + half * 1.6, top);
  ctx.stroke();
  // Graduations
  for (let i = 0; i < 10; i++) {
    const y = top + ((cockY - top) * (i + 1)) / 11;
    ctx.beginPath();
    ctx.moveTo(cx + half, y);
    ctx.lineTo(cx + half + w * 0.2, y);
    ctx.stroke();
  }
  // Stopcock
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.28, cockY);
  ctx.lineTo(cx + w * 0.28, cockY);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cockY, w * 0.1, 0, Math.PI * 2);
  ctx.stroke();
  // Tip
  ctx.beginPath();
  ctx.moveTo(cx - half * 0.5, cockY);
  ctx.lineTo(cx - half * 0.25, tipY);
  ctx.moveTo(cx + half * 0.5, cockY);
  ctx.lineTo(cx + half * 0.25, tipY);
  ctx.stroke();
  ctx.restore();
};

/** Shallow evaporating / crystallizing dish. */
export const drawEvaporatingDishInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  const rimY = B.y1 + h * 0.28;
  const botY = B.y2 - h * 0.18;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  if (!opts.outlineOnly && level > 1e-4) {
    const fillTop = botY - (botY - rimY) * level;
    ctx.fillStyle = opts.liquidColor;
    ctx.beginPath();
    ctx.moveTo(B.x1 + w * 0.12, rimY);
    ctx.lineTo(B.x2 - w * 0.12, rimY);
    ctx.lineTo(B.x2 - w * 0.22, botY);
    ctx.quadraticCurveTo(cx, botY + h * 0.08, B.x1 + w * 0.22, botY);
    ctx.closePath();
    ctx.clip();
    ctx.fillRect(B.x1, fillTop, w, botY - fillTop + 4);
  }
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.08, rimY);
  ctx.lineTo(B.x2 - w * 0.08, rimY);
  ctx.lineTo(B.x2 - w * 0.2, botY);
  ctx.quadraticCurveTo(cx, botY + h * 0.1, B.x1 + w * 0.2, botY);
  ctx.closePath();
  ctx.stroke();
  // Pour spout hint
  ctx.beginPath();
  ctx.moveTo(B.x2 - w * 0.12, rimY);
  ctx.lineTo(B.x2 - w * 0.04, rimY - h * 0.08);
  ctx.stroke();
  ctx.restore();
};

/** Neoprene Büchner filter adapter (cone with flange). */
export const drawFilterAdapterInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#4a3728';
  ctx.fillStyle = 'rgba(90, 60, 40, 0.2)';
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.38, B.y1 + h * 0.15);
  ctx.lineTo(cx + w * 0.38, B.y1 + h * 0.15);
  ctx.lineTo(cx + w * 0.22, B.y2 - h * 0.15);
  ctx.lineTo(cx - w * 0.22, B.y2 - h * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Inner bore
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.12, B.y1 + h * 0.2);
  ctx.lineTo(cx - w * 0.1, B.y2 - h * 0.2);
  ctx.moveTo(cx + w * 0.12, B.y1 + h * 0.2);
  ctx.lineTo(cx + w * 0.1, B.y2 - h * 0.2);
  ctx.stroke();
  ctx.restore();
};

/** Thick-walled pressure / sealed tube. */
export const drawPressureTubeInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  const outer = w * 0.28;
  const inner = w * 0.18;
  const top = B.y1 + h * 0.12;
  const bot = B.y2 - h * 0.08;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  if (!opts.outlineOnly && level > 1e-4) {
    const fillTop = bot - (bot - top) * level;
    ctx.fillStyle = opts.liquidColor;
    ctx.beginPath();
    ctx.moveTo(cx - inner, fillTop);
    ctx.lineTo(cx + inner, fillTop);
    ctx.lineTo(cx + inner, bot - inner);
    ctx.arc(cx, bot - inner, inner, 0, Math.PI, false);
    ctx.closePath();
    ctx.fill();
  }
  // Thick wall as double outline
  ctx.beginPath();
  ctx.moveTo(cx - outer, top);
  ctx.lineTo(cx - outer, bot - outer);
  ctx.arc(cx, bot - outer, outer, Math.PI, 0, true);
  ctx.lineTo(cx + outer, top);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - inner, top + h * 0.04);
  ctx.lineTo(cx - inner, bot - outer);
  ctx.arc(cx, bot - outer, inner, Math.PI, 0, true);
  ctx.lineTo(cx + inner, top + h * 0.04);
  ctx.stroke();
  // Threaded cap
  roundRectPath(ctx, cx - outer * 1.1, B.y1 + h * 0.04, outer * 2.2, h * 0.1, 2);
  ctx.stroke();
  ctx.restore();
};

/** Glass desiccator with lid and plate. */
export const drawDesiccatorInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  // Body
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.12, B.y1 + h * 0.42);
  ctx.lineTo(B.x1 + w * 0.12, B.y2 - h * 0.12);
  ctx.quadraticCurveTo(cx, B.y2 - h * 0.02, B.x2 - w * 0.12, B.y2 - h * 0.12);
  ctx.lineTo(B.x2 - w * 0.12, B.y1 + h * 0.42);
  ctx.stroke();
  // Ground flange
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.08, B.y1 + h * 0.42);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.42);
  ctx.stroke();
  // Domed lid
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.1, B.y1 + h * 0.42);
  ctx.quadraticCurveTo(cx, B.y1 + h * 0.05, B.x2 - w * 0.1, B.y1 + h * 0.42);
  ctx.stroke();
  // Knob
  ctx.beginPath();
  ctx.arc(cx, B.y1 + h * 0.18, w * 0.05, 0, Math.PI * 2);
  ctx.stroke();
  // Porcelain plate
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.2, B.y1 + h * 0.62);
  ctx.lineTo(B.x2 - w * 0.2, B.y1 + h * 0.62);
  ctx.stroke();
  // Desiccant dots
  ctx.fillStyle = CONICAL_FLASK_OUTLINE;
  for (const u of [0.35, 0.5, 0.65]) {
    ctx.beginPath();
    ctx.arc(B.x1 + w * u, B.y1 + h * 0.78, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

/** Pear-shaped flask. */
export const drawPearShapedFlaskInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  const neckHalf = w * 0.08;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  if (!opts.outlineOnly && level > 1e-4) {
    ctx.fillStyle = opts.liquidColor;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.28, B.y1 + h * 0.55);
    ctx.quadraticCurveTo(cx - w * 0.38, B.y1 + h * 0.75, cx, B.y2 - h * 0.08);
    ctx.quadraticCurveTo(cx + w * 0.38, B.y1 + h * 0.75, cx + w * 0.28, B.y1 + h * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Neck
  ctx.beginPath();
  ctx.moveTo(cx - neckHalf, B.y1 + h * 0.08);
  ctx.lineTo(cx - neckHalf, B.y1 + h * 0.32);
  ctx.moveTo(cx + neckHalf, B.y1 + h * 0.08);
  ctx.lineTo(cx + neckHalf, B.y1 + h * 0.32);
  ctx.stroke();
  roundRectPath(ctx, cx - neckHalf * 1.5, B.y1 + h * 0.05, neckHalf * 3, h * 0.04, 2);
  ctx.stroke();
  // Pear body
  ctx.beginPath();
  ctx.moveTo(cx - neckHalf, B.y1 + h * 0.32);
  ctx.quadraticCurveTo(cx - w * 0.2, B.y1 + h * 0.42, cx - w * 0.32, B.y1 + h * 0.58);
  ctx.quadraticCurveTo(cx - w * 0.4, B.y1 + h * 0.78, cx, B.y2 - h * 0.08);
  ctx.quadraticCurveTo(cx + w * 0.4, B.y1 + h * 0.78, cx + w * 0.32, B.y1 + h * 0.58);
  ctx.quadraticCurveTo(cx + w * 0.2, B.y1 + h * 0.42, cx + neckHalf, B.y1 + h * 0.32);
  ctx.stroke();
  ctx.restore();
};

/** Bunsen burner with flame. */
export const drawBunsenBurnerInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  // Base
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.15, B.y2 - h * 0.12);
  ctx.lineTo(B.x2 - w * 0.15, B.y2 - h * 0.12);
  ctx.lineTo(B.x2 - w * 0.28, B.y2 - h * 0.05);
  ctx.lineTo(B.x1 + w * 0.28, B.y2 - h * 0.05);
  ctx.closePath();
  ctx.stroke();
  // Barrel
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.1, B.y2 - h * 0.12);
  ctx.lineTo(cx - w * 0.1, B.y1 + h * 0.38);
  ctx.moveTo(cx + w * 0.1, B.y2 - h * 0.12);
  ctx.lineTo(cx + w * 0.1, B.y1 + h * 0.38);
  ctx.stroke();
  // Air vents
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.1, B.y1 + h * 0.55);
  ctx.lineTo(cx + w * 0.1, B.y1 + h * 0.55);
  ctx.stroke();
  // Gas inlet
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.1, B.y2 - h * 0.22);
  ctx.lineTo(B.x2 - w * 0.12, B.y2 - h * 0.22);
  ctx.stroke();
  // Flame
  ctx.strokeStyle = '#e67e22';
  ctx.fillStyle = 'rgba(241, 196, 15, 0.35)';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.12, B.y1 + h * 0.38);
  ctx.quadraticCurveTo(cx - w * 0.08, B.y1 + h * 0.18, cx, B.y1 + h * 0.06);
  ctx.quadraticCurveTo(cx + w * 0.08, B.y1 + h * 0.18, cx + w * 0.12, B.y1 + h * 0.38);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
};

/** Alcohol / spirit lamp. */
export const drawAlcoholLampInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  // Reservoir
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.2, B.y1 + h * 0.45);
  ctx.lineTo(B.x1 + w * 0.2, B.y2 - h * 0.12);
  ctx.quadraticCurveTo(cx, B.y2 - h * 0.04, B.x2 - w * 0.2, B.y2 - h * 0.12);
  ctx.lineTo(B.x2 - w * 0.2, B.y1 + h * 0.45);
  ctx.quadraticCurveTo(cx, B.y1 + h * 0.38, B.x1 + w * 0.2, B.y1 + h * 0.45);
  ctx.stroke();
  // Cap / wick holder
  roundRectPath(ctx, cx - w * 0.12, B.y1 + h * 0.32, w * 0.24, h * 0.14, 2);
  ctx.stroke();
  // Wick
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.03, B.y1 + h * 0.32);
  ctx.lineTo(cx - w * 0.02, B.y1 + h * 0.22);
  ctx.moveTo(cx + w * 0.03, B.y1 + h * 0.32);
  ctx.lineTo(cx + w * 0.02, B.y1 + h * 0.22);
  ctx.stroke();
  // Small flame
  ctx.strokeStyle = '#e67e22';
  ctx.fillStyle = 'rgba(241, 196, 15, 0.4)';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.08, B.y1 + h * 0.22);
  ctx.quadraticCurveTo(cx, B.y1 + h * 0.06, cx + w * 0.08, B.y1 + h * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
};

/** Sand bath (dish + sand texture). */
export const drawSandBathInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  drawBathDishInBox(ctx, x1, y1, x2, y2, opts, 'oil');
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  ctx.save();
  ctx.fillStyle = '#8a6a3a';
  for (const [u, v] of [
    [0.3, 0.48],
    [0.42, 0.55],
    [0.55, 0.5],
    [0.68, 0.56],
    [0.48, 0.62],
  ] as const) {
    ctx.beginPath();
    ctx.arc(B.x1 + w * u, B.y1 + h * v, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

/** Steam bath with concentric ring lids. */
export const drawSteamBathInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const cy = B.y1 + h * 0.42;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  // Pot body
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.12, B.y1 + h * 0.35);
  ctx.lineTo(B.x1 + w * 0.15, B.y2 - h * 0.12);
  ctx.lineTo(B.x2 - w * 0.15, B.y2 - h * 0.12);
  ctx.lineTo(B.x2 - w * 0.12, B.y1 + h * 0.35);
  ctx.stroke();
  if (!opts.outlineOnly && opts.liquidLevel > 1e-4) {
    ctx.fillStyle = opts.liquidColor;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(B.x1 + w * 0.16, B.y1 + h * 0.55, w * 0.68, h * 0.28);
    ctx.globalAlpha = 1;
  }
  // Concentric rings
  for (const r of [0.32, 0.22, 0.12]) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * r, h * r * 0.45, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Steam wisps
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.08, B.y1 + h * 0.2);
  ctx.quadraticCurveTo(cx - w * 0.02, B.y1 + h * 0.08, cx + w * 0.04, B.y1 + h * 0.18);
  ctx.stroke();
  ctx.restore();
};

/** Heated water bath. */
export const drawWaterBathInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => drawBathDishInBox(ctx, x1, y1, x2, y2, opts, 'oil');

/** Laboratory heat gun. */
export const drawHeatGunInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  // Body
  roundRectPath(ctx, B.x1 + w * 0.08, B.y1 + h * 0.28, w * 0.55, h * 0.4, 4);
  ctx.stroke();
  // Handle
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.25, B.y1 + h * 0.68);
  ctx.lineTo(B.x1 + w * 0.22, B.y2 - h * 0.1);
  ctx.lineTo(B.x1 + w * 0.38, B.y2 - h * 0.1);
  ctx.lineTo(B.x1 + w * 0.4, B.y1 + h * 0.68);
  ctx.stroke();
  // Nozzle
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.63, B.y1 + h * 0.35);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.4);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.55);
  ctx.lineTo(B.x1 + w * 0.63, B.y1 + h * 0.6);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
};

/** Aluminum heating block with wells. */
export const drawHeatingBlockInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#555555';
  ctx.fillStyle = 'rgba(160, 160, 170, 0.25)';
  ctx.lineWidth = opts.lineWidth;
  roundRectPath(ctx, B.x1 + w * 0.1, B.y1 + h * 0.2, w * 0.8, h * 0.65, 3);
  ctx.fill();
  ctx.stroke();
  // Wells 2x2
  for (const u of [0.32, 0.58]) {
    for (const v of [0.38, 0.58]) {
      ctx.beginPath();
      ctx.arc(B.x1 + w * u, B.y1 + h * v, Math.min(w, h) * 0.08, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
};

/** Overhead mechanical stirrer. */
export const drawOverheadStirrerInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  // Motor head
  roundRectPath(ctx, cx - w * 0.28, B.y1 + h * 0.06, w * 0.56, h * 0.22, 4);
  ctx.stroke();
  // Chuck
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.1, B.y1 + h * 0.28);
  ctx.lineTo(cx - w * 0.08, B.y1 + h * 0.36);
  ctx.lineTo(cx + w * 0.08, B.y1 + h * 0.36);
  ctx.lineTo(cx + w * 0.1, B.y1 + h * 0.28);
  ctx.stroke();
  // Shaft
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.03, B.y1 + h * 0.36);
  ctx.lineTo(cx - w * 0.03, B.y2 - h * 0.22);
  ctx.moveTo(cx + w * 0.03, B.y1 + h * 0.36);
  ctx.lineTo(cx + w * 0.03, B.y2 - h * 0.22);
  ctx.stroke();
  // Paddle
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.28, B.y2 - h * 0.18);
  ctx.lineTo(cx + w * 0.28, B.y2 - h * 0.18);
  ctx.moveTo(cx - w * 0.22, B.y2 - h * 0.12);
  ctx.lineTo(cx + w * 0.22, B.y2 - h * 0.12);
  ctx.stroke();
  ctx.restore();
};

/** Four-neck RBF — three-neck plus a short rear neck. */
export const drawFourNeckRbfInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const outline = CONICAL_FLASK_OUTLINE;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));

  const ballR = Math.min(w * 0.36, h * 0.36);
  const ballCy = B.y2 - ballR - h * 0.06;
  const neckHalf = w * 0.05;
  const centerNeckTop = B.y1 + h * 0.05;
  const rearNeckTop = B.y1 + h * 0.16;
  const sideNeckLen = h * 0.24;
  const sideAngle = 0.58;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts.lineWidth;

  if (!opts.outlineOnly && level > 1e-4) {
    const ballTop = ballCy - ballR;
    const ballBot = ballCy + ballR;
    const fillY = ballBot - (ballBot - ballTop) * level;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, ballCy, ballR, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(B.x1 - 2, fillY, w + 4, ballBot - fillY + 4);
    ctx.fillStyle = opts.liquidColor;
    ctx.fill();
    ctx.restore();
  }

  const joinY = ballCy - Math.sqrt(Math.max(0, ballR * ballR - neckHalf * neckHalf));

  // Center neck
  ctx.beginPath();
  ctx.moveTo(cx - neckHalf, centerNeckTop);
  ctx.lineTo(cx - neckHalf, joinY);
  ctx.moveTo(cx + neckHalf, centerNeckTop);
  ctx.lineTo(cx + neckHalf, joinY);
  ctx.stroke();
  roundRectPath(
    ctx,
    cx - neckHalf * 1.6,
    centerNeckTop - h * 0.02,
    neckHalf * 3.2,
    Math.max(2, h * 0.03),
    2,
  );
  ctx.stroke();

  // Rear neck (shorter, drawn slightly behind center)
  const rearHalf = neckHalf * 0.85;
  ctx.beginPath();
  ctx.moveTo(cx - rearHalf, rearNeckTop);
  ctx.lineTo(cx - rearHalf, joinY + h * 0.02);
  ctx.moveTo(cx + rearHalf, rearNeckTop);
  ctx.lineTo(cx + rearHalf, joinY + h * 0.02);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - rearHalf * 1.5, rearNeckTop);
  ctx.lineTo(cx + rearHalf * 1.5, rearNeckTop);
  ctx.stroke();

  // Side necks
  for (const sign of [-1, 1] as const) {
    const baseX = cx + sign * ballR * 0.58;
    const baseY = ballCy - ballR * 0.32;
    const tipX = baseX + sign * Math.sin(sideAngle) * sideNeckLen;
    const tipY = baseY - Math.cos(sideAngle) * sideNeckLen;
    const ox = -sign * Math.cos(sideAngle) * neckHalf;
    const oy = -Math.sin(sideAngle) * neckHalf;
    ctx.beginPath();
    ctx.moveTo(baseX + ox, baseY + oy);
    ctx.lineTo(tipX + ox, tipY + oy);
    ctx.moveTo(baseX - ox, baseY - oy);
    ctx.lineTo(tipX - ox, tipY - oy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tipX + ox * 1.4, tipY + oy * 1.4);
    ctx.lineTo(tipX - ox * 1.4, tipY - oy * 1.4);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(cx, ballCy, ballR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

/** Rotary evaporator body: motor + vapor duct + condenser. */
export const drawRotovapBodyInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  // Motor housing
  roundRectPath(ctx, B.x1 + w * 0.05, B.y1 + h * 0.28, w * 0.28, h * 0.45, 4);
  ctx.stroke();
  // Drive axis / vapor duct
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.33, B.y1 + h * 0.5);
  ctx.lineTo(B.x1 + w * 0.52, B.y1 + h * 0.5);
  ctx.stroke();
  // Condenser jacket
  roundRectPath(ctx, B.x1 + w * 0.5, B.y1 + h * 0.18, w * 0.38, h * 0.55, 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.56, B.y1 + h * 0.28);
  ctx.lineTo(B.x1 + w * 0.82, B.y1 + h * 0.28);
  ctx.moveTo(B.x1 + w * 0.56, B.y1 + h * 0.62);
  ctx.lineTo(B.x1 + w * 0.82, B.y1 + h * 0.62);
  ctx.stroke();
  // Coolant stubs
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.72, B.y1 + h * 0.18);
  ctx.lineTo(B.x1 + w * 0.72, B.y1 + h * 0.08);
  ctx.moveTo(B.x1 + w * 0.88, B.y1 + h * 0.35);
  ctx.lineTo(B.x2 - w * 0.02, B.y1 + h * 0.35);
  ctx.stroke();
  // Receiver takeoff
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.68, B.y1 + h * 0.73);
  ctx.lineTo(B.x1 + w * 0.68, B.y2 - h * 0.08);
  ctx.lineTo(B.x1 + w * 0.78, B.y2 - h * 0.08);
  ctx.stroke();
  // Vapor inlet (left)
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.05, B.y1 + h * 0.55);
  ctx.lineTo(B.x1 + w * 0.02, B.y1 + h * 0.55);
  ctx.stroke();
  ctx.restore();
};

/** Water-jet aspirator. */
export const drawAspiratorInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  // Vertical water path
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.12, B.y1 + h * 0.08);
  ctx.lineTo(cx - w * 0.1, B.y1 + h * 0.4);
  ctx.lineTo(cx - w * 0.06, B.y2 - h * 0.1);
  ctx.moveTo(cx + w * 0.12, B.y1 + h * 0.08);
  ctx.lineTo(cx + w * 0.1, B.y1 + h * 0.4);
  ctx.lineTo(cx + w * 0.06, B.y2 - h * 0.1);
  ctx.stroke();
  // Side vacuum arm
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.1, B.y1 + h * 0.42);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.42);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.52);
  ctx.stroke();
  // Body bulge
  ctx.beginPath();
  ctx.ellipse(cx, B.y1 + h * 0.45, w * 0.22, h * 0.12, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

/** Dial vacuum / pressure gauge. */
export const drawVacuumGaugeInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const cy = B.y1 + h * 0.4;
  const r = Math.min(w, h) * 0.32;
  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // Needle
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + r * 0.55, cy - r * 0.45);
  ctx.stroke();
  // Tick marks
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * 0.75 + (Math.PI * 1.5 * i) / 4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75);
    ctx.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95);
    ctx.stroke();
  }
  // Stem
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.06, cy + r);
  ctx.lineTo(cx - w * 0.06, B.y2 - h * 0.08);
  ctx.lineTo(cx + w * 0.06, B.y2 - h * 0.08);
  ctx.lineTo(cx + w * 0.06, cy + r);
  ctx.stroke();
  ctx.restore();
};

/** Compressed gas cylinder with regulator. */
export const drawGasCylinderInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  // Cylinder body
  roundRectPath(ctx, cx - w * 0.28, B.y1 + h * 0.22, w * 0.56, h * 0.68, 8);
  ctx.stroke();
  // Shoulder / valve
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.12, B.y1 + h * 0.22);
  ctx.lineTo(cx - w * 0.1, B.y1 + h * 0.12);
  ctx.lineTo(cx + w * 0.1, B.y1 + h * 0.12);
  ctx.lineTo(cx + w * 0.12, B.y1 + h * 0.22);
  ctx.stroke();
  // Regulator
  ctx.beginPath();
  ctx.arc(cx + w * 0.22, B.y1 + h * 0.18, Math.min(w, h) * 0.08, 0, Math.PI * 2);
  ctx.stroke();
  // Outlet
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.3, B.y1 + h * 0.2);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.28);
  ctx.stroke();
  // Base ring
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.32, B.y2 - h * 0.08);
  ctx.lineTo(cx + w * 0.32, B.y2 - h * 0.08);
  ctx.stroke();
  ctx.restore();
};

/** Schematic fume hood. */
export const drawFumeHoodInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  // Outer cabinet
  roundRectPath(ctx, B.x1 + w * 0.04, B.y1 + h * 0.08, w * 0.92, h * 0.84, 3);
  ctx.stroke();
  // Sash line
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.08, B.y1 + h * 0.38);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.38);
  ctx.stroke();
  // Workbench
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.08, B.y2 - h * 0.22);
  ctx.lineTo(B.x2 - w * 0.08, B.y2 - h * 0.22);
  ctx.stroke();
  // Exhaust baffle / vent marks
  for (let i = 0; i < 3; i++) {
    const x = B.x1 + w * (0.3 + i * 0.2);
    ctx.beginPath();
    ctx.moveTo(x, B.y1 + h * 0.14);
    ctx.lineTo(x, B.y1 + h * 0.22);
    ctx.stroke();
  }
  ctx.restore();
};

/** Weighing boat. */
export const drawWeighingBoatInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.08, B.y1 + h * 0.35);
  ctx.lineTo(B.x1 + w * 0.18, B.y2 - h * 0.2);
  ctx.lineTo(B.x2 - w * 0.18, B.y2 - h * 0.2);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.35);
  ctx.quadraticCurveTo((B.x1 + B.x2) / 2, B.y1 + h * 0.15, B.x1 + w * 0.08, B.y1 + h * 0.35);
  ctx.stroke();
  ctx.restore();
};

/** Forceps / tweezers. */
export const drawForcepsInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cy = (B.y1 + B.y2) / 2;
  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.08, cy - h * 0.18);
  ctx.quadraticCurveTo(B.x1 + w * 0.45, cy - h * 0.08, B.x2 - w * 0.08, cy - h * 0.05);
  ctx.moveTo(B.x1 + w * 0.08, cy + h * 0.18);
  ctx.quadraticCurveTo(B.x1 + w * 0.45, cy + h * 0.08, B.x2 - w * 0.08, cy + h * 0.05);
  ctx.stroke();
  // Pivot
  ctx.beginPath();
  ctx.arc(B.x1 + w * 0.28, cy, Math.min(w, h) * 0.06, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

/** Mortar and pestle. */
export const drawMortarPestleInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = B.x1 + w * 0.4;
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  // Mortar bowl
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.28, B.y1 + h * 0.35);
  ctx.quadraticCurveTo(cx - w * 0.3, B.y2 - h * 0.15, cx, B.y2 - h * 0.1);
  ctx.quadraticCurveTo(cx + w * 0.3, B.y2 - h * 0.15, cx + w * 0.28, B.y1 + h * 0.35);
  ctx.stroke();
  // Rim
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.3, B.y1 + h * 0.35);
  ctx.lineTo(cx + w * 0.3, B.y1 + h * 0.35);
  ctx.stroke();
  // Pestle
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.55, B.y1 + h * 0.15);
  ctx.lineTo(B.x1 + w * 0.78, B.y1 + h * 0.55);
  ctx.lineTo(B.x1 + w * 0.72, B.y1 + h * 0.6);
  ctx.lineTo(B.x1 + w * 0.5, B.y1 + h * 0.22);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
};

/** Crystallizing dish. */
export const drawCrystallizingDishInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  if (!opts.outlineOnly && level > 1e-4) {
    const fillTop = B.y2 - h * 0.2 - (h * 0.45) * level;
    ctx.fillStyle = opts.liquidColor;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(B.x1 + w * 0.12, fillTop);
    ctx.lineTo(B.x1 + w * 0.15, B.y2 - h * 0.15);
    ctx.lineTo(B.x2 - w * 0.15, B.y2 - h * 0.15);
    ctx.lineTo(B.x2 - w * 0.12, fillTop);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.08, B.y1 + h * 0.28);
  ctx.lineTo(B.x1 + w * 0.14, B.y2 - h * 0.12);
  ctx.lineTo(B.x2 - w * 0.14, B.y2 - h * 0.12);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.28);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.08, B.y1 + h * 0.28);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.28);
  ctx.stroke();
  ctx.restore();
};

/** Petri dish with lid. */
export const drawPetriDishInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  // Lid (top ellipse)
  ctx.beginPath();
  ctx.ellipse((B.x1 + B.x2) / 2, B.y1 + h * 0.28, w * 0.42, h * 0.12, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Dish
  ctx.beginPath();
  ctx.ellipse((B.x1 + B.x2) / 2, B.y1 + h * 0.55, w * 0.4, h * 0.18, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (!opts.outlineOnly && level > 1e-4) {
    ctx.fillStyle = opts.liquidColor;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.ellipse(
      (B.x1 + B.x2) / 2,
      B.y1 + h * 0.55,
      w * 0.32 * level + w * 0.08,
      h * 0.1,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Side walls hint
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.1, B.y1 + h * 0.55);
  ctx.lineTo(B.x1 + w * 0.12, B.y2 - h * 0.18);
  ctx.moveTo(B.x2 - w * 0.1, B.y1 + h * 0.55);
  ctx.lineTo(B.x2 - w * 0.12, B.y2 - h * 0.18);
  ctx.stroke();
  ctx.restore();
};

/** Microscale Hickman / short-path head. */
export const drawHickmanHeadInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  // Vertical neck
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.1, B.y1 + h * 0.08);
  ctx.lineTo(cx - w * 0.12, B.y2 - h * 0.1);
  ctx.moveTo(cx + w * 0.1, B.y1 + h * 0.08);
  ctx.lineTo(cx + w * 0.12, B.y2 - h * 0.1);
  ctx.stroke();
  // Collection well (side bulb)
  ctx.beginPath();
  ctx.ellipse(cx + w * 0.28, B.y1 + h * 0.52, w * 0.18, h * 0.14, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.12, B.y1 + h * 0.48);
  ctx.lineTo(cx + w * 0.16, B.y1 + h * 0.48);
  ctx.stroke();
  // Top rim
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.14, B.y1 + h * 0.08);
  ctx.lineTo(cx + w * 0.14, B.y1 + h * 0.08);
  ctx.stroke();
  ctx.restore();
};

/** Jacketed reactor vessel. */
export const drawJacketedReactorInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  // Outer jacket
  roundRectPath(ctx, cx - w * 0.38, B.y1 + h * 0.22, w * 0.76, h * 0.68, 10);
  ctx.stroke();
  // Inner vessel
  roundRectPath(ctx, cx - w * 0.26, B.y1 + h * 0.28, w * 0.52, h * 0.56, 8);
  ctx.stroke();
  if (!opts.outlineOnly && level > 1e-4) {
    const innerTop = B.y1 + h * 0.28;
    const innerBot = B.y1 + h * 0.84;
    const fillY = innerBot - (innerBot - innerTop) * level;
    ctx.save();
    roundRectPath(ctx, cx - w * 0.26, innerTop, w * 0.52, h * 0.56, 8);
    ctx.clip();
    ctx.fillStyle = opts.liquidColor;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(cx - w * 0.28, fillY, w * 0.56, innerBot - fillY + 2);
    ctx.restore();
  }
  // Neck
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.1, B.y1 + h * 0.08);
  ctx.lineTo(cx - w * 0.1, B.y1 + h * 0.28);
  ctx.moveTo(cx + w * 0.1, B.y1 + h * 0.08);
  ctx.lineTo(cx + w * 0.1, B.y1 + h * 0.28);
  ctx.stroke();
  // Coolant stubs
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.38, B.y1 + h * 0.35);
  ctx.lineTo(B.x1 + w * 0.06, B.y1 + h * 0.35);
  ctx.moveTo(cx - w * 0.38, B.y1 + h * 0.7);
  ctx.lineTo(B.x1 + w * 0.06, B.y1 + h * 0.7);
  ctx.stroke();
  ctx.restore();
};

/** Narrow Schlenk tube. */
export const drawSchlenkTubeInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  const half = w * 0.22;
  if (!opts.outlineOnly && level > 1e-4) {
    const top = B.y1 + h * 0.2;
    const bot = B.y2 - h * 0.08;
    const fillY = bot - (bot - top) * level;
    ctx.fillStyle = opts.liquidColor;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(cx - half, fillY, half * 2, bot - fillY);
    ctx.globalAlpha = 1;
  }
  ctx.beginPath();
  ctx.moveTo(cx - half, B.y1 + h * 0.08);
  ctx.lineTo(cx - half, B.y2 - h * 0.08);
  ctx.quadraticCurveTo(cx, B.y2 - h * 0.02, cx + half, B.y2 - h * 0.08);
  ctx.lineTo(cx + half, B.y1 + h * 0.08);
  ctx.stroke();
  // Cap rim
  ctx.beginPath();
  ctx.moveTo(cx - half * 1.2, B.y1 + h * 0.08);
  ctx.lineTo(cx + half * 1.2, B.y1 + h * 0.08);
  ctx.stroke();
  // Sidearm
  ctx.beginPath();
  ctx.moveTo(cx + half, B.y1 + h * 0.28);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.28);
  ctx.stroke();
  // Stopcock mark
  ctx.beginPath();
  ctx.moveTo(B.x2 - w * 0.22, B.y1 + h * 0.22);
  ctx.lineTo(B.x2 - w * 0.14, B.y1 + h * 0.34);
  ctx.stroke();
  ctx.restore();
};

/** Fritted gas dispersion tube. */
export const drawGasDispersionTubeInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.12, B.y1 + h * 0.08);
  ctx.lineTo(cx - w * 0.12, B.y2 - h * 0.22);
  ctx.moveTo(cx + w * 0.12, B.y1 + h * 0.08);
  ctx.lineTo(cx + w * 0.12, B.y2 - h * 0.22);
  ctx.stroke();
  // Frit bulb
  ctx.beginPath();
  ctx.ellipse(cx, B.y2 - h * 0.16, w * 0.22, h * 0.1, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Frit hatch
  for (let i = 0; i < 3; i++) {
    const y = B.y2 - h * (0.2 - i * 0.03);
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.14, y);
    ctx.lineTo(cx + w * 0.14, y);
    ctx.stroke();
  }
  ctx.restore();
};

/** Iron ring clamp. */
export const drawRingClampInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cy = (B.y1 + B.y2) / 2;
  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  // Boss
  roundRectPath(ctx, B.x1 + w * 0.04, cy - h * 0.22, w * 0.18, h * 0.44, 3);
  ctx.stroke();
  // Arm
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.22, cy);
  ctx.lineTo(B.x1 + w * 0.4, cy);
  ctx.stroke();
  // Ring
  ctx.beginPath();
  ctx.ellipse(B.x1 + w * 0.62, cy, w * 0.28, h * 0.32, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

/** Analytical balance schematic. */
export const drawAnalyticalBalanceInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  // Base
  roundRectPath(ctx, B.x1 + w * 0.1, B.y1 + h * 0.45, w * 0.8, h * 0.42, 4);
  ctx.stroke();
  // Display
  roundRectPath(ctx, cx - w * 0.22, B.y1 + h * 0.55, w * 0.44, h * 0.16, 2);
  ctx.stroke();
  // Pan / draft shield top
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.22, B.y1 + h * 0.45);
  ctx.lineTo(B.x1 + w * 0.22, B.y1 + h * 0.18);
  ctx.lineTo(B.x2 - w * 0.22, B.y1 + h * 0.18);
  ctx.lineTo(B.x2 - w * 0.22, B.y1 + h * 0.45);
  ctx.stroke();
  // Pan
  ctx.beginPath();
  ctx.ellipse(cx, B.y1 + h * 0.38, w * 0.2, h * 0.06, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

/** Stemless funnel for hot filtration. */
export const drawStemlessFunnelInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.08, B.y1 + h * 0.12);
  ctx.lineTo(cx - w * 0.08, B.y2 - h * 0.18);
  ctx.lineTo(cx + w * 0.08, B.y2 - h * 0.18);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.12);
  ctx.stroke();
  // Rim
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.08, B.y1 + h * 0.12);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.12);
  ctx.stroke();
  // Fluting hint
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.15, B.y1 + h * 0.28);
  ctx.lineTo(cx - w * 0.05, B.y2 - h * 0.28);
  ctx.moveTo(cx + w * 0.15, B.y1 + h * 0.28);
  ctx.lineTo(cx + w * 0.05, B.y2 - h * 0.28);
  ctx.stroke();
  ctx.restore();
};

/** Metal ground-glass joint clip. */
export const drawMetalJointClipInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const cy = (B.y1 + B.y2) / 2;
  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(w, h) * 0.28, 0.4, Math.PI * 2 - 0.4);
  ctx.stroke();
  // Arms
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.18, cy - h * 0.15);
  ctx.lineTo(cx - w * 0.32, cy - h * 0.32);
  ctx.moveTo(cx + w * 0.18, cy - h * 0.15);
  ctx.lineTo(cx + w * 0.32, cy - h * 0.32);
  ctx.stroke();
  // Screw
  ctx.beginPath();
  ctx.arc(cx, cy + h * 0.22, Math.min(w, h) * 0.08, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

/** Glovebox with main chamber + antechamber. */
export const drawGloveboxInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  // Main chamber
  roundRectPath(ctx, B.x1 + w * 0.04, B.y1 + h * 0.12, w * 0.62, h * 0.76, 4);
  ctx.stroke();
  // Antechamber
  roundRectPath(ctx, B.x1 + w * 0.68, B.y1 + h * 0.22, w * 0.28, h * 0.56, 4);
  ctx.stroke();
  // Glove ports
  ctx.beginPath();
  ctx.ellipse(B.x1 + w * 0.22, B.y2 - h * 0.22, w * 0.08, h * 0.1, 0, 0, Math.PI * 2);
  ctx.ellipse(B.x1 + w * 0.48, B.y2 - h * 0.22, w * 0.08, h * 0.1, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Window
  roundRectPath(ctx, B.x1 + w * 0.12, B.y1 + h * 0.22, w * 0.46, h * 0.32, 2);
  ctx.stroke();
  // Gas port
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.04, B.y1 + h * 0.35);
  ctx.lineTo(B.x1 + w * 0.01, B.y1 + h * 0.35);
  ctx.stroke();
  ctx.restore();
};

/** Dual Schlenk vacuum/inert manifold. */
export const drawSchlenkManifoldInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  // Dual horizontal lines
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.08, B.y1 + h * 0.32);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.32);
  ctx.moveTo(B.x1 + w * 0.08, B.y1 + h * 0.62);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.62);
  ctx.stroke();
  // End bulbs / traps
  ctx.beginPath();
  ctx.arc(B.x1 + w * 0.12, B.y1 + h * 0.32, Math.min(w, h) * 0.06, 0, Math.PI * 2);
  ctx.arc(B.x1 + w * 0.12, B.y1 + h * 0.62, Math.min(w, h) * 0.06, 0, Math.PI * 2);
  ctx.stroke();
  // Stopcock ports down
  for (const x of [0.45, 0.65, 0.85]) {
    ctx.beginPath();
    ctx.moveTo(B.x1 + w * x, B.y1 + h * 0.32);
    ctx.lineTo(B.x1 + w * x, B.y1 + h * 0.62);
    ctx.lineTo(B.x1 + w * x, B.y2 - h * 0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(B.x1 + w * x - w * 0.04, B.y1 + h * 0.48);
    ctx.lineTo(B.x1 + w * x + w * 0.04, B.y1 + h * 0.48);
    ctx.stroke();
  }
  ctx.restore();
};

/** Fritted filter cannula. */
export const drawFilterCannulaInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cy = (B.y1 + B.y2) / 2;
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.06, cy);
  ctx.lineTo(B.x2 - w * 0.22, cy);
  ctx.stroke();
  // Frit tip
  ctx.beginPath();
  ctx.ellipse(B.x2 - w * 0.14, cy, w * 0.08, h * 0.22, 0, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const x = B.x2 - w * (0.18 - i * 0.03);
    ctx.beginPath();
    ctx.moveTo(x, cy - h * 0.12);
    ctx.lineTo(x, cy + h * 0.12);
    ctx.stroke();
  }
  ctx.restore();
};

/** Stainless double-ended transfer needle. */
export const drawTransferNeedleInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cy = (B.y1 + B.y2) / 2;
  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.08, cy - h * 0.08);
  ctx.lineTo(B.x1 + w * 0.2, cy);
  ctx.lineTo(B.x2 - w * 0.2, cy);
  ctx.lineTo(B.x2 - w * 0.08, cy - h * 0.08);
  ctx.moveTo(B.x1 + w * 0.08, cy + h * 0.08);
  ctx.lineTo(B.x1 + w * 0.2, cy);
  ctx.moveTo(B.x2 - w * 0.08, cy + h * 0.08);
  ctx.lineTo(B.x2 - w * 0.2, cy);
  ctx.stroke();
  // Hub
  roundRectPath(ctx, (B.x1 + B.x2) / 2 - w * 0.06, cy - h * 0.2, w * 0.12, h * 0.4, 2);
  ctx.stroke();
  ctx.restore();
};

/** Parr / autoclave pressure reactor. */
export const drawPressureReactorInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  // Thick body
  roundRectPath(ctx, cx - w * 0.32, B.y1 + h * 0.28, w * 0.64, h * 0.6, 8);
  ctx.stroke();
  if (!opts.outlineOnly && level > 1e-4) {
    const top = B.y1 + h * 0.28;
    const bot = B.y1 + h * 0.88;
    const fillY = bot - (bot - top) * level;
    ctx.save();
    roundRectPath(ctx, cx - w * 0.32, top, w * 0.64, h * 0.6, 8);
    ctx.clip();
    ctx.fillStyle = opts.liquidColor;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(cx - w * 0.34, fillY, w * 0.68, bot - fillY + 2);
    ctx.restore();
  }
  // Lid / bolts
  roundRectPath(ctx, cx - w * 0.36, B.y1 + h * 0.18, w * 0.72, h * 0.14, 3);
  ctx.stroke();
  for (const x of [-0.28, -0.1, 0.1, 0.28]) {
    ctx.beginPath();
    ctx.arc(cx + w * x, B.y1 + h * 0.25, Math.min(w, h) * 0.03, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Gas inlet
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.32, B.y1 + h * 0.35);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.28);
  ctx.stroke();
  ctx.restore();
};

/** Microwave reactor. */
export const drawMicrowaveReactorInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  roundRectPath(ctx, B.x1 + w * 0.1, B.y1 + h * 0.15, w * 0.8, h * 0.7, 6);
  ctx.stroke();
  // Door / cavity
  roundRectPath(ctx, B.x1 + w * 0.2, B.y1 + h * 0.28, w * 0.45, h * 0.42, 4);
  ctx.stroke();
  // Control panel
  roundRectPath(ctx, B.x1 + w * 0.7, B.y1 + h * 0.3, w * 0.14, h * 0.35, 2);
  ctx.stroke();
  // Vial hint
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.08, B.y1 + h * 0.4);
  ctx.lineTo(cx - w * 0.08, B.y1 + h * 0.62);
  ctx.lineTo(cx + w * 0.08, B.y1 + h * 0.62);
  ctx.lineTo(cx + w * 0.08, B.y1 + h * 0.4);
  ctx.stroke();
  ctx.restore();
};

/** Syringe pump. */
export const drawSyringePumpInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  roundRectPath(ctx, B.x1 + w * 0.08, B.y1 + h * 0.25, w * 0.55, h * 0.5, 4);
  ctx.stroke();
  // Syringe on carriage
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.55, B.y1 + h * 0.4);
  ctx.lineTo(B.x2 - w * 0.12, B.y1 + h * 0.4);
  ctx.lineTo(B.x2 - w * 0.12, B.y1 + h * 0.6);
  ctx.lineTo(B.x1 + w * 0.55, B.y1 + h * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(B.x2 - w * 0.12, B.y1 + h * 0.5);
  ctx.lineTo(B.x2 - w * 0.05, B.y1 + h * 0.5);
  ctx.stroke();
  // Plunger
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.4, B.y1 + h * 0.35);
  ctx.lineTo(B.x1 + w * 0.4, B.y1 + h * 0.65);
  ctx.stroke();
  ctx.restore();
};

/** Flow chemistry chip / tubular reactor. */
export const drawFlowReactorInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  roundRectPath(ctx, B.x1 + w * 0.12, B.y1 + h * 0.15, w * 0.76, h * 0.7, 6);
  ctx.stroke();
  if (!opts.outlineOnly && opts.liquidLevel > 1e-4) {
    ctx.strokeStyle = opts.liquidColor;
    ctx.globalAlpha = 0.7;
  }
  // Serpentine channel
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.08, B.y1 + h * 0.35);
  ctx.lineTo(B.x1 + w * 0.25, B.y1 + h * 0.35);
  ctx.lineTo(B.x1 + w * 0.35, B.y1 + h * 0.55);
  ctx.lineTo(B.x1 + w * 0.5, B.y1 + h * 0.35);
  ctx.lineTo(B.x1 + w * 0.65, B.y1 + h * 0.55);
  ctx.lineTo(B.x1 + w * 0.8, B.y1 + h * 0.4);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.5);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  // Second inlet
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.08, B.y1 + h * 0.65);
  ctx.lineTo(B.x1 + w * 0.25, B.y1 + h * 0.65);
  ctx.lineTo(B.x1 + w * 0.3, B.y1 + h * 0.55);
  ctx.stroke();
  ctx.restore();
};

/** Flash / HPLC system. */
export const drawFlashSystemInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  // Column tower
  roundRectPath(ctx, B.x1 + w * 0.22, B.y1 + h * 0.08, w * 0.36, h * 0.7, 4);
  ctx.stroke();
  // Pump / detector block
  roundRectPath(ctx, B.x1 + w * 0.08, B.y1 + h * 0.55, w * 0.2, h * 0.28, 3);
  ctx.stroke();
  // Fraction collector
  roundRectPath(ctx, B.x1 + w * 0.62, B.y1 + h * 0.55, w * 0.3, h * 0.35, 3);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      ctx.beginPath();
      ctx.arc(
        B.x1 + w * (0.7 + i * 0.08),
        B.y1 + h * (0.65 + j * 0.12),
        Math.min(w, h) * 0.025,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
  }
  // Line to collector
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.4, B.y1 + h * 0.78);
  ctx.lineTo(B.x1 + w * 0.62, B.y1 + h * 0.7);
  ctx.stroke();
  ctx.restore();
};

/** Lyophilizer / freeze-dryer. */
export const drawLyophilizerInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  // Chamber
  roundRectPath(ctx, B.x1 + w * 0.08, B.y1 + h * 0.2, w * 0.5, h * 0.65, 6);
  ctx.stroke();
  // Shelves
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.14, B.y1 + h * 0.4);
  ctx.lineTo(B.x1 + w * 0.52, B.y1 + h * 0.4);
  ctx.moveTo(B.x1 + w * 0.14, B.y1 + h * 0.55);
  ctx.lineTo(B.x1 + w * 0.52, B.y1 + h * 0.55);
  ctx.stroke();
  // Condenser / vacuum unit
  roundRectPath(ctx, B.x1 + w * 0.62, B.y1 + h * 0.3, w * 0.3, h * 0.45, 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.58, B.y1 + h * 0.45);
  ctx.lineTo(B.x1 + w * 0.62, B.y1 + h * 0.45);
  ctx.moveTo(B.x2 - w * 0.08, B.y1 + h * 0.4);
  ctx.lineTo(B.x2 - w * 0.02, B.y1 + h * 0.4);
  ctx.stroke();
  ctx.restore();
};

/** Benchtop centrifuge. */
export const drawCentrifugeInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  roundRectPath(ctx, B.x1 + w * 0.12, B.y1 + h * 0.35, w * 0.76, h * 0.5, 6);
  ctx.stroke();
  // Lid
  ctx.beginPath();
  ctx.ellipse(cx, B.y1 + h * 0.35, w * 0.32, h * 0.12, 0, Math.PI, 0);
  ctx.stroke();
  // Rotor
  ctx.beginPath();
  ctx.arc(cx, B.y1 + h * 0.55, Math.min(w, h) * 0.18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.15, B.y1 + h * 0.55);
  ctx.lineTo(cx + w * 0.15, B.y1 + h * 0.55);
  ctx.moveTo(cx, B.y1 + h * 0.42);
  ctx.lineTo(cx, B.y1 + h * 0.68);
  ctx.stroke();
  ctx.restore();
};

/** UV / photoreactor. */
export const drawPhotoreactorInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  // Housing
  roundRectPath(ctx, B.x1 + w * 0.2, B.y1 + h * 0.1, w * 0.6, h * 0.8, 6);
  ctx.stroke();
  // Lamp
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.06, B.y1 + h * 0.18);
  ctx.lineTo(cx - w * 0.06, B.y1 + h * 0.55);
  ctx.lineTo(cx + w * 0.06, B.y1 + h * 0.55);
  ctx.lineTo(cx + w * 0.06, B.y1 + h * 0.18);
  ctx.stroke();
  // Rays
  ctx.strokeStyle = '#e67e22';
  for (const a of [-0.4, 0, 0.4]) {
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(a) * w * 0.08, B.y1 + h * 0.58);
    ctx.lineTo(cx + Math.sin(a) * w * 0.18, B.y1 + h * 0.72);
    ctx.stroke();
  }
  ctx.strokeStyle = '#333333';
  // Vessel seat
  ctx.beginPath();
  ctx.ellipse(cx, B.y2 - h * 0.22, w * 0.16, h * 0.06, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

/** Electrochemical H-cell / undivided cell. */
export const drawElectrochemicalCellInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  // H-cell outline
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.1, B.y1 + h * 0.2);
  ctx.lineTo(B.x1 + w * 0.1, B.y2 - h * 0.15);
  ctx.lineTo(B.x1 + w * 0.38, B.y2 - h * 0.15);
  ctx.lineTo(B.x1 + w * 0.38, B.y1 + h * 0.55);
  ctx.lineTo(B.x1 + w * 0.62, B.y1 + h * 0.55);
  ctx.lineTo(B.x1 + w * 0.62, B.y2 - h * 0.15);
  ctx.lineTo(B.x2 - w * 0.1, B.y2 - h * 0.15);
  ctx.lineTo(B.x2 - w * 0.1, B.y1 + h * 0.2);
  ctx.stroke();
  if (!opts.outlineOnly && level > 1e-4) {
    ctx.fillStyle = opts.liquidColor;
    ctx.globalAlpha = 0.35;
    const fillH = h * 0.35 * level;
    ctx.fillRect(B.x1 + w * 0.12, B.y2 - h * 0.15 - fillH, w * 0.24, fillH);
    ctx.fillRect(B.x2 - w * 0.36, B.y2 - h * 0.15 - fillH, w * 0.24, fillH);
    ctx.globalAlpha = 1;
  }
  // Electrodes
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.24, B.y1 + h * 0.12);
  ctx.lineTo(B.x1 + w * 0.24, B.y1 + h * 0.55);
  ctx.moveTo(B.x2 - w * 0.24, B.y1 + h * 0.12);
  ctx.lineTo(B.x2 - w * 0.24, B.y1 + h * 0.55);
  ctx.stroke();
  // Labels + / −
  ctx.font = `${Math.max(8, h * 0.1)}px sans-serif`;
  ctx.fillStyle = '#333';
  ctx.fillText('+', B.x1 + w * 0.2, B.y1 + h * 0.12);
  ctx.fillText('−', B.x2 - w * 0.28, B.y1 + h * 0.12);
  ctx.restore();
};

export const drawVacuumSublimatorInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  // Outer pot
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.28, B.y1 + h * 0.45);
  ctx.lineTo(cx - w * 0.32, B.y2 - h * 0.1);
  ctx.quadraticCurveTo(cx, B.y2 - h * 0.02, cx + w * 0.32, B.y2 - h * 0.1);
  ctx.lineTo(cx + w * 0.28, B.y1 + h * 0.45);
  ctx.stroke();
  // Cold finger
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.1, B.y1 + h * 0.08);
  ctx.lineTo(cx - w * 0.1, B.y1 + h * 0.55);
  ctx.quadraticCurveTo(cx, B.y1 + h * 0.65, cx + w * 0.1, B.y1 + h * 0.55);
  ctx.lineTo(cx + w * 0.1, B.y1 + h * 0.08);
  ctx.stroke();
  // Vacuum sidearm
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.28, B.y1 + h * 0.4);
  ctx.lineTo(B.x2 - w * 0.08, B.y1 + h * 0.35);
  ctx.stroke();
  ctx.restore();
};

export const drawKugelrohrInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cy = (B.y1 + B.y2) / 2;
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.ellipse(B.x1 + w * 0.22, cy, w * 0.16, h * 0.32, 0, 0, Math.PI * 2);
  ctx.ellipse(B.x2 - w * 0.22, cy, w * 0.16, h * 0.32, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.36, cy);
  ctx.lineTo(B.x2 - w * 0.36, cy);
  ctx.stroke();
  // Joint stub
  ctx.beginPath();
  ctx.moveTo((B.x1 + B.x2) / 2 - w * 0.04, cy - h * 0.15);
  ctx.lineTo((B.x1 + B.x2) / 2 - w * 0.04, B.y1 + h * 0.15);
  ctx.lineTo((B.x1 + B.x2) / 2 + w * 0.04, B.y1 + h * 0.15);
  ctx.lineTo((B.x1 + B.x2) / 2 + w * 0.04, cy - h * 0.15);
  ctx.stroke();
  ctx.restore();
};

export const drawSolventPurificationSystemInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  // Frame
  roundRectPath(ctx, B.x1 + w * 0.06, B.y1 + h * 0.1, w * 0.88, h * 0.8, 4);
  ctx.stroke();
  // Columns
  for (const x of [0.25, 0.5, 0.75]) {
    roundRectPath(ctx, B.x1 + w * (x - 0.07), B.y1 + h * 0.18, w * 0.14, h * 0.55, 3);
    ctx.stroke();
  }
  // Manifold outlet
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.25, B.y1 + h * 0.75);
  ctx.lineTo(B.x1 + w * 0.75, B.y1 + h * 0.75);
  ctx.lineTo(B.x1 + w * 0.5, B.y2 - h * 0.12);
  ctx.stroke();
  ctx.restore();
};

export const drawTubeFurnaceInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cy = (B.y1 + B.y2) / 2;
  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  roundRectPath(ctx, B.x1 + w * 0.18, B.y1 + h * 0.2, w * 0.64, h * 0.6, 6);
  ctx.stroke();
  // Bore
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.05, cy - h * 0.1);
  ctx.lineTo(B.x2 - w * 0.05, cy - h * 0.1);
  ctx.moveTo(B.x1 + w * 0.05, cy + h * 0.1);
  ctx.lineTo(B.x2 - w * 0.05, cy + h * 0.1);
  ctx.stroke();
  ctx.restore();
};

export const drawMuffleFurnaceInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  roundRectPath(ctx, B.x1 + w * 0.12, B.y1 + h * 0.15, w * 0.76, h * 0.7, 5);
  ctx.stroke();
  roundRectPath(ctx, B.x1 + w * 0.25, B.y1 + h * 0.3, w * 0.5, h * 0.4, 3);
  ctx.stroke();
  // Handle
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.48, B.y1 + h * 0.48);
  ctx.lineTo(B.x1 + w * 0.58, B.y1 + h * 0.48);
  ctx.stroke();
  ctx.restore();
};

export const drawQuartzTubeInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cy = (B.y1 + B.y2) / 2;
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.05, cy - h * 0.25);
  ctx.lineTo(B.x2 - w * 0.05, cy - h * 0.25);
  ctx.moveTo(B.x1 + w * 0.05, cy + h * 0.25);
  ctx.lineTo(B.x2 - w * 0.05, cy + h * 0.25);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(B.x1 + w * 0.05, cy, w * 0.03, h * 0.25, 0, 0, Math.PI * 2);
  ctx.ellipse(B.x2 - w * 0.05, cy, w * 0.03, h * 0.25, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

export const drawQuartzBoatInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.1, B.y1 + h * 0.35);
  ctx.lineTo(B.x1 + w * 0.18, B.y2 - h * 0.2);
  ctx.lineTo(B.x2 - w * 0.18, B.y2 - h * 0.2);
  ctx.lineTo(B.x2 - w * 0.1, B.y1 + h * 0.35);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.1, B.y1 + h * 0.35);
  ctx.lineTo(B.x2 - w * 0.1, B.y1 + h * 0.35);
  ctx.stroke();
  ctx.restore();
};

export const drawCrucibleInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: LiquidOpts,
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  const level = Math.max(0, Math.min(1, opts.liquidLevel));
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  if (!opts.outlineOnly && level > 1e-4) {
    ctx.fillStyle = opts.liquidColor;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.22, B.y2 - h * 0.2 - h * 0.4 * level);
    ctx.lineTo(cx - w * 0.25, B.y2 - h * 0.15);
    ctx.quadraticCurveTo(cx, B.y2 - h * 0.05, cx + w * 0.25, B.y2 - h * 0.15);
    ctx.lineTo(cx + w * 0.22, B.y2 - h * 0.2 - h * 0.4 * level);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.32, B.y1 + h * 0.22);
  ctx.lineTo(cx - w * 0.25, B.y2 - h * 0.15);
  ctx.quadraticCurveTo(cx, B.y2 - h * 0.05, cx + w * 0.25, B.y2 - h * 0.15);
  ctx.lineTo(cx + w * 0.32, B.y1 + h * 0.22);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.32, B.y1 + h * 0.22);
  ctx.lineTo(cx + w * 0.32, B.y1 + h * 0.22);
  ctx.stroke();
  ctx.restore();
};

export const drawTongsInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cy = (B.y1 + B.y2) / 2;
  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.08, cy - h * 0.2);
  ctx.quadraticCurveTo(B.x1 + w * 0.45, cy - h * 0.05, B.x2 - w * 0.1, cy - h * 0.12);
  ctx.moveTo(B.x1 + w * 0.08, cy + h * 0.2);
  ctx.quadraticCurveTo(B.x1 + w * 0.45, cy + h * 0.05, B.x2 - w * 0.1, cy + h * 0.12);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(B.x1 + w * 0.28, cy, Math.min(w, h) * 0.06, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

export const drawYoungStopcockInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.strokeStyle = CONICAL_FLASK_OUTLINE;
  ctx.lineWidth = opts.lineWidth;
  // Barrel
  roundRectPath(ctx, cx - w * 0.18, B.y1 + h * 0.25, w * 0.36, h * 0.45, 4);
  ctx.stroke();
  // Stem
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.1, B.y1 + h * 0.7);
  ctx.lineTo(cx - w * 0.1, B.y2 - h * 0.1);
  ctx.lineTo(cx + w * 0.1, B.y2 - h * 0.1);
  ctx.lineTo(cx + w * 0.1, B.y1 + h * 0.7);
  ctx.stroke();
  // Knob
  ctx.beginPath();
  ctx.arc(cx, B.y1 + h * 0.18, Math.min(w, h) * 0.1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

export const drawSpinCoaterInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  const cx = (B.x1 + B.x2) / 2;
  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  roundRectPath(ctx, B.x1 + w * 0.15, B.y1 + h * 0.45, w * 0.7, h * 0.4, 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, B.y1 + h * 0.35, Math.min(w, h) * 0.22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, B.y1 + h * 0.35, Math.min(w, h) * 0.08, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

export const drawBiosafetyCabinetInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  roundRectPath(ctx, B.x1 + w * 0.05, B.y1 + h * 0.1, w * 0.9, h * 0.8, 4);
  ctx.stroke();
  // Sash opening
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.1, B.y1 + h * 0.4);
  ctx.lineTo(B.x2 - w * 0.1, B.y1 + h * 0.4);
  ctx.stroke();
  // Work surface
  ctx.beginPath();
  ctx.moveTo(B.x1 + w * 0.1, B.y2 - h * 0.25);
  ctx.lineTo(B.x2 - w * 0.1, B.y2 - h * 0.25);
  ctx.stroke();
  // HEPA marks
  for (let i = 0; i < 4; i++) {
    const x = B.x1 + w * (0.25 + i * 0.15);
    ctx.beginPath();
    ctx.moveTo(x, B.y1 + h * 0.18);
    ctx.lineTo(x, B.y1 + h * 0.28);
    ctx.stroke();
  }
  ctx.restore();
};

export const drawIncubatorShakerInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { lineWidth: number },
): void => {
  const B = normalizeShapeBox(x1, y1, x2, y2);
  const w = Math.max(B.x2 - B.x1, 1e-6);
  const h = Math.max(B.y2 - B.y1, 1e-6);
  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = opts.lineWidth;
  roundRectPath(ctx, B.x1 + w * 0.1, B.y1 + h * 0.15, w * 0.8, h * 0.7, 5);
  ctx.stroke();
  // Window / door
  roundRectPath(ctx, B.x1 + w * 0.2, B.y1 + h * 0.25, w * 0.6, h * 0.35, 3);
  ctx.stroke();
  // Shaker platform
  roundRectPath(ctx, B.x1 + w * 0.25, B.y1 + h * 0.55, w * 0.5, h * 0.12, 2);
  ctx.stroke();
  // Flask hints
  ctx.beginPath();
  ctx.ellipse(B.x1 + w * 0.38, B.y1 + h * 0.5, w * 0.06, h * 0.05, 0, 0, Math.PI * 2);
  ctx.ellipse(B.x1 + w * 0.55, B.y1 + h * 0.5, w * 0.06, h * 0.05, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

export const strokeShapeKind = (
  ctx: CanvasRenderingContext2D,
  kind: CanvasShapeKind,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: {
    strokeStyle: string;
    lineWidth: number;
    fillStyle?: string;
    /** Liquid fill for vessels that support it. */
    liquidFill?: { color: string; level: number };
  },
): void => {
  ctx.save();
  ctx.strokeStyle = opts.strokeStyle;
  ctx.lineWidth = opts.lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (opts.fillStyle) {
    ctx.fillStyle = opts.fillStyle;
  }

  if (kind === 'line') {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const B = normalizeShapeBox(x1, y1, x2, y2);

  if (kind === 'rectangle') {
    ctx.beginPath();
    ctx.rect(B.x1, B.y1, B.x2 - B.x1, B.y2 - B.y1);
    if (opts.fillStyle) ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  const cx = (B.x1 + B.x2) / 2;
  const cy = (B.y1 + B.y2) / 2;
  const rx = Math.abs(B.x2 - B.x1) / 2;
  const ry = Math.abs(B.y2 - B.y1) / 2;

  if (kind === 'circle') {
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(rx, 1e-6), Math.max(ry, 1e-6), 0, 0, Math.PI * 2);
    if (opts.fillStyle) ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (kind === 'triangle') {
    trianglePathInBox(ctx, B.x1, B.y1, B.x2, B.y2);
    if (opts.fillStyle) ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (kind === 'conical_flask') {
    drawConicalFlaskInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      strokeStyle: CONICAL_FLASK_OUTLINE,
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'beaker') {
    drawBeakerInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'test_tube') {
    drawTestTubeInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'round_bottom_flask') {
    drawRoundBottomFlaskInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'condenser') {
    drawCondenserInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'separatory_funnel') {
    drawSeparatoryFunnelInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'filter_funnel') {
    drawFilterFunnelInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'dropping_funnel') {
    drawDroppingFunnelInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'three_neck_rbf') {
    drawThreeNeckRbfInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'buchner_flask') {
    drawBuchnerFlaskInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'claisen_adapter') {
    drawClaisenAdapterInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'distillation_head') {
    drawDistillationHeadInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'receiving_flask') {
    drawReceivingFlaskInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'dean_stark_trap') {
    drawDeanStarkTrapInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'graduated_cylinder') {
    drawGraduatedCylinderInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'volumetric_flask') {
    drawVolumetricFlaskInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'chromatography_column') {
    drawChromatographyColumnInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'tlc_chamber') {
    drawTlcChamberInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'allihn_condenser') {
    drawAllihnCondenserInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'dimroth_condenser') {
    drawDimrothCondenserInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'soxhlet') {
    drawSoxhletInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'hirsch_funnel') {
    drawHirschFunnelInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'schlenk_flask') {
    drawSchlenkFlaskInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'gas_bubbler') {
    drawGasBubblerInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#c4b896',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'thermometer_adapter') {
    drawThermometerAdapterInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'straight_adapter') {
    drawStraightAdapterInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'vacuum_adapter') {
    drawVacuumAdapterInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'bent_adapter') {
    drawBentAdapterInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'vacuum_tubing') {
    drawVacuumTubingInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'coolant_tubing') {
    drawCoolantTubingInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'stopper') {
    drawStopperInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'septum') {
    drawSeptumInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'keck_clip') {
    drawKeckClipInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'buchner_funnel') {
    drawBuchnerFunnelInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'sintered_funnel') {
    drawSinteredFunnelInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'syringe') {
    drawSyringeInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'cannula') {
    drawCannulaInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'nmr_tube') {
    drawNmrTubeInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'drying_tube') {
    drawDryingTubeInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'heating_mantle') {
    drawHeatingMantleInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'oil_bath') {
    drawOilBathInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#c4a35a',
      liquidLevel: opts.liquidFill?.level ?? 0.55,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'ice_bath') {
    drawIceBathInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#a8d4e8',
      liquidLevel: opts.liquidFill?.level ?? 0.5,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'dry_ice_bath') {
    drawDryIceBathInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#d8e8f0',
      liquidLevel: opts.liquidFill?.level ?? 0.45,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'chiller') {
    drawChillerInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'lab_jack') {
    drawLabJackInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'retort_stand') {
    drawRetortStandInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'three_prong_clamp') {
    drawThreeProngClampInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'stir_bar') {
    drawStirBarInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'pasteur_pipette') {
    drawPasteurPipetteInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'spatula') {
    drawSpatulaInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'powder_funnel') {
    drawPowderFunnelInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'two_neck_rbf') {
    drawTwoNeckRbfInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'vigreux_column') {
    drawVigreuxColumnInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'cow_receiver') {
    drawCowReceiverInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.15,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'cold_finger') {
    drawColdFingerInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'cold_trap') {
    drawColdTrapInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'vacuum_pump') {
    drawVacuumPumpInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'gas_inlet_adapter') {
    drawGasInletAdapterInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'balloon') {
    drawBalloonInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'reducing_adapter') {
    drawReducingAdapterInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'rotovap_bump_trap') {
    drawRotovapBumpTrapInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'rotovap_flask') {
    drawRotovapFlaskInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.3,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'hotplate_stirrer') {
    drawHotplateStirrerInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'dewar_flask') {
    drawDewarFlaskInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#cfe8f5',
      liquidLevel: opts.liquidFill?.level ?? 0.4,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'thermometer') {
    drawThermometerInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'watch_glass') {
    drawWatchGlassInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'burette') {
    drawBuretteInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.55,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'evaporating_dish') {
    drawEvaporatingDishInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'filter_adapter') {
    drawFilterAdapterInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'pressure_tube') {
    drawPressureTubeInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.3,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'desiccator') {
    drawDesiccatorInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'pear_shaped_flask') {
    drawPearShapedFlaskInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'bunsen_burner') {
    drawBunsenBurnerInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'alcohol_lamp') {
    drawAlcoholLampInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'sand_bath') {
    drawSandBathInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#c2a36b',
      liquidLevel: opts.liquidFill?.level ?? 0.55,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'steam_bath') {
    drawSteamBathInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#b8d4e8',
      liquidLevel: opts.liquidFill?.level ?? 0.4,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'water_bath') {
    drawWaterBathInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#8ecae6',
      liquidLevel: opts.liquidFill?.level ?? 0.5,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'heat_gun') {
    drawHeatGunInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'heating_block') {
    drawHeatingBlockInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'overhead_stirrer') {
    drawOverheadStirrerInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'four_neck_rbf') {
    drawFourNeckRbfInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#7eb8da',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'rotovap_body') {
    drawRotovapBodyInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'aspirator') {
    drawAspiratorInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'vacuum_gauge') {
    drawVacuumGaugeInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'gas_cylinder') {
    drawGasCylinderInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'fume_hood') {
    drawFumeHoodInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'weighing_boat') {
    drawWeighingBoatInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'forceps') {
    drawForcepsInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'mortar_pestle') {
    drawMortarPestleInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'crystallizing_dish') {
    drawCrystallizingDishInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#7eb8da',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'petri_dish') {
    drawPetriDishInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#7eb8da',
      liquidLevel: opts.liquidFill?.level ?? 0.25,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'hickman_head') {
    drawHickmanHeadInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'jacketed_reactor') {
    drawJacketedReactorInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#7eb8da',
      liquidLevel: opts.liquidFill?.level ?? 0.4,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'schlenk_tube') {
    drawSchlenkTubeInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#7eb8da',
      liquidLevel: opts.liquidFill?.level ?? 0.3,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'gas_dispersion_tube') {
    drawGasDispersionTubeInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'ring_clamp') {
    drawRingClampInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'analytical_balance') {
    drawAnalyticalBalanceInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'stemless_funnel') {
    drawStemlessFunnelInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'metal_joint_clip') {
    drawMetalJointClipInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'glovebox') {
    drawGloveboxInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'schlenk_manifold') {
    drawSchlenkManifoldInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'filter_cannula') {
    drawFilterCannulaInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'transfer_needle') {
    drawTransferNeedleInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'pressure_reactor') {
    drawPressureReactorInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#7eb8da',
      liquidLevel: opts.liquidFill?.level ?? 0.35,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'microwave_reactor') {
    drawMicrowaveReactorInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'syringe_pump') {
    drawSyringePumpInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'flow_reactor') {
    drawFlowReactorInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#7eb8da',
      liquidLevel: opts.liquidFill?.level ?? 0.3,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'flash_system') {
    drawFlashSystemInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'lyophilizer') {
    drawLyophilizerInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'centrifuge') {
    drawCentrifugeInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'photoreactor') {
    drawPhotoreactorInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'electrochemical_cell') {
    drawElectrochemicalCellInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#7eb8da',
      liquidLevel: opts.liquidFill?.level ?? 0.4,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'vacuum_sublimator') {
    drawVacuumSublimatorInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'kugelrohr') {
    drawKugelrohrInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'solvent_purification_system') {
    drawSolventPurificationSystemInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'tube_furnace') {
    drawTubeFurnaceInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'muffle_furnace') {
    drawMuffleFurnaceInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'quartz_tube') {
    drawQuartzTubeInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'quartz_boat') {
    drawQuartzBoatInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'crucible') {
    drawCrucibleInBox(ctx, B.x1, B.y1, B.x2, B.y2, {
      lineWidth: opts.lineWidth,
      liquidColor: opts.liquidFill?.color ?? '#c4a484',
      liquidLevel: opts.liquidFill?.level ?? 0.3,
      outlineOnly: !opts.liquidFill,
    });
    ctx.restore();
    return;
  }

  if (kind === 'tongs') {
    drawTongsInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'young_stopcock') {
    drawYoungStopcockInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'spin_coater') {
    drawSpinCoaterInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'biosafety_cabinet') {
    drawBiosafetyCabinetInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  if (kind === 'incubator_shaker') {
    drawIncubatorShakerInBox(ctx, B.x1, B.y1, B.x2, B.y2, { lineWidth: opts.lineWidth });
    ctx.restore();
    return;
  }

  starPathInBox(ctx, B.x1, B.y1, B.x2, B.y2);
  if (opts.fillStyle) ctx.fill();
  ctx.stroke();
  ctx.restore();
};
