/**
 * Helpers for measuring, hit-testing, and transforming free-text labels
 * (`CanvasText`) — PowerPoint-style box with rotation about center.
 */
import type { CanvasText } from '@moldraw/domain';
import { DEFAULT_ATOM_INK } from '@moldraw/domain';

/**
 * Colour a label is painted with. Labels created with the default ink follow
 * the structure ink of the active theme (white on dark themes) exactly like
 * skeletal carbons do; any explicit user colour is kept verbatim.
 */
export const resolveCanvasTextInk = (t: Pick<CanvasText, 'color'>, themeInk: string): string => {
  const c = (t.color ?? '').trim().toLowerCase();
  if (!c || c === DEFAULT_ATOM_INK.toLowerCase()) return themeInk;
  return t.color;
};

const PAD_X = 10;
const PAD_Y = 8;
const MIN_BOX_W = 56;
const MIN_BOX_H = 28;
/** Line box as a multiple of effective font size — enough that wrapped lines never collide. */
const LINE_HEIGHT_RATIO = 1.35;
const ROTATE_HANDLE_OFFSET = 26;
const HANDLE_HIT_R = 8;
/** Screen-px slop around an unselected box so small labels stay clickable. */
export const CANVAS_TEXT_IDLE_GRAB_PAD_PX = 6;
/** Screen-px slop around a selected box — grab the frame without pixel-hunting. */
export const CANVAS_TEXT_SELECTED_GRAB_PAD_PX = 14;

/** World-space hit pad for a text box at the current camera zoom. */
export const canvasTextHitPadWorld = (
  zoom: number,
  kind: 'idle' | 'selected' = 'idle',
): number => {
  const px = kind === 'selected' ? CANVAS_TEXT_SELECTED_GRAB_PAD_PX : CANVAS_TEXT_IDLE_GRAB_PAD_PX;
  return px / Math.max(0.2, zoom);
};

/** Whether a world point lies in a (rotated) text box, optionally padded. */
export const hitCanvasTextBox = (
  box: CanvasTextBox,
  wx: number,
  wy: number,
  pad = 0,
): boolean => {
  const { lx, ly } = worldToTextLocal(box, wx, wy);
  return Math.abs(lx) <= box.width / 2 + pad && Math.abs(ly) <= box.height / 2 + pad;
};

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
/** Mid-edge ids — resize one axis only (box, not font). */
export type CanvasTextResizeEdge = 'n' | 'e' | 's' | 'w';
/** All eight PowerPoint-style box handles. */
export type CanvasTextResizeHandle = CanvasTextResizeCorner | CanvasTextResizeEdge;

export const CANVAS_TEXT_RESIZE_CORNERS: CanvasTextResizeCorner[] = ['nw', 'ne', 'sw', 'se'];
export const CANVAS_TEXT_RESIZE_EDGES: CanvasTextResizeEdge[] = ['n', 'e', 's', 'w'];
export const CANVAS_TEXT_RESIZE_HANDLES: CanvasTextResizeHandle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
];

export const isCanvasTextResizeEdge = (h: CanvasTextResizeHandle): h is CanvasTextResizeEdge =>
  h === 'n' || h === 'e' || h === 's' || h === 'w';

/**
 * Font size used for wrap / editor / slot width.
 * Super / sub are drawn smaller *inside* these full-size slots.
 */
export const canvasTextEffectiveFontSize = (t: CanvasText): number => t.fontSize;

/** Build a CSS font shorthand at an explicit pixel size. */
export const buildCanvasTextFontAtSize = (t: CanvasText, sizePx: number): string => {
  const italic = t.fontStyle === 'italic' ? 'italic ' : '';
  const w = t.fontWeight === 'bold' ? 'bold ' : '';
  const family = t.fontFamily?.trim() || 'Inter';
  return `${italic}${w}${sizePx}px ${family}, sans-serif`;
};

