/**
 * Bond endpoint trimming so heteroatom labels (O, N, OH, …) get a small visual
 * gap. Carbon-carbon bonds stay flush unless a condensed/alias label is shown —
 * then the stroke stops before the label box (Ketcher-style). Stored atom
 * coordinates are never moved.
 */
import {
  resolveAtomLabelFonts,
  type ResolvedCanvasPreferences,
} from '@moldraw/core/canvasPreferences';
import {
  DEFAULT_ATOM_INK,
  condensedGroupLabelForAtom,
  getEffectiveValencyForImplicitHydrogen,
  resolveBondColorFromAtoms,
} from '@moldraw/domain';
import type { Atom, Molecule } from '@moldraw/domain';
import { atomUsesHeteroStyleTrim } from '@moldraw/domain';
import {
  aliasLabelBondGapTowardPartnerPx,
  labelBoxBondGapTowardPartnerPx,
  measureHeadAnchoredLabelSize,
} from './aliasLabelMetrics';
import { carbonLabelHGoesLeft, groupLabelTailGoesLeft } from './hydrogenLayout';

/** Gap at carbon ends when the partner is a heteroatom (skeletal chain). */
export const BOND_TRIM_GAP_C = 6;
/** Larger "safe zone" at heteroatoms (O in ethers, OH, N, halogens, etc.). */
export const BOND_TRIM_GAP_HETERO = 13;
/** Extra px past half the anchored heavy glyph so bonds do not touch atom labels. */
export const CONDENSED_TERMINAL_BOND_PAD_PX = 5;
/** Tight pad past Hₙ so zigzag bonds stay long but do not graze H. */
const FORMULA_HN_BOND_PAD_PX = 4;
/** Horizontal Hₙ strip — a tall box shortens diagonal chain bonds. */
const FORMULA_HN_STRIP_H = 2;

const elementGlyphHeightPx = (
  ctx: CanvasRenderingContext2D,
  fontCss: string,
): number => {
  ctx.font = fontCss;
  const m = ctx.measureText('C');
  return (m.actualBoundingBoxAscent ?? 0) + (m.actualBoundingBoxDescent ?? 0) || 14;
};

/** Clear Hₙ sideways and the C glyph above/below (vertical CH₃ bonds). */
const formulaGapFromExtents = (
  left: number,
  right: number,
  elLeft: number,
  elRight: number,
  glyphH: number,
  atom: Atom,
  partner: Atom,
  rad: number,
): number => {
  const towardH = labelBoxBondGapTowardPartnerPx(
    left,
    right,
    FORMULA_HN_STRIP_H,
    atom,
    partner,
    rad,
    FORMULA_HN_BOND_PAD_PX,
  );
  const towardGlyph = labelBoxBondGapTowardPartnerPx(
    elLeft,
    elRight,
    glyphH,
    atom,
    partner,
    rad,
    FORMULA_HN_BOND_PAD_PX,
  );
  return Math.max(towardH, towardGlyph);
};

/** Optional canvas + prefs so alias labels (e.g. CH₂OH) get bond trims past full text width. */
export type BondTrimContext = {
  ctx: CanvasRenderingContext2D;
  displayPrefs: ResolvedCanvasPreferences;
  /** Per-atom upright correction (matches InfiniteCanvas `applyLabelUpright`). */
  labelRadForAtom: (atomId: string) => number;
  /**
   * Teaching labels (CH₃ / NH₂ / OH). Render-only: insets the bond tip at the
   * label box. Does not change stored atom coordinates.
   */
  condensedGroupLabels?: boolean;
  molecule?: Molecule;
  valencyMap?: Map<string, number>;
};

const capGapForAtom = (atom: Atom): number =>
  atom.element === 'C' && !atom.alias?.trim() ? BOND_TRIM_GAP_C : BOND_TRIM_GAP_HETERO;

const gapAtAtomEnd = (
  atom: Atom,
  partner: Atom,
  len: number,
  trimCtx: BondTrimContext | undefined,
): number => {
  const base = Math.min(capGapForAtom(atom), len * 0.28);
  if (!trimCtx || !atom.alias?.trim()) return base;
  const rad = trimCtx.labelRadForAtom(atom.id);
  const prefs = {
    ...trimCtx.displayPrefs,
    ...resolveAtomLabelFonts(trimCtx.displayPrefs, atom.labelFontSizePt),
  };
  const aliasGap = aliasLabelBondGapTowardPartnerPx(
    trimCtx.ctx,
    prefs,
    atom,
    partner,
    rad,
    trimCtx.molecule,
  );
  if (aliasGap <= 0) return base;
  return Math.min(len * 0.28, Math.max(base, aliasGap));
};

