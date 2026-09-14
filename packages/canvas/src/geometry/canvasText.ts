/**
 * Helpers for measuring, hit-testing, and transforming free-text labels
 * (`CanvasText`) — PowerPoint-style box with rotation about center.
 */
import type { CanvasText } from '@moldraw/domain';

const PAD_X = 10;
const PAD_Y = 8;
const MIN_BOX_W = 56;
const MIN_BOX_H = 28;
const ROTATE_HANDLE_OFFSET = 26;
const HANDLE_HIT_R = 8;

export type CanvasTextBox = {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  cx: number;
  cy: number;
  rotationRad: number;
};

/** Corner ids for transform handles. */
export type CanvasTextResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

/** Effective font size after superscript / subscript scaling. */
export const canvasTextEffectiveFontSize = (t: CanvasText): number => {
  const script = t.textScript ?? 'normal';
  if (script === 'super' || script === 'sub') return Math.max(8, t.fontSize * 0.72);
  return t.fontSize;
};

/** Build a CSS font shorthand from a `CanvasText`'s style fields. */
export const buildCanvasTextFont = (t: CanvasText): string => {
  const italic = t.fontStyle === 'italic' ? 'italic ' : '';
  const w = t.fontWeight === 'bold' ? 'bold ' : '';
  const family = t.fontFamily?.trim() || 'Inter';
  return `${italic}${w}${canvasTextEffectiveFontSize(t)}px ${family}, sans-serif`;
};

/**
 * Measure a multi-line `CanvasText` block.
 * Note: mutates `ctx.font`.
 */
export const measureCanvasTextBox = (
  ctx: CanvasRenderingContext2D,
  t: CanvasText,
): { maxW: number; totalH: number; lineHeight: number; lines: string[] } => {
  ctx.font = buildCanvasTextFont(t);
  const lines = t.text.split(/\r?\n/);
  const fs = canvasTextEffectiveFontSize(t);
  const lineHeight = fs * 1.3;
  let maxW = 8;
  for (const line of lines) {
    const tw = ctx.measureText(line || ' ').width;
    if (tw > maxW) maxW = tw;
  }
  const totalH = Math.max(1, lines.length) * lineHeight;
  return { maxW, totalH, lineHeight, lines };
};

/** Rough text bounds without canvas measure (marquee / export fallback). */
export const estimateCanvasTextAabb = (
  t: CanvasText,
): { minX: number; maxX: number; minY: number; maxY: number } => {
  const fs = canvasTextEffectiveFontSize(t);
  const lines = (t.text ?? '').split('\n');
  const maxLineLen = lines.reduce((m, line) => Math.max(m, line.length), 0);
  const width = Math.max(MIN_BOX_W, t.boxWidth ?? maxLineLen * fs * 0.58 + PAD_X * 2);
  const height = Math.max(MIN_BOX_H, t.boxHeight ?? lines.length * fs * 1.3 + PAD_Y * 2);
  return {
    minX: t.x - width / 2,
    maxX: t.x + width / 2,
    minY: t.y - height / 2,
    maxY: t.y + height / 2,
  };
};

/** Content-sized box (ignores explicit boxWidth/Height). */
export const measureCanvasTextContentSize = (
  ctx: CanvasRenderingContext2D,
  t: CanvasText,
): { width: number; height: number } => {
  const { maxW, totalH } = measureCanvasTextBox(ctx, t);
  return {
    width: Math.max(MIN_BOX_W, maxW + PAD_X * 2),
    height: Math.max(MIN_BOX_H, totalH + PAD_Y * 2),
  };
};

/** Selection / hit box (explicit size or content + padding). */
export const getCanvasTextBox = (
  ctx: CanvasRenderingContext2D,
  t: CanvasText,
): CanvasTextBox => {
  const content = measureCanvasTextContentSize(ctx, t);
  const width = Math.max(MIN_BOX_W, t.boxWidth ?? content.width);
  const height = Math.max(MIN_BOX_H, t.boxHeight ?? content.height);
  const cx = t.x;
  const cy = t.y;
  return {
    width,
    height,
    left: cx - width / 2,
    right: cx + width / 2,
    top: cy - height / 2,
    bottom: cy + height / 2,
    cx,
    cy,
    rotationRad: t.rotationRad ?? 0,
  };
};

