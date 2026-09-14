/**
 * Formal-charge marks drawn with bond-like stroke weight so ±1 is easy to see
 * in teaching diagrams (Unicode ⁺/⁻ alone reads too thin).
 */
import type { Atom, Molecule } from '@moldraw/domain';
import {
  CHARGE_MARK_R_DEFAULT_PX,
  clampChargeMarkOffset,
  defaultChargeSeatDirection,
  getLonePairPlacements,
  type ResolvedCanvasPreferences,
} from '@moldraw/core';
import { hGoesLeft } from '../geometry/hydrogenLayout';

/** Approximate advance width for a ±1 stroked charge mark. */
export const FORMAL_CHARGE_MARK_W = 15;
/** Circled ⊕/⊖ mark is slightly wider. */
export const CIRCLED_CHARGE_MARK_W = 18;

const getChargeSuperscript = (charge: number): string => {
  if (charge === 0) return '';
  if (charge === 1) return '⁺';
  if (charge === -1) return '⁻';
  const absCharge = Math.abs(charge);
  const sign = charge > 0 ? '⁺' : '⁻';
  const superscripts = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
  return absCharge.toString().split('').map(d => superscripts[parseInt(d, 10)]).join('') + sign;
};

/** Stroke width matched to single-bond thickness (clamped for readability). */
export const formalChargeStrokePx = (bondThicknessPx: number): number =>
  Math.max(2.25, Math.min(4, bondThicknessPx * 1.15));

/** Charge sits on the free side of the atom (opposite neighbors) — e.g. nitro O⁻ on the left. */
export const chargeGoesLeft = (atom: Atom, mol: Molecule): boolean => hGoesLeft(atom, mol);

export type ChargeMarkOffset = { x: number; y: number };