/** Build a CSS font shorthand from a `CanvasText`'s style fields. */
export const buildCanvasTextFont = (t: CanvasText): string =>
  buildCanvasTextFontAtSize(t, canvasTextEffectiveFontSize(t));

export const canvasTextLineHeight = (t: CanvasText): number =>
  canvasTextEffectiveFontSize(t) * LINE_HEIGHT_RATIO;

export const canvasTextAlign = (t: Pick<CanvasText, 'textAlign'>): CanvasText['textAlign'] =>
  t.textAlign ?? 'left';

export type WrappedCanvasTextLine = { text: string; start: number };

const splitParagraphs = (source: string): WrappedCanvasTextLine[] => {
  const paragraphs: WrappedCanvasTextLine[] = [];
  let start = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\r' && source[i + 1] === '\n') {
      paragraphs.push({ text: source.slice(start, i), start });
      start = i + 2;
      i++;
    } else if (source[i] === '\n') {
      paragraphs.push({ text: source.slice(start, i), start });
      start = i + 1;
    }
  }
  paragraphs.push({ text: source.slice(start), start });
  return paragraphs;
};

/**
 * Wrap `text` to `maxInnerWidth` (world px), keeping each line's UTF-16 start
 * in the original string. Hard line breaks are kept.
 */
export const wrapCanvasTextLinesIndexed = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxInnerWidth: number,
): WrappedCanvasTextLine[] => {
  const source = text ?? '';
  const paragraphs = splitParagraphs(source);
  const unlimited = !(maxInnerWidth > 8) || !Number.isFinite(maxInnerWidth);

  const breakToken = (token: string, tokenStart: number): WrappedCanvasTextLine[] => {
    if (!token) return [{ text: '', start: tokenStart }];
    if (unlimited || ctx.measureText(token).width <= maxInnerWidth) {
      return [{ text: token, start: tokenStart }];
    }
    const parts: WrappedCanvasTextLine[] = [];
    let chunk = '';
    let chunkStart = tokenStart;
    let i = 0;
    for (const ch of token) {
      const next = chunk + ch;
      if (chunk && ctx.measureText(next).width > maxInnerWidth) {
        parts.push({ text: chunk, start: chunkStart });
        chunk = ch;
        chunkStart = tokenStart + i;
      } else {
        chunk = next;
      }
      i += ch.length;
    }
    if (chunk) parts.push({ text: chunk, start: chunkStart });
    return parts.length ? parts : [{ text: '', start: tokenStart }];
  };

  const out: WrappedCanvasTextLine[] = [];
  for (const para of paragraphs) {
    if (unlimited) {
      out.push({ text: para.text, start: para.start });
      continue;
    }
    if (para.text.length === 0) {
      out.push({ text: '', start: para.start });
      continue;
    }
    const tokens = para.text.split(/(\s+)/);
    let line = '';
    let lineStart = para.start;
    let cursor = para.start;
    const flush = () => {
      out.push({ text: line, start: lineStart });
      line = '';
    };
    for (const tok of tokens) {
      if (!tok) continue;
      const tokStart = cursor;
      cursor += tok.length;
      const pieces = /\s/.test(tok[0] ?? '')
        ? [{ text: tok, start: tokStart }]
        : breakToken(tok, tokStart);
      for (const piece of pieces) {
        const trial = line + piece.text;
        if (line && ctx.measureText(trial).width > maxInnerWidth) {
          flush();
          if (/^\s+$/.test(piece.text)) continue;
          const lead = (piece.text.match(/^\s*/) ?? [''])[0].length;
          const startText = piece.text.slice(lead);
          if (!startText) continue;
          for (const sub of breakToken(startText, piece.start + lead)) {
            if (line && ctx.measureText(line + sub.text).width > maxInnerWidth) flush();
            if (!line) lineStart = sub.start;
            line += sub.text;
          }
        } else {
          if (!line) lineStart = piece.start;
          line = trial;
        }
      }
    }
    flush();
  }
  return out.length ? out : [{ text: '', start: 0 }];
};