/** Grow box to fit content (used while typing / Enter for new lines). */
export const canvasTextFitContentPatch = (
  ctx: CanvasRenderingContext2D,
  t: CanvasText,
): Partial<CanvasText> => {
  const content = measureCanvasTextContentSize(ctx, t);
  const width = Math.max(t.boxWidth ?? 0, content.width);
  const height = Math.max(t.boxHeight ?? 0, content.height);
  const next: Partial<CanvasText> = {};
  if (width !== t.boxWidth) next.boxWidth = width;
  if (height !== t.boxHeight) next.boxHeight = height;
  return next;
};

export const worldToTextLocal = (
  box: Pick<CanvasTextBox, 'cx' | 'cy' | 'rotationRad'>,
  wx: number,
  wy: number,
): { lx: number; ly: number } => {
  const dx = wx - box.cx;
  const dy = wy - box.cy;
  const c = Math.cos(-box.rotationRad);
  const s = Math.sin(-box.rotationRad);
  return { lx: dx * c - dy * s, ly: dx * s + dy * c };
};

export const textLocalToWorld = (
  box: Pick<CanvasTextBox, 'cx' | 'cy' | 'rotationRad'>,
  lx: number,
  ly: number,
): { x: number; y: number } => {
  const c = Math.cos(box.rotationRad);
  const s = Math.sin(box.rotationRad);
  return {
    x: box.cx + lx * c - ly * s,
    y: box.cy + lx * s + ly * c,
  };
};

const localCorner = (
  box: CanvasTextBox,
  corner: CanvasTextResizeCorner,
): { lx: number; ly: number } => {
  const hx = box.width / 2;
  const hy = box.height / 2;
  switch (corner) {
    case 'nw':
      return { lx: -hx, ly: -hy };
    case 'ne':
      return { lx: hx, ly: -hy };
    case 'sw':
      return { lx: -hx, ly: hy };
    case 'se':
      return { lx: hx, ly: hy };
  }
};

export const getCanvasTextCornerWorld = (
  box: CanvasTextBox,
  corner: CanvasTextResizeCorner,
): { x: number; y: number } => {
  const { lx, ly } = localCorner(box, corner);
  return textLocalToWorld(box, lx, ly);
};

export const getCanvasTextRotateHandleWorld = (
  box: CanvasTextBox,
): { x: number; y: number } => textLocalToWorld(box, 0, -box.height / 2 - ROTATE_HANDLE_OFFSET);

export const getCanvasTextTopMidWorld = (
  box: CanvasTextBox,
): { x: number; y: number } => textLocalToWorld(box, 0, -box.height / 2);

/** Top-most label whose (rotated) box contains the world-space point. */
export const pickCanvasTextAt = (
  ctx: CanvasRenderingContext2D,
  texts: CanvasText[],
  wx: number,
  wy: number,
): CanvasText | null => {
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i]!;
    const box = getCanvasTextBox(ctx, t);
    const { lx, ly } = worldToTextLocal(box, wx, wy);
    if (Math.abs(lx) <= box.width / 2 && Math.abs(ly) <= box.height / 2) return t;
  }
  return null;
};