const shortestAngleDiff = (from: number, to: number): number => {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

/**
 * Default seat on the free side of the atom (slightly above).
 * Avoids occupied lone-pair directions so ± and LP dots do not collide.
 */
export const defaultChargeMarkOffset = (
  atom: Atom,
  mol: Molecule,
  charge: number,
): ChargeMarkOffset => {
  const isMinus = charge < 0;
  const r = isMinus ? CHARGE_MARK_R_DEFAULT_PX + 3 : CHARGE_MARK_R_DEFAULT_PX;

  let seat = defaultChargeSeatDirection(atom, mol);
  const lp = Math.max(0, atom.lonePairs ?? 0);
  if (lp > 0) {
    const placements = getLonePairPlacements(atom, mol, lp, {
      preferSide: atom.lonePairSide ?? 'above',
      // Charge is choosing its seat — don't let LP packing reserve this seat first.
      reserveChargeSeat: false,
    });
    const seatAng = Math.atan2(seat.y, seat.x);
    let blocked = false;
    for (const p of placements) {
      const pang = Math.atan2(p.dir.y, p.dir.x);
      if (Math.abs(shortestAngleDiff(seatAng, pang)) < 0.55) {
        blocked = true;
        break;
      }
    }
    if (blocked) {
      // Walk candidate angles for the freest gap vs LPs + bonds.
      let bestAng = seatAng;
      let bestScore = -Infinity;
      for (let i = 0; i < 12; i++) {
        const a = -Math.PI + (i * Math.PI) / 6;
        let score = 0;
        for (const p of placements) {
          score += Math.abs(shortestAngleDiff(a, Math.atan2(p.dir.y, p.dir.x)));
        }
        for (const b of mol.bonds) {
          if (b.fromAtomId !== atom.id && b.toAtomId !== atom.id) continue;
          const oid = b.fromAtomId === atom.id ? b.toAtomId : b.fromAtomId;
          const other = mol.atoms.find(x => x.id === oid);
          if (!other) continue;
          score += Math.abs(
            shortestAngleDiff(a, Math.atan2(other.y - atom.y, other.x - atom.x)),
          );
        }
        // Prefer upper hemisphere for textbook look.
        if (Math.sin(a) < 0) score += 0.4;
        if (score > bestScore) {
          bestScore = score;
          bestAng = a;
        }
      }
      seat = { x: Math.cos(bestAng), y: Math.sin(bestAng) };
    }
  } else {
    // Legacy free-side seat when no LPs.
    const left = chargeGoesLeft(atom, mol);
    const up = isMinus ? 0.72 : 0.38;
    const dx = left ? -1 : 1;
    const dy = -up;
    const len = Math.hypot(dx, dy) || 1;
    seat = { x: dx / len, y: dy / len };
  }

  return clampChargeMarkOffset(seat.x * r, seat.y * r);
};

/** Offset from atom center: drag preview, stored, or default free-side seat. */
export const resolveChargeMarkOffset = (
  atom: Atom,
  mol: Molecule,
  charge: number,
  stored: ChargeMarkOffset | undefined,
  dragPreview?: ChargeMarkOffset | null,
): ChargeMarkOffset => {
  if (dragPreview) return dragPreview;
  if (stored) return clampChargeMarkOffset(stored.x, stored.y);
  return defaultChargeMarkOffset(atom, mol, charge);
};

/**
 * World AABB of the formal-charge mark (for hit-test / selection highlight).
 * Coordinates match upright label space (applyLabelUpright).
 */
export const estimateChargeMarkAabb = (
  atom: Atom,
  mol: Molecule,
  charge: number,
  dragPreview?: ChargeMarkOffset | null,
): { minX: number; maxX: number; minY: number; maxY: number } | null => {
  if (!charge) return null;
  const circled = Math.abs(charge) === 1 && atom.chargeMarkStyle === 'circled';
  const w =
    Math.abs(charge) === 1
      ? circled
        ? CIRCLED_CHARGE_MARK_W
        : FORMAL_CHARGE_MARK_W
      : 10 + Math.abs(charge) * 6;
  const h = 16;
  const { x: ox, y: oy } = resolveChargeMarkOffset(
    atom,
    mol,
    charge,
    atom.chargeOffset,
    dragPreview,
  );
  const cx = atom.x + ox;
  const cy = atom.y + oy;
  return {
    minX: cx - w / 2,
    maxX: cx + w / 2,
    minY: cy - h / 2,
    maxY: cy + h / 2,
  };
};

/**
 * Draw a formal charge at (cx, cy). For ±1 uses a stroked + / −; larger charges
 * use bold superscript digits + sign. Returns horizontal advance width.
 */
export const drawFormalChargeMark = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  charge: number,
  color: string,
  prefs: Pick<ResolvedCanvasPreferences, 'bondThicknessPx' | 'chargeFontCss'>,
  /** 'center' = mark centered on cx; 'left' = mark starts at cx (label flow). */
  align: 'center' | 'left' = 'center',
  circled = false,
): number => {
  if (charge === 0) return 0;

  const stroke = formalChargeStrokePx(prefs.bondThicknessPx);

  if (charge === 1 || charge === -1) {
    const half = circled ? 4.6 : 5.4;
    const w = circled ? CIRCLED_CHARGE_MARK_W : FORMAL_CHARGE_MARK_W;
    const mx = align === 'left' ? cx + w / 2 : cx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = stroke;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (circled) {
      ctx.beginPath();
      ctx.arc(mx, cy, 7.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (charge === -1) {
      ctx.beginPath();
      ctx.moveTo(mx - half, cy);
      ctx.lineTo(mx + half, cy);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(mx - half, cy);
      ctx.lineTo(mx + half, cy);
      ctx.moveTo(mx, cy - half);
      ctx.lineTo(mx, cy + half);
      ctx.stroke();
    }
    ctx.restore();
    return w;
  }

  const text = getChargeSuperscript(charge);
  const boldFont = prefs.chargeFontCss.includes('bold')
    ? prefs.chargeFontCss
    : `bold ${prefs.chargeFontCss}`;
  ctx.save();
  ctx.font = boldFont;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  ctx.textAlign = align === 'left' ? 'left' : 'center';
  ctx.fillText(text, cx, cy);
  ctx.restore();
  return tw;
};

export const chargeAdvanceWidth = (
  ctx: CanvasRenderingContext2D,
  charge: number,
  prefs: Pick<ResolvedCanvasPreferences, 'chargeFontCss'>,
  circled = false,
): number => {
  if (charge === 0) return 0;
  if (charge === 1 || charge === -1) {
    return circled ? CIRCLED_CHARGE_MARK_W : FORMAL_CHARGE_MARK_W;
  }
  const text = getChargeSuperscript(charge);
  const boldFont = prefs.chargeFontCss.includes('bold')
    ? prefs.chargeFontCss
    : `bold ${prefs.chargeFontCss}`;
  ctx.save();
  ctx.font = boldFont;
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
};

/** Width of δ + ± mark (partial charge). */
export const DELTA_CHARGE_MARK_W = 22;

export type DeltaChargeLabelExtents = {
  /** Upright-local left edge of the atom label relative to atom center. */
  left: number;
  /** Upright-local right edge of the atom label relative to atom center. */
  right: number;
};

/**
 * δ± on the same orbital ring as formal charges (atom center + offset).
 * `labelExtents` reserved for callers; default seat uses free-side ring.
 */
export const deltaChargeMarkBox = (
  atom: Atom,
  mol: Molecule,
  deltaCharge: number,
  _labelExtents?: DeltaChargeLabelExtents | null,
  dragPreview?: ChargeMarkOffset | null,
): { minX: number; maxX: number; minY: number; maxY: number; cx: number; cy: number } | null => {
  if (!deltaCharge) return null;
  const w = DELTA_CHARGE_MARK_W;
  const h = 16;
  const { x: ox, y: oy } = resolveChargeMarkOffset(
    atom,
    mol,
    deltaCharge,
    atom.deltaChargeOffset,
    dragPreview,
  );
  const cx = atom.x + ox;
  const cy = atom.y + oy;
  return {
    cx,
    cy,
    minX: cx - w / 2,
    maxX: cx + w / 2,
    minY: cy - h / 2,
    maxY: cy + h / 2,
  };
};

/**
 * World AABB for a δ± mark. Pass label extents when known so the mark clears text.
 */
export const estimateDeltaChargeMarkAabb = (
  atom: Atom,
  mol: Molecule,
  deltaCharge: number,
  labelExtents?: DeltaChargeLabelExtents | null,
  dragPreview?: ChargeMarkOffset | null,
): { minX: number; maxX: number; minY: number; maxY: number } | null => {
  const box = deltaChargeMarkBox(atom, mol, deltaCharge, labelExtents, dragPreview);
  if (!box) return null;
  return { minX: box.minX, maxX: box.maxX, minY: box.minY, maxY: box.maxY };
};

/** Draw δ+ / δ− next to an atom (teaching partial charge). */
export const drawDeltaChargeMark = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  deltaCharge: number,
  color: string,
  prefs: Pick<ResolvedCanvasPreferences, 'bondThicknessPx' | 'chargeFontCss'>,
  align: 'center' | 'left' = 'center',
): number => {
  if (!deltaCharge) return 0;
  const w = DELTA_CHARGE_MARK_W;
  const mx = align === 'left' ? cx + w / 2 : cx;
  const stroke = formalChargeStrokePx(prefs.bondThicknessPx);
  const half = 4.2;

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  const font = prefs.chargeFontCss.includes('bold')
    ? prefs.chargeFontCss
    : `500 ${prefs.chargeFontCss.replace(/^\s*bold\s+/i, '')}`;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('δ', mx - 5, cy + 0.5);

  ctx.lineWidth = stroke;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const sx = mx + 5;
  if (deltaCharge < 0) {
    ctx.beginPath();
    ctx.moveTo(sx - half, cy);
    ctx.lineTo(sx + half, cy);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(sx - half, cy);
    ctx.lineTo(sx + half, cy);
    ctx.moveTo(sx, cy - half);
    ctx.lineTo(sx, cy + half);
    ctx.stroke();
  }
  ctx.restore();
  return w;
};
