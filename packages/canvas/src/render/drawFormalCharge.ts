/**
 * Formal-charge marks: thin stroked + / − and a thin circle for ⊕ / ⊖
 * so carbocation / carbanion marks stay readable without looking heavy.
 */
import type { Atom, Molecule } from '@moldraw/domain';
import {
  CHARGE_MARK_R_DEFAULT_PX,
  clampChargeMarkOffset,
  defaultChargeSeatAngle,
  distBeyondLabelBox,
  getLonePairPlacements,
  labelBoxFromExtents,
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

/** Thin + / − stroke (circled marks use the same weight for the ring). */
export const formalChargeStrokePx = (bondThicknessPx: number): number =>
  Math.max(1.05, Math.min(1.55, bondThicknessPx * 0.48));

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
 * Default seat on a vacant upright side (same angle lone pairs reserve).
 * Distance is measured from the letter edge so ± does not sit on Cl / O / N
 * or on a bond / lone-pair ray.
 */
export const defaultChargeMarkOffset = (
  atom: Atom,
  mol: Molecule,
  charge: number,
): ChargeMarkOffset => {
  const lp = Math.max(0, atom.lonePairs ?? 0);
  const lpAngles =
    lp > 0
      ? getLonePairPlacements(atom, mol, lp, {
          preferSide: atom.lonePairSide ?? 'above',
          reserveChargeSeat: true,
        }).map(p => Math.atan2(p.dir.y, p.dir.x))
      : [];

  let ang = defaultChargeSeatAngle(atom, mol);
  if (lpAngles.length) {
    let blocked = false;
    for (const pang of lpAngles) {
      if (Math.abs(shortestAngleDiff(ang, pang)) < 0.7) {
        blocked = true;
        break;
      }
    }
    if (blocked) {
      const occupied = [...lpAngles];
      for (const b of mol.bonds) {
        if (b.fromAtomId !== atom.id && b.toAtomId !== atom.id) continue;
        const oid = b.fromAtomId === atom.id ? b.toAtomId : b.fromAtomId;
        const other = mol.atoms.find(x => x.id === oid);
        if (!other) continue;
        occupied.push(Math.atan2(other.y - atom.y, other.x - atom.x));
      }
      let bestAng = ang;
      let best = -Infinity;
      for (let i = 0; i < 16; i++) {
        const a = -Math.PI + (i * Math.PI) / 8;
        let score = Infinity;
        for (const o of occupied) score = Math.min(score, Math.abs(shortestAngleDiff(a, o)));
        if (Math.sin(a) < 0) score += 0.15;
        if (score > best) {
          best = score;
          bestAng = a;
        }
      }
      ang = bestAng;
    }
  }

  const w = Math.max(10, atom.element.length * 7.2);
  const box = labelBoxFromExtents(-w / 2, w / 2, 13);
  const dir = { x: Math.cos(ang), y: Math.sin(ang) };
  const markHalf = Math.abs(charge) === 1 ? 6.4 : 7.2;
  const r = Math.max(
    CHARGE_MARK_R_DEFAULT_PX,
    distBeyondLabelBox(dir, box, 0, markHalf + 3.2),
  );
  return clampChargeMarkOffset(dir.x * r, dir.y * r);
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
    const half = circled ? 3.55 : 4.6;
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
      ctx.arc(mx, cy, 6.35, 0, Math.PI * 2);
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
