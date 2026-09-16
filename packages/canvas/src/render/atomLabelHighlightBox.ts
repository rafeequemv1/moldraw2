/**
 * Shared atom-label box + bond halo width for markup and selection washes
 * so OH / NH / Cl covers the full glyph, not just the bonding atom.
 */
import type { Atom, Bond } from '@moldraw/domain';
import { atomUsesHeteroStyleTrim } from '@moldraw/domain';
import { condensedGroupLabelForAtom } from '@moldraw/domain';
import { resolveAtomLabelFonts } from '@moldraw/core/canvasPreferences';
import { measureDeltaLabelExtents } from './drawAtomDecorations';
import type { RenderContext } from './types';

export const atomHasVisibleLabel = (atom: Atom, R: RenderContext): boolean => {
  if (atom.alias?.trim()) return true;
  if (R.condensedGroupLabels) {
    const v = R.valencyMap.get(atom.id) || 0;
    if (condensedGroupLabelForAtom(atom, R.renderedMolecule, v)) return true;
  }
  if (atomUsesHeteroStyleTrim(atom)) return true;
  if (atom.element !== 'C') return true;
  if ((atom.charge ?? 0) !== 0) return true;
  if (atom.isotope && atom.isotope > 0) return true;
  return false;
};

export type AtomLabelHighlightBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

const LABEL_PAD = 5.4;

export function atomLabelHighlightBox(
  ctx: CanvasRenderingContext2D,
  atom: Atom,
  R: RenderContext,
): AtomLabelHighlightBox | null {
  if (!atomHasVisibleLabel(atom, R)) return null;
  const ext = measureDeltaLabelExtents(ctx, R, atom);
  const P = { ...R.displayPrefs, ...resolveAtomLabelFonts(R.displayPrefs, atom.labelFontSizePt) };
  const sample = atom.alias?.trim()?.[0] || atom.element || 'C';
  ctx.save();
  ctx.font = P.elementFontCss;
  const m = ctx.measureText(sample);
  ctx.restore();
  const body =
    (m.actualBoundingBoxAscent ?? 8) + (m.actualBoundingBoxDescent ?? 2) || 12;
  const halfH = body / 2 + 0.55;
  const w = ext.right - ext.left + LABEL_PAD * 2;
  const h = Math.max(20, halfH * 2 + LABEL_PAD * 0.85);
  if (w < 2) return null;
  return {
    x: atom.x + ext.left - LABEL_PAD,
    y: atom.y - h / 2,
    w,
    h,
  };
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0.5, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fill();
}

export function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.stroke();
}

/** World-space stroke width that envelopes single / double / triple ink. */
export function skeletalBondHaloWidth(bond: Bond, from: Atom, to: Atom, R: RenderContext): number {
  const P = R.displayPrefs;
  const thickness =
    bond.thicknessPx != null ? Math.max(0.5, Math.min(14, bond.thicknessPx)) : P.bondThicknessPx;
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const order = bond.order === 4 ? 1 : bond.order;
  const pad = 14;
  if (order >= 2.5) {
    const sep = Math.max(((len * P.bondSpacingFraction) / 2) * 1.15, thickness * 3.5, 7);
    return sep * 2 + thickness + pad;
  }
  if (order >= 1.5 || bond.aromatic) {
    const sep = Math.max((len * P.bondSpacingFraction) / 2, thickness * 3.25, 6.5);
    return sep * 2 + thickness + pad;
  }
  return Math.max(12, thickness * 4.5 + 6);
}