/**
 * Wrap `text` to `maxInnerWidth` (world px). Hard line breaks are kept.
 * Long tokens are split by character so glyphs never share an x,y.
 * Note: mutates `ctx.font` only if the caller already set it.
 */
export const wrapCanvasTextLines = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxInnerWidth: number,
): string[] => wrapCanvasTextLinesIndexed(ctx, text, maxInnerWidth).map(l => l.text);

/**
 * Measure a multi-line `CanvasText` block, wrapping to `boxWidth` when set.
 * Note: mutates `ctx.font`.
 */
export const measureCanvasTextBox = (
  ctx: CanvasRenderingContext2D,
  t: CanvasText,
): { maxW: number; totalH: number; lineHeight: number; lines: string[] } => {
  ctx.font = buildCanvasTextFont(t);
  const lineHeight = canvasTextLineHeight(t);
  const innerMax = t.boxWidth != null ? Math.max(8, t.boxWidth - PAD_X * 2) : Infinity;
  const lines = wrapCanvasTextLines(ctx, t.text ?? '', innerMax);
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
  const approxLines =
    t.boxWidth != null && maxLineLen > 0
      ? Math.max(1, Math.ceil((maxLineLen * fs * 0.58) / Math.max(8, t.boxWidth - PAD_X * 2)))
      : Math.max(1, lines.length);
  const height = Math.max(MIN_BOX_H, t.boxHeight ?? 0, approxLines * fs * LINE_HEIGHT_RATIO + PAD_Y * 2);
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
  // Honor an explicit frame so n/s / corner drags can shrink the box.
  // Overflow is clipped in draw; wrap follows boxWidth. Unsized labels
  // still fit their measured content.
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
  const next: Partial<CanvasText> = {};
  // Do not persist an auto width — that would lock wrap to the first glyph.
  // A user-resized (or created) box wraps; grow width only for an unbreakable run.
  if (t.boxWidth != null && content.width > t.boxWidth + 0.5) {
    next.boxWidth = content.width;
  }
  const height = Math.max(t.boxHeight ?? 0, content.height);
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

const localHandle = (
  box: CanvasTextBox,
  handle: CanvasTextResizeHandle,
): { lx: number; ly: number } => {
  const hx = box.width / 2;
  const hy = box.height / 2;
  switch (handle) {
    case 'nw':
      return { lx: -hx, ly: -hy };
    case 'n':
      return { lx: 0, ly: -hy };
    case 'ne':
      return { lx: hx, ly: -hy };
    case 'e':
      return { lx: hx, ly: 0 };
    case 'se':
      return { lx: hx, ly: hy };
    case 's':
      return { lx: 0, ly: hy };
    case 'sw':
      return { lx: -hx, ly: hy };
    case 'w':
      return { lx: -hx, ly: 0 };
  }
};

export const getCanvasTextHandleWorld = (
  box: CanvasTextBox,
  handle: CanvasTextResizeHandle,
): { x: number; y: number } => {
  const { lx, ly } = localHandle(box, handle);
  return textLocalToWorld(box, lx, ly);
};

export const getCanvasTextCornerWorld = (
  box: CanvasTextBox,
  corner: CanvasTextResizeCorner,
): { x: number; y: number } => getCanvasTextHandleWorld(box, corner);

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
  pad = 0,
): CanvasText | null => {
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i]!;
    const box = getCanvasTextBox(ctx, t);
    if (hitCanvasTextBox(box, wx, wy, pad)) return t;
  }
  return null;
};

/**
 * True when the pointer is over painted glyphs (not empty interior / frame).
 * Used so a second click on the letters enters edit, while empty padding moves.
 */