/**
 * Inset so the bond tip stops at the condensed FG label box (CH₃ / OH / NH₂),
 * before the attachment glyph — not through C of CH₃.
 */
function condensedGroupLabelBondGapTowardPartnerPx(
  atom: Atom,
  partner: Atom,
  trimCtx: BondTrimContext | undefined,
): number {
  if (!trimCtx?.condensedGroupLabels || !trimCtx.molecule || !trimCtx.valencyMap) return 0;
  if (atom.alias?.trim()) return 0;
  const v = trimCtx.valencyMap.get(atom.id) || 0;
  const label = condensedGroupLabelForAtom(atom, trimCtx.molecule, v);
  if (!label) return 0;
  const prefs = {
    ...trimCtx.displayPrefs,
    ...resolveAtomLabelFonts(trimCtx.displayPrefs, atom.labelFontSizePt),
  };
  const rad = trimCtx.labelRadForAtom(atom.id);
  const m = measureHeadAnchoredLabelSize(trimCtx.ctx, prefs, label, atom.charge ?? 0, {
    tailGoesLeft: groupLabelTailGoesLeft(atom, trimCtx.molecule),
    attachmentElement: atom.element,
  });
  if (m.w < 2) return 0;
  return labelBoxBondGapTowardPartnerPx(m.left, m.right, m.h, atom, partner, rad);
}

/**
 * Inset (px) at `atom` along the bond toward `partner` so the tip clears a
 * heteroatom glyph. Condensed CH₃/OH labels use
 * {@link condensedGroupLabelBondGapTowardPartnerPx}. Alias labels use
 * {@link aliasLabelBondGapTowardPartnerPx}.
 */
export function condensedTerminalBondInsetPx(
  atom: Atom,
  _partner: Atom,
  trimCtx: BondTrimContext | undefined,
): number {
  if (!trimCtx || atom.alias?.trim()) return 0;
  if (!atomUsesHeteroStyleTrim(atom)) return 0;

  const head =
    atom.element === 'H' && atom.isotope === 2
      ? 'D'
      : atom.element === 'H' && atom.isotope === 3
        ? 'T'
        : atom.element;

  trimCtx.ctx.save();
  try {
    const fonts = resolveAtomLabelFonts(trimCtx.displayPrefs, atom.labelFontSizePt);
    trimCtx.ctx.font = fonts.elementFontCss;
    const w = trimCtx.ctx.measureText(head).width;
    return w / 2 + CONDENSED_TERMINAL_BOND_PAD_PX;
  } finally {
    trimCtx.ctx.restore();
  }
}

const getDisplayElement = (element: string, isotope?: number): string => {
  if (element === 'H' && isotope === 2) return 'D';
  if (element === 'H' && isotope === 3) return 'T';
  return element;
};

/**
 * Inset so the bond tip starts after Hₙ on CH₂ / H₂C / OH / NH₂, not through it.
 */
function formulaLabelBondGapTowardPartnerPx(
  atom: Atom,
  partner: Atom,
  trimCtx: BondTrimContext | undefined,
): number {
  if (!trimCtx?.molecule || !trimCtx.valencyMap) return 0;
  if (atom.alias?.trim()) return 0;

  const prefs = {
    ...trimCtx.displayPrefs,
    ...resolveAtomLabelFonts(trimCtx.displayPrefs, atom.labelFontSizePt),
  };
  const rad = trimCtx.labelRadForAtom(atom.id);
  const v = trimCtx.valencyMap.get(atom.id) || 0;

  const isCarbon = atom.element === 'C';
  const forceElementLabel = Boolean(atom.showElementLabel);
  if (isCarbon && !forceElementLabel) return 0;

  const maxH = getEffectiveValencyForImplicitHydrogen(atom.element, atom.charge || 0);
  const numH = Math.max(0, maxH - v);
  if (numH <= 0) return 0;

  const displayElement = getDisplayElement(atom.element, atom.isotope);
  const isotopeStr =
    atom.element === 'H' && (atom.isotope === 2 || atom.isotope === 3)
      ? ''
      : atom.isotope
        ? String(atom.isotope)
        : '';

  trimCtx.ctx.save();
  try {
    trimCtx.ctx.font = prefs.elementFontCss;
    const elW = trimCtx.ctx.measureText(displayElement).width;
    trimCtx.ctx.font = prefs.subFontCss;
    const hDigitW = numH > 1 ? trimCtx.ctx.measureText(String(numH)).width : 0;
    trimCtx.ctx.font = prefs.elementFontCss;
    const hW = trimCtx.ctx.measureText('H').width + hDigitW;
    trimCtx.ctx.font = prefs.isoFontCss;
    const isoW = isotopeStr ? trimCtx.ctx.measureText(isotopeStr).width : 0;
    const leftH = carbonLabelHGoesLeft(atom, trimCtx.molecule);

    let left = -elW / 2;
    let right = elW / 2;
    if (isotopeStr) left -= isoW;
    if (leftH) left -= hW;
    else right += hW;

    const glyphH = elementGlyphHeightPx(trimCtx.ctx, prefs.elementFontCss);
    return formulaGapFromExtents(
      left,
      right,
      -elW / 2,
      elW / 2,
      glyphH,
      atom,
      partner,
      rad,
    );
  } finally {
    trimCtx.ctx.restore();
  }
}

