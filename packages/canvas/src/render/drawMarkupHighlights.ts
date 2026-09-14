/**
 * Highlighter fills from `atom.highlight` / `bond.highlight`.
 * Painted under bonds so the structure stays readable. Colors are mixed
 * toward white so the stored swatch hex stays saturated while the wash
 * reads as a light marker.
 */
import type { Atom, Bond } from '@moldraw/domain';
import { mixHexTowardWhite } from '../geometry/colors';
import {
  ballStickAtomRadius,
  ballStickBondHighlightWidth,
} from '../themes/ballStick/draw';
import {
  atomHasVisibleLabel,
  atomLabelHighlightBox,
  fillRoundRect,
  skeletalBondHaloWidth,
} from './atomLabelHighlightBox';
import type { RenderContext } from './types';

const HIGHLIGHT_PASTEL = 0.58;

const highlightFill = (hex: string): string => mixHexTowardWhite(hex, HIGHLIGHT_PASTEL);

const bondHighlightWidth = (bond: Bond, from: Atom, to: Atom, R: RenderContext): number => {
  if ((R.structureDrawMode ?? 'skeletal') === 'ball-stick') {
    return ballStickBondHighlightWidth(R, bond);
  }
  return skeletalBondHaloWidth(bond, from, to, R);
};

const unlabeledAtomRadius = (atom: Atom, R: RenderContext): number => {
  if ((R.structureDrawMode ?? 'skeletal') === 'ball-stick') {
    return ballStickAtomRadius(R, atom.element) * 1.22 + 2;
  }
  return 7.5;
};

const drawAtomHighlight = (ctx: CanvasRenderingContext2D, atom: Atom, R: RenderContext): void => {
  ctx.fillStyle = highlightFill(atom.highlight!);
  if ((R.structureDrawMode ?? 'skeletal') === 'ball-stick' || !atomHasVisibleLabel(atom, R)) {
    ctx.beginPath();
    ctx.arc(atom.x, atom.y, unlabeledAtomRadius(atom, R), 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  R.applyLabelUpright(atom.id, () => {
    const box = atomLabelHighlightBox(ctx, atom, R);
    if (!box) {
      ctx.beginPath();
      ctx.arc(atom.x, atom.y, unlabeledAtomRadius(atom, R) + 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    fillRoundRect(ctx, box.x, box.y, box.w, box.h, box.h / 2);
  });
};

const drawBondHighlight = (
  ctx: CanvasRenderingContext2D,
  bond: Bond,
  from: Atom,
  to: Atom,
  color: string,
  R: RenderContext,
): void => {
  ctx.strokeStyle = highlightFill(color);
  ctx.lineWidth = bondHighlightWidth(bond, from, to, R);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
};

export function drawMarkupHighlights(ctx: CanvasRenderingContext2D, R: RenderContext): void {
  const mol = R.renderedMolecule;
  const atomById = R.atomById;
  const visibleAtomIds = R.visibleAtomIds;
  const visibleBondIds = R.visibleBondIds;

  ctx.save();
  ctx.globalAlpha = 1;

  for (const bond of mol.bonds) {
    if (visibleBondIds && !visibleBondIds.has(bond.id)) continue;
    const from = atomById.get(bond.fromAtomId);
    const to = atomById.get(bond.toAtomId);
    if (!from || !to) continue;
    const color =
      bond.highlight ??
      (from.highlight && to.highlight && from.highlight === to.highlight ? from.highlight : null);
    if (!color) continue;
    drawBondHighlight(ctx, bond, from, to, color, R);
  }

  for (const atom of mol.atoms) {
    if (!atom.highlight) continue;
    if (visibleAtomIds && !visibleAtomIds.has(atom.id)) continue;
    drawAtomHighlight(ctx, atom, R);
  }

  ctx.restore();
}