export const pickCanvasTextContentAt = (
  ctx: CanvasRenderingContext2D,
  t: CanvasText,
  wx: number,
  wy: number,
): boolean => {
  const source = t.text ?? '';
  if (!source.trim()) return false;
  const box = getCanvasTextBox(ctx, t);
  const { lx, ly } = worldToTextLocal(box, wx, wy);
  const { lineHeight, lines } = measureCanvasTextBox(ctx, t);
  const align = canvasTextAlign(t);
  const innerLeft = -box.width / 2 + PAD_X;
  const innerRight = box.width / 2 - PAD_X;
  const count = Math.max(1, lines.length);
  const glyphPad = Math.max(3, canvasTextEffectiveFontSize(t) * 0.15);
  ctx.font = buildCanvasTextFont(t);
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li] ?? '';
    if (!line) continue;
    const tw = ctx.measureText(line).width;
    if (tw < 1) continue;
    const x0 = align === 'right' ? innerRight - tw : align === 'center' ? -tw / 2 : innerLeft;
    const y0 = (li - (count - 1) / 2) * lineHeight;
    if (
      lx >= x0 - glyphPad &&
      lx <= x0 + tw + glyphPad &&
      Math.abs(ly - y0) <= lineHeight / 2 + glyphPad
    ) {
      return true;
    }
  }
  return false;
};