/** Trim only when a heteroatom (non-C) is involved — C–C rings stay continuous. */
export const shouldTrimBondEndpoints = (from: Atom, to: Atom): boolean =>
  atomUsesHeteroStyleTrim(from) || atomUsesHeteroStyleTrim(to);

const trimBondEndpoints = (
  from: Atom,
  to: Atom,
  trimCtx?: BondTrimContext,
): { ax: number; ay: number; bx: number; by: number } => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { ax: from.x, ay: from.y, bx: to.x, by: to.y };
  let gFrom = 0;
  let gTo = 0;
  const fFrom = formulaLabelBondGapTowardPartnerPx(from, to, trimCtx);
  const fTo = formulaLabelBondGapTowardPartnerPx(to, from, trimCtx);
  const dFrom = condensedGroupLabelBondGapTowardPartnerPx(from, to, trimCtx);
  const dTo = condensedGroupLabelBondGapTowardPartnerPx(to, from, trimCtx);
  // Formula Hₙ inset already clears C + H; do not also apply the isotropic
  // hetero / condensed gaps or zigzag bonds shrink to a stub.
  if (fFrom > 0) {
    gFrom = fFrom;
  } else {
    if (atomUsesHeteroStyleTrim(from)) gFrom = gapAtAtomEnd(from, to, len, trimCtx);
    gFrom = Math.max(gFrom, condensedTerminalBondInsetPx(from, to, trimCtx), dFrom);
  }
  if (fTo > 0) {
    gTo = fTo;
  } else {
    if (atomUsesHeteroStyleTrim(to)) gTo = gapAtAtomEnd(to, from, len, trimCtx);
    gTo = Math.max(gTo, condensedTerminalBondInsetPx(to, from, trimCtx), dTo);
  }
  if (gFrom + gTo > len * 0.92) {
    const scale = (len * 0.92) / (gFrom + gTo);
    gFrom *= scale;
    gTo *= scale;
  }
  const ux = dx / len;
  const uy = dy / len;
  return {
    ax: from.x + ux * gFrom,
    ay: from.y + uy * gFrom,
    bx: to.x - ux * gTo,
    by: to.y - uy * gTo,
  };
};

/** Effective bond endpoints, trimmed inward at heteroatom ends. */
export const bondEndPoints = (
  from: Atom,
  to: Atom,
  trimCtx?: BondTrimContext,
): { ax: number; ay: number; bx: number; by: number } => {
  const hetero = shouldTrimBondEndpoints(from, to);
  const cFrom = condensedTerminalBondInsetPx(from, to, trimCtx);
  const cTo = condensedTerminalBondInsetPx(to, from, trimCtx);
  const fFrom = formulaLabelBondGapTowardPartnerPx(from, to, trimCtx);
  const fTo = formulaLabelBondGapTowardPartnerPx(to, from, trimCtx);
  const dFrom = condensedGroupLabelBondGapTowardPartnerPx(from, to, trimCtx);
  const dTo = condensedGroupLabelBondGapTowardPartnerPx(to, from, trimCtx);
  const condensedAny = cFrom > 0 || cTo > 0 || fFrom > 0 || fTo > 0 || dFrom > 0 || dTo > 0;
  if (!hetero && !condensedAny) return { ax: from.x, ay: from.y, bx: to.x, by: to.y };
  return trimBondEndpoints(from, to, trimCtx);
};

export interface BondStrokeColorOptions {
  /** When true, use endpoint label colors if the bond has no explicit color. */
  applyAtomColorsToBonds?: boolean;
  /** Theme default structure ink (bonds when not colored). */
  defaultInk?: string;
}

/** Stroke color: explicit bond color, optional endpoint inheritance, else default ink. */
export const bondStrokeColor = (
  bond: { color?: string },
  from: Atom,
  to: Atom,
  opts?: BondStrokeColorOptions,
): string => {
  if (bond.color) return bond.color;
  const defaultInk = opts?.defaultInk ?? DEFAULT_ATOM_INK;
  // Bond coloring uses element palette independently of the 2D label-color toggle.
  if (opts?.applyAtomColorsToBonds) {
    return resolveBondColorFromAtoms(from, to, {
      useElementColors: true,
      defaultInk,
    });
  }
  return defaultInk;
};
