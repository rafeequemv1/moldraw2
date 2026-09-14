/**
 * Hit-testing for polymer SRU brackets (left/right strokes + subscript label).
 */
import type { SruBracket } from '@moldraw/domain';
import { pointSegDist } from './angles';

const BRACKET_HOOK = 10;
const HIT_TOL = 8;
const LABEL_PAD = 4;

export type SruBracketHit = {
  bracket: SruBracket;
  /** True when the pointer is on the subscript label (for inline edit). */
  onLabel: boolean;
};

/** World-space AABB of the subscript drawn near the bottom-right of the right bracket. */
export const sruBracketLabelBounds = (
  b: SruBracket,
): { x: number; y: number; w: number; h: number } => {
  const fontSize = 14;
  const text = b.subscript || 'n';
  // Approximate glyph width without a canvas measure (hit-test only).
  const w = Math.max(10, text.length * fontSize * 0.62) + LABEL_PAD * 2;
  const h = fontSize + LABEL_PAD * 2;
  return {
    x: b.x2 + 4,
    y: b.y2 - h * 0.35,
    w,
    h,
  };
};

const hitLabel = (b: SruBracket, wx: number, wy: number): boolean => {
  const box = sruBracketLabelBounds(b);
  return wx >= box.x && wx <= box.x + box.w && wy >= box.y && wy <= box.y + box.h;
};

const hitBracketStroke = (b: SruBracket, wx: number, wy: number, tol: number): boolean => {
  const hook = Math.min(BRACKET_HOOK, (b.y2 - b.y1) * 0.25);
  // Left [
  if (pointSegDist(wx, wy, b.x1, b.y1, b.x1, b.y2) < tol) return true;
  if (pointSegDist(wx, wy, b.x1, b.y1, b.x1 + hook, b.y1) < tol) return true;
  if (pointSegDist(wx, wy, b.x1, b.y2, b.x1 + hook, b.y2) < tol) return true;
  // Right ]
  if (pointSegDist(wx, wy, b.x2, b.y1, b.x2, b.y2) < tol) return true;
  if (pointSegDist(wx, wy, b.x2, b.y1, b.x2 - hook, b.y1) < tol) return true;
  if (pointSegDist(wx, wy, b.x2, b.y2, b.x2 - hook, b.y2) < tol) return true;
  return false;
};

/** Topmost SRU under the pointer (bracket strokes or subscript label — not the filled interior). */
export const pickSruBracketAt = (
  brackets: SruBracket[] | undefined,
  wx: number,
  wy: number,
  hitTol: number = HIT_TOL,
): SruBracketHit | null => {
  if (!brackets?.length) return null;
  for (let i = brackets.length - 1; i >= 0; i--) {
    const b = brackets[i]!;
    if (hitLabel(b, wx, wy)) return { bracket: b, onLabel: true };
    if (hitBracketStroke(b, wx, wy, hitTol)) return { bracket: b, onLabel: false };
  }
  return null;
};
