/**
 * Canvas measurements for atom alias labels — used so bond endpoints trim past
 * the head-anchored glyph box (bonding atom at center; rest of the group extends out).
 */
import type { ResolvedCanvasPreferences } from '@moldraw/core';
import type { Atom, Molecule } from '@moldraw/domain';
import { buildAliasDisplayRuns, orientFormulaLabel } from '@moldraw/domain';
import { groupLabelTailGoesLeft } from './hydrogenLayout';

/** Extra clearance past the measured label edge before the bond tip. */
export const ALIAS_LABEL_BOND_PAD_PX = 4;

/** Matches stroked ±1 mark width in `drawFormalCharge`. */
const FORMAL_CHARGE_MARK_W = 15;

const chargeSuperscripts = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

const chargeLabelWidth = (
  ctx: CanvasRenderingContext2D,
  charge: number,
  chargeFontCss: string,
): number => {
  if (charge === 0) return 0;
  if (charge === 1 || charge === -1) return FORMAL_CHARGE_MARK_W;
  const absCharge = Math.abs(charge);
  const sign = charge > 0 ? '⁺' : '⁻';
  const text =
    absCharge
      .toString()
      .split('')
      .map(d => chargeSuperscripts[parseInt(d, 10)])
      .join('') + sign;
  const boldFont = chargeFontCss.includes('bold') ? chargeFontCss : `bold ${chargeFontCss}`;
  ctx.font = boldFont;
  return ctx.measureText(text).width;
};

const measureRunStringWidth = (
  ctx: CanvasRenderingContext2D,
  P: ResolvedCanvasPreferences,
  text: string,
): number => {
  if (!text) return 0;
  let w = 0;
  for (const r of buildAliasDisplayRuns(text)) {
    ctx.font = r.kind === 'sub' ? P.subFontCss : P.elementFontCss;
    w += ctx.measureText(r.text).width;
  }
  return w;
};

export type HeadAnchoredLabelMetrics = {
  w: number;
  h: number;
  left: number;
  right: number;
  headRight: number;
  hasTail: boolean;
  tailGoesLeft: boolean;
  /** Upright-local x of the first glyph (LTR draw origin relative to atom). */
  drawLeft: number;
  /** Oriented display string (H3C / CH3). */
  text: string;
};

const emptyMetrics = (): HeadAnchoredLabelMetrics => ({
  w: 0,
  h: 0,
  left: 0,
  right: 0,
  headRight: 0,
  hasTail: false,
  tailGoesLeft: false,
  drawLeft: 0,
  text: '',
});

export type HeadAnchoredOrientOpts = {
  tailGoesLeft?: boolean;
  attachmentElement?: string;
};

/**
 * Head-anchored label metrics. Also returns the bonding-glyph half-box so
 * lone pairs can keep out of "O" without treating "H" as the atom center.
 */
