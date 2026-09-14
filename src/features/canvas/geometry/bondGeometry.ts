/**
 * Bond endpoint trimming so heteroatom labels (O, N, OH, …) get a small visual
 * gap. Carbon-carbon bonds stay flush except at condensed teaching labels (CH₃…).
 */
import type { ResolvedCanvasPreferences } from '@moldraw/core/canvasPreferences';
import {
  DEFAULT_ATOM_INK,
  resolveBondColorFromAtoms,
} from '@moldraw/domain';
import type { Atom, Molecule } from '@moldraw/domain';
import { atomUsesHeteroStyleTrim } from '@moldraw/domain';
import { condensedGroupLabelForAtom } from '@moldraw/domain';
import { aliasLabelBondGapTowardPartnerPx } from './aliasLabelMetrics';

/** Gap at carbon ends when the partner is a heteroatom (skeletal chain). */
export const BOND_TRIM_GAP_C = 6;
/** Larger "safe zone" at heteroatoms (O in ethers, OH, N, halogens, etc.). */
export const BOND_TRIM_GAP_HETERO = 13;
/** Extra px past half the anchored heavy glyph so bonds do not touch atom labels. */
export const CONDENSED_TERMINAL_BOND_PAD_PX = 5;

/** Optional canvas + prefs so alias labels (e.g. CH₂OH) get bond trims past full text width. */
export type BondTrimContext = {
  ctx: CanvasRenderingContext2D;
  displayPrefs: ResolvedCanvasPreferences;
  /** Per-atom upright correction (matches InfiniteCanvas `applyLabelUpright`). */
  labelRadForAtom: (atomId: string) => number;
  /** When set with `molecule` + `valencyMap`, terminal condensed labels get bond inset. */
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
  const aliasGap = aliasLabelBondGapTowardPartnerPx(
    trimCtx.ctx,
    trimCtx.displayPrefs,
    atom,
    partner,
    rad,
  );
  if (aliasGap <= 0) return base;
  return Math.min(len * 0.28, Math.max(base, aliasGap));
};

/**
 * Inset (px) at `atom` along the bond toward `partner` so the tip clears the
 * bonding-atom glyph (condensed CH₃/NH₂/OH, or a plain heteroatom symbol).
 * Alias labels use {@link aliasLabelBondGapTowardPartnerPx} instead.
 */
export function condensedTerminalBondInsetPx(
  atom: Atom,
  _partner: Atom,
  trimCtx: BondTrimContext | undefined,
): number {
  if (!trimCtx || atom.alias?.trim()) return 0;

  let head: string | null = null;
  if (trimCtx.condensedGroupLabels && trimCtx.molecule && trimCtx.valencyMap) {
    const v = trimCtx.valencyMap.get(atom.id) || 0;
    const label = condensedGroupLabelForAtom(atom, trimCtx.molecule, v);
    if (label) head = label[0] ?? null;
  }
  if (!head && atomUsesHeteroStyleTrim(atom)) {
    head =
      atom.element === 'H' && atom.isotope === 2
        ? 'D'
        : atom.element === 'H' && atom.isotope === 3
          ? 'T'
          : atom.element;
  }
  if (!head) return 0;

  trimCtx.ctx.save();
  try {
    trimCtx.ctx.font = trimCtx.displayPrefs.elementFontCss;
    const w = trimCtx.ctx.measureText(head).width;
    return w / 2 + CONDENSED_TERMINAL_BOND_PAD_PX;
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
  if (atomUsesHeteroStyleTrim(from) || atomUsesHeteroStyleTrim(to)) {
    if (atomUsesHeteroStyleTrim(from)) {
      gFrom = gapAtAtomEnd(from, to, len, trimCtx);
    }
    if (atomUsesHeteroStyleTrim(to)) {
      gTo = gapAtAtomEnd(to, from, len, trimCtx);
    }
  }
  const cFrom = condensedTerminalBondInsetPx(from, to, trimCtx);
  const cTo = condensedTerminalBondInsetPx(to, from, trimCtx);
  if (cFrom > 0) gFrom = Math.max(gFrom, cFrom);
  if (cTo > 0) gTo = Math.max(gTo, cTo);
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
  const condensedAny = cFrom > 0 || cTo > 0;
  if (!hetero && !condensedAny) return { ax: from.x, ay: from.y, bx: to.x, by: to.y };
  return trimBondEndpoints(from, to, trimCtx);
};

export interface BondStrokeColorOptions {
  /** When true, use endpoint label colors if the bond has no explicit color. */
  applyAtomColorsToBonds?: boolean;
}

/** Stroke color: explicit bond color, optional endpoint inheritance, else default ink. */
export const bondStrokeColor = (
  bond: { color?: string },
  from: Atom,
  to: Atom,
  opts?: BondStrokeColorOptions,
): string => {
  if (bond.color) return bond.color;
  // Bond coloring uses element palette independently of the 2D label-color toggle.
  if (opts?.applyAtomColorsToBonds) {
    return resolveBondColorFromAtoms(from, to, { useElementColors: true });
  }
  return DEFAULT_ATOM_INK;
};