/** Handle nearest the pointer when within handle radius; otherwise null. */
export const pickCanvasTextResizeHandle = (
  ctx: CanvasRenderingContext2D,
  t: CanvasText,
  wx: number,
  wy: number,
  zoom: number,
): CanvasTextResizeHandle | null => {
  const box = getCanvasTextBox(ctx, t);
  const r = Math.max(6, HANDLE_HIT_R / zoom);
  let best: CanvasTextResizeHandle | null = null;
  let bestDist = r;
  for (const h of CANVAS_TEXT_RESIZE_HANDLES) {
    const p = getCanvasTextHandleWorld(box, h);
    const d = Math.hypot(wx - p.x, wy - p.y);
    if (d <= bestDist) {
      bestDist = d;
      best = h;
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

const oppositeHandle = (h: CanvasTextResizeHandle): CanvasTextResizeHandle => {
  switch (h) {
    case 'nw':
      return 'se';
    case 'n':
      return 's';
    case 'ne':
      return 'sw';
    case 'e':
      return 'w';
    case 'se':
      return 'nw';
    case 's':
      return 'n';
    case 'sw':
      return 'ne';
    case 'w':
      return 'e';
  }
};

/**
 * Layout the HTML inline editor needs to sit pixel-exact over the canvas text:
 * the (measured) box plus the vertical inset that centres the line block the
 * same way `drawCanvasTexts` does (lines centred on `cy`).
 */
export const canvasTextEditorLayout = (
  ctx: CanvasRenderingContext2D,
  t: CanvasText,
): {
  box: CanvasTextBox;
  lineHeight: number;
  lineCount: number;
  /** Distance from the box top to the top of the line block (world units). */
  blockTop: number;
  /** Baseline shift for super / subscript text (world units). */
  scriptDy: number;
} => {
  const box = getCanvasTextBox(ctx, t);
  const { lineHeight, lines } = measureCanvasTextBox(ctx, t);
  const lineCount = Math.max(1, lines.length);
  const blockH = lineCount * lineHeight;
  return {
    box,
    lineHeight,
    lineCount,
    blockTop: Math.max(0, (box.height - blockH) / 2),
    scriptDy: 0,
  };
};

/**
 * Resize the text *frame* from a corner or mid-edge handle. Opposite side
 * stays fixed in world (rotation-aware). Font size is never changed —
 * corners change width+height (text reflows/wraps); n/s change height only;
 * e/w change width only. `orig` should carry explicit `boxWidth` /
 * `boxHeight` (callers snapshot the measured box at drag start).
 */
export const canvasTextResizePatch = (
  orig: CanvasText,
  handle: CanvasTextResizeHandle,
  pointerX: number,
  pointerY: number,
  minW: number = MIN_BOX_W,
  minH: number = MIN_BOX_H,
): Partial<CanvasText> => {
  const width0 = Math.max(MIN_BOX_W, orig.boxWidth ?? MIN_BOX_W);
  const height0 = Math.max(MIN_BOX_H, orig.boxHeight ?? MIN_BOX_H);
  const floorW = Math.max(MIN_BOX_W, minW);
  const floorH = Math.max(MIN_BOX_H, minH);
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

  const opp = oppositeHandle(handle);
  const fixed = getCanvasTextHandleWorld(box0, opp);
  const { lx: plx, ly: ply } = worldToTextLocal(box0, pointerX, pointerY);
  const { lx: flx, ly: fly } = worldToTextLocal(box0, fixed.x, fixed.y);

  const lockW = handle === 'n' || handle === 's';
  const lockH = handle === 'e' || handle === 'w';
  const newW = lockW ? width0 : Math.max(floorW, Math.abs(plx - flx));
  const newH = lockH ? height0 : Math.max(floorH, Math.abs(ply - fly));

  const signX = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
  const signY = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
  const newLocalDrag = {
    lx: lockW ? 0 : flx + signX * newW,
    ly: lockH ? 0 : fly + signY * newH,
  };
  const midLocal = {
    lx: lockW ? 0 : (flx + newLocalDrag.lx) / 2,
    ly: lockH ? 0 : (fly + newLocalDrag.ly) / 2,
  };
  const center = textLocalToWorld(box0, midLocal.lx, midLocal.ly);

  return {
    boxWidth: newW,
    boxHeight: newH,
    x: center.x,
    y: center.y,
  };
};

/** CSS resize cursor for a corner/edge handle, taking box rotation into account. */
export const canvasTextCornerCursor = (
  handle: CanvasTextResizeHandle,
  rotationRad: number,
): string => {
  const base =
    handle === 'e' || handle === 'w'
      ? 0
      : handle === 'n' || handle === 's'
        ? 90
        : handle === 'ne'
          ? -45
          : handle === 'se'
            ? 45
            : handle === 'sw'
              ? 135
              : -135;
  const deg = (((base + (rotationRad * 180) / Math.PI) % 360) + 360) % 360;
  const sector = Math.round(deg / 45) % 4;
  return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][sector]!;
};

/**
 * Cursor to show for the pointer at world (wx, wy) with the text / select
 * tool: rotate knob → grab, box handle → resize arrows, inside a label → grab
 * (I-beam only while editing the glyphs), otherwise null.
 */
export const canvasTextCursorAt = (
  ctx: CanvasRenderingContext2D,
  texts: CanvasText[],
  selectedId: string | null,
  wx: number,
  wy: number,
  zoom: number,
  opts?: { editing?: boolean },
): string | null => {
  if (!texts.length) return null;
  const selected = selectedId ? texts.find(t => t.id === selectedId) : undefined;
  if (selected) {
    if (pickCanvasTextRotateHandle(ctx, selected, wx, wy, zoom)) return 'grab';
    const corner = pickCanvasTextResizeHandle(ctx, selected, wx, wy, zoom);
    if (corner) return canvasTextCornerCursor(corner, selected.rotationRad ?? 0);
    const grabPad = canvasTextHitPadWorld(zoom, 'selected');
    if (hitCanvasTextBox(getCanvasTextBox(ctx, selected), wx, wy, grabPad)) {
      if (opts?.editing && pickCanvasTextContentAt(ctx, selected, wx, wy)) return 'text';
      return 'grab';
    }
  }
  const idlePad = canvasTextHitPadWorld(zoom, 'idle');
  return pickCanvasTextAt(ctx, texts, wx, wy, idlePad) ? 'grab' : null;
};

export const canvasTextRotatePatch = (
  orig: CanvasText,
  startPointerAngle: number,
  currentPointerAngle: number,
): Partial<CanvasText> => {
  const delta = currentPointerAngle - startPointerAngle;
  return { rotationRad: (orig.rotationRad ?? 0) + delta };
};
