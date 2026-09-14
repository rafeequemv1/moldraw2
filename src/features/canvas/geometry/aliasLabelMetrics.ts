/**
 * Canvas measurements for atom alias labels — used so bond endpoints trim past
 * the head-anchored glyph box (bonding atom at center; rest of the group extends out).
 */
import type { ResolvedCanvasPreferences } from '@moldraw/core/canvasPreferences';
import type { Atom } from '@moldraw/domain';
import { buildAliasDisplayRuns } from '@moldraw/domain';

const chargeSuperscripts = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

/** Extra clearance past the measured label edge before the bond tip. */
export const ALIAS_LABEL_BOND_PAD_PX = 4;

const getChargeString = (charge: number): string => {
  if (charge === 0) return '';
  if (charge === 1) return '⁺';
  if (charge === -1) return '⁻';
  const absCharge = Math.abs(charge);
  const sign = charge > 0 ? '⁺' : '⁻';
  return (
    absCharge
      .toString()
      .split('')
      .map(d => chargeSuperscripts[parseInt(d, 10)])
      .join('') + sign
  );
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
): { w: number; h: number; left: number; right: number; headRight: number; hasTail: boolean } {
  const raw = rawLabel.trim();
  if (!raw) return { w: 0, h: 0, left: 0, right: 0, headRight: 0, hasTail: false };

  const runs = buildAliasDisplayRuns(raw);
  let totalW = 0;
  ctx.save();
  try {
    for (const r of runs) {
      ctx.font = r.kind === 'sub' ? P.subFontCss : P.elementFontCss;
      totalW += ctx.measureText(r.text).width;
    }
    const chargeStr = getChargeString(charge);
    ctx.font = P.chargeFontCss;
    if (chargeStr) totalW += ctx.measureText(chargeStr).width;

    const anchorSym = raw[0] ?? '';
    ctx.font = P.elementFontCss;
    const wHead = anchorSym ? ctx.measureText(anchorSym).width : 0;
    const left = -wHead / 2;
    const headRight = wHead / 2;
    const right = totalW - wHead / 2;

    const m = ctx.measureText('Mg');
    const asc = m.actualBoundingBoxAscent ?? 0;
    const desc = m.actualBoundingBoxDescent ?? 0;
    const body = asc + desc || 14;
    const h = body + 10;
    return {
      w: totalW,
      h,
      left,
      right,
      headRight,
      hasTail: right - headRight > 2,
    };
  } finally {
    ctx.restore();
  }
}

/**
 * Label box relative to the atom center when the first glyph is centered on the atom
 * (matches `drawAtomLabels` head-anchored layout).
 */
export function measureAliasLabelSize(
  ctx: CanvasRenderingContext2D,
  P: ResolvedCanvasPreferences,
  atom: Atom,
): { w: number; h: number; left: number; right: number; headRight: number; hasTail: boolean } {
  const raw = atom.alias?.trim();
  if (!raw) return { w: 0, h: 0, left: 0, right: 0, headRight: 0, hasTail: false };
  return measureHeadAnchoredLabelSize(ctx, P, raw, atom.charge ?? 0);
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
): number {
  const { w, h, left, right } = measureAliasLabelSize(ctx, P, atom);
  if (w < 2) return 0;

  const vx = partner.x - atom.x;
  const vy = partner.y - atom.y;
  const len = Math.hypot(vx, vy);
  if (len < 1e-6) return 0;
  const px = vx / len;
  const py = vy / len;

  const θ = labelCounterRad;
  const c = Math.cos(θ);
  const s = Math.sin(θ);
  const hh = h / 2;

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

  return extent + ALIAS_LABEL_BOND_PAD_PX;
}