export function measureHeadAnchoredLabelSize(
  ctx: CanvasRenderingContext2D,
  P: ResolvedCanvasPreferences,
  rawLabel: string,
  charge = 0,
  orient?: HeadAnchoredOrientOpts,
): HeadAnchoredLabelMetrics {
  const raw = rawLabel.trim();
  if (!raw) return emptyMetrics();

  const oriented = orientFormulaLabel(
    raw,
    orient?.attachmentElement ?? raw[0] ?? '',
    orient?.tailGoesLeft === true,
  );

  ctx.save();
  try {
    const qW = chargeLabelWidth(ctx, charge, P.chargeFontCss);
    const totalBody = measureRunStringWidth(ctx, P, oriented.text);

    ctx.font = P.elementFontCss;
    const firstGlyph = oriented.text[0] ?? '';
    const wFirst = firstGlyph ? ctx.measureText(firstGlyph).width : 0;
    const wHead =
      oriented.mode === 'formula' && oriented.head
        ? measureRunStringWidth(ctx, P, oriented.head)
        : wFirst;

    let left: number;
    let right: number;
    let drawLeft: number;
    const headRight = wHead / 2;

    if (oriented.mode === 'block' && oriented.tailGoesLeft) {
      // LTR abbreviation (Me, Ph) sits entirely on the free side; inward
      // edge aligns with the first-glyph right so the bond still meets the atom.
      left = wFirst / 2 - totalBody;
      right = wFirst / 2;
      drawLeft = left;
    } else if (oriented.mode === 'formula') {
      const prefixW = measureRunStringWidth(
        ctx,
        P,
        oriented.text.slice(0, oriented.headIndex),
      );
      const suffixW = measureRunStringWidth(
        ctx,
        P,
        oriented.text.slice(oriented.headIndex + oriented.head.length),
      );
      left = -wHead / 2 - prefixW;
      right = wHead / 2 + suffixW;
      drawLeft = left;
    } else {
      left = -wHead / 2;
      right = totalBody - wHead / 2;
      drawLeft = left;
    }

    if (qW > 0) {
      if (oriented.tailGoesLeft) left -= qW;
      else right += qW;
    }

    const m = ctx.measureText('Mg');
    const asc = m.actualBoundingBoxAscent ?? 0;
    const desc = m.actualBoundingBoxDescent ?? 0;
    const body = asc + desc || 14;
    const h = body + 10;
    const w = right - left;
    return {
      w,
      h,
      left,
      right,
      headRight,
      hasTail: w - wHead > 2,
      tailGoesLeft: oriented.tailGoesLeft,
      drawLeft,
      text: oriented.text,
    };
  } finally {
    ctx.restore();
  }
}

/**
 * Label box relative to the atom center when the bonding glyph is centered on
 * the atom (matches `drawAtomLabels` head-anchored layout, including H3C / HO).
 */
export function measureAliasLabelSize(
  ctx: CanvasRenderingContext2D,
  P: ResolvedCanvasPreferences,
  atom: Atom,
  mol?: Molecule,
  counterRad = 0,
): HeadAnchoredLabelMetrics {
  const raw = atom.alias?.trim();
  if (!raw) return emptyMetrics();
  return measureHeadAnchoredLabelSize(ctx, P, raw, atom.charge ?? 0, {
    tailGoesLeft: mol ? groupLabelTailGoesLeft(atom, mol, counterRad) : false,
    attachmentElement: atom.element,
  });
}

/**
 * Distance from atom center toward `partner` to clear an upright-local label
 * box (world space; matches applyLabelUpright canvas.rotate).
 */
export function labelBoxBondGapTowardPartnerPx(
  left: number,
  right: number,
  height: number,
  atom: Atom,
  partner: Atom,
  labelCounterRad: number,
  pad = ALIAS_LABEL_BOND_PAD_PX,
): number {
  if (right - left < 2) return 0;

  const vx = partner.x - atom.x;
  const vy = partner.y - atom.y;
  const len = Math.hypot(vx, vy);
  if (len < 1e-6) return 0;
  const px = vx / len;
  const py = vy / len;

  const θ = labelCounterRad;
  const c = Math.cos(θ);
  const s = Math.sin(θ);
  const hh = height / 2;

  const corner = (lx: number, ly: number): number => {
    const wx = lx * c + ly * s;
    const wy = -lx * s + ly * c;
    return wx * px + wy * py;
  };

  const extent = Math.max(
    corner(right, hh),
    corner(right, -hh),
    corner(left, hh),
    corner(left, -hh),
  );

  return extent + pad;
}

/**
 * Distance from atom center toward `partner` to clear the alias bounding box,
 * for bond trimming (world space; matches applyLabelUpright canvas.rotate).
 */
export function aliasLabelBondGapTowardPartnerPx(
  ctx: CanvasRenderingContext2D,
  P: ResolvedCanvasPreferences,
  atom: Atom,
  partner: Atom,
  labelCounterRad: number,
  mol?: Molecule,
): number {
  const { w, h, left, right } = measureAliasLabelSize(ctx, P, atom, mol, labelCounterRad);
  if (w < 2) return 0;
  return labelBoxBondGapTowardPartnerPx(left, right, h, atom, partner, labelCounterRad);
}