/** Corner nearest the pointer when within handle radius; otherwise null. */
export const pickCanvasTextResizeHandle = (
  ctx: CanvasRenderingContext2D,
  t: CanvasText,
  wx: number,
  wy: number,
  zoom: number,
): CanvasTextResizeCorner | null => {
  const box = getCanvasTextBox(ctx, t);
  const r = Math.max(6, HANDLE_HIT_R / zoom);
  const corners: CanvasTextResizeCorner[] = ['nw', 'ne', 'sw', 'se'];
  let best: CanvasTextResizeCorner | null = null;
  let bestDist = r;
  for (const c of corners) {
    const p = getCanvasTextCornerWorld(box, c);
    const d = Math.hypot(wx - p.x, wy - p.y);
    if (d <= bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
};

export const pickCanvasTextRotateHandle = (
  ctx: CanvasRenderingContext2D,
  t: CanvasText,
  wx: number,
  wy: number,
  zoom: number,
): boolean => {
  const box = getCanvasTextBox(ctx, t);
  const h = getCanvasTextRotateHandleWorld(box);
  const r = Math.max(6, (HANDLE_HIT_R + 2) / zoom);
  return Math.hypot(wx - h.x, wy - h.y) <= r;
};

/** Padded world-space AABB (unrotated extent — for marquee). */
export const canvasTextBbox = (
  ctx: CanvasRenderingContext2D,
  t: CanvasText,
): { left: number; right: number; top: number; bottom: number } => {
  const box = getCanvasTextBox(ctx, t);
  if (Math.abs(box.rotationRad) < 1e-6) {
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
  }
  const corners: CanvasTextResizeCorner[] = ['nw', 'ne', 'sw', 'se'];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of corners) {
    const p = getCanvasTextCornerWorld(box, c);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { left: minX, right: maxX, top: minY, bottom: maxY };
};

export const pickTopCanvasTextInRect = (
  ctx: CanvasRenderingContext2D,
  texts: CanvasText[],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): CanvasText | null => {
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i]!;
    const b = canvasTextBbox(ctx, t);
    if (b.right < minX || b.left > maxX || b.bottom < minY || b.top > maxY) continue;
    return t;
  }
  return null;
};

const oppositeCorner = (c: CanvasTextResizeCorner): CanvasTextResizeCorner => {
  switch (c) {
    case 'nw':
      return 'se';
    case 'ne':
      return 'sw';
    case 'sw':
      return 'ne';
    case 'se':
      return 'nw';
  }
};

/**
 * Resize from a corner; opposite corner stays fixed in world
 * (rotation-aware).
 */
export const canvasTextResizePatch = (
  orig: CanvasText,
  corner: CanvasTextResizeCorner,
  pointerX: number,
  pointerY: number,
): Partial<CanvasText> => {
  // Build a pseudo box from orig without needing a canvas measure for explicit sizes.
  const width0 = Math.max(MIN_BOX_W, orig.boxWidth ?? MIN_BOX_W);
  const height0 = Math.max(MIN_BOX_H, orig.boxHeight ?? MIN_BOX_H);
  const box0: CanvasTextBox = {
    width: width0,
    height: height0,
    left: orig.x - width0 / 2,
    right: orig.x + width0 / 2,
    top: orig.y - height0 / 2,
    bottom: orig.y + height0 / 2,
    cx: orig.x,
    cy: orig.y,
    rotationRad: orig.rotationRad ?? 0,
  };

  const opp = oppositeCorner(corner);
  const fixed = getCanvasTextCornerWorld(box0, opp);
  const { lx: plx, ly: ply } = worldToTextLocal(box0, pointerX, pointerY);
  const { lx: flx, ly: fly } = worldToTextLocal(box0, fixed.x, fixed.y);

  const newW = Math.max(MIN_BOX_W, Math.abs(plx - flx));
  const newH = Math.max(MIN_BOX_H, Math.abs(ply - fly));

  // New center = midpoint of fixed corner and dragged corner in local, then to world.
  const signX = corner.includes('e') ? 1 : -1;
  const signY = corner.includes('s') ? 1 : -1;
  const newLocalDrag = {
    lx: flx + signX * newW,
    ly: fly + signY * newH,
  };
  const midLocal = {
    lx: (flx + newLocalDrag.lx) / 2,
    ly: (fly + newLocalDrag.ly) / 2,
  };
  const center = textLocalToWorld(box0, midLocal.lx, midLocal.ly);

  return {
    boxWidth: newW,
    boxHeight: newH,
    x: center.x,
    y: center.y,
  };
};

export const canvasTextRotatePatch = (
  orig: CanvasText,
  startPointerAngle: number,
  currentPointerAngle: number,
): Partial<CanvasText> => {
  const delta = currentPointerAngle - startPointerAngle;
  return { rotationRad: (orig.rotationRad ?? 0) + delta };
};
