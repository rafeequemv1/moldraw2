/**
 * Atom-level decorations rendered AFTER bonds:
 *  - Implicit-H stubs (carbons get little C–H lines + "H" labels when toggled).
 *  - Atom labels — heteroatom symbols, alias text (e.g. "OH", "NH₂", "Boc"),
 *    and superscripted formal charges.
 *  - Lone-pair dots placed clear of bonds, the atom label, and nearby atoms.
 *
 * All three live together because they share the same upright-counter-rotation
 * logic and the same charge / H-count math.
 */
import {
  explicitHydrogenLabelColor,
  resolveAtomLabelColor,
} from '@moldraw/domain';
import { getEffectiveValencyForImplicitHydrogen } from '@moldraw/domain';
import { buildAliasDisplayRuns } from '@moldraw/domain';
import { condensedGroupLabelForAtom } from '@moldraw/domain';
import {
  getHydrogenStubDirections,
  hGoesLeft,
  IMPLICIT_H_BOND_END,
  IMPLICIT_H_LABEL_DIST,
} from '../geometry';
import {
  measureHeadAnchoredLabelSize,
  measureAliasLabelSize,
} from '../geometry/aliasLabelMetrics';
import {
  getLonePairPlacements,
  labelBoxFromExtents,
  LONE_PAIR_DOT_SEP_PX,
  type LabelBoxLocal,
} from '../geometry/lonePairLayout';
import type { RenderContext } from './types';
import type { Atom, Molecule } from '@moldraw/domain';
import type { ResolvedCanvasPreferences } from '@moldraw/core/canvasPreferences';

const getChargeString = (charge: number): string => {
  if (charge === 0) return '';
  if (charge === 1) return '⁺';
  if (charge === -1) return '⁻';
  const absCharge = Math.abs(charge);
  const sign = charge > 0 ? '⁺' : '⁻';
  const superscripts = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
  return absCharge.toString().split('').map(d => superscripts[parseInt(d)]).join('') + sign;
};

const getDisplayElement = (element: string, isotope?: number): string => {
  if (element === 'H' && isotope === 2) return 'D';
  if (element === 'H' && isotope === 3) return 'T';
  return element;
};

const getIsotopeString = (element: string, isotope?: number): string =>
  element === 'H' && (isotope === 2 || isotope === 3) ? '' : isotope ? String(isotope) : '';

/** Short C–H bond stubs + "H" labels for each implicit hydrogen on a carbon. */
export const drawImplicitHydrogenStubs = (
  ctx: CanvasRenderingContext2D,
  R: RenderContext,
): void => {
  if (!R.showHydrogens) return;
  const P = R.displayPrefs;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  R.renderedMolecule.atoms.forEach(atom => {
    if (atom.element !== 'C' || atom.alias?.trim()) return;
    const v = R.valencyMap.get(atom.id) || 0;
    const maxValency = getEffectiveValencyForImplicitHydrogen(atom.element, atom.charge || 0);
    const implicitH = Math.max(0, maxValency - v);
    if (implicitH <= 0) return;
    if (
      R.condensedGroupLabels &&
      condensedGroupLabelForAtom(atom, R.renderedMolecule, v)
    ) {
      return;
    }
    const hCol = explicitHydrogenLabelColor(atom, { useElementColors: R.colorAtomLabels });
    ctx.strokeStyle = hCol;
    const dirs = getHydrogenStubDirections(atom, R.renderedMolecule, implicitH);
    R.applyLabelUpright(atom.id, () => {
      for (const dir of dirs) {
        const x1 = atom.x + dir.x * IMPLICIT_H_BOND_END;
        const y1 = atom.y + dir.y * IMPLICIT_H_BOND_END;
        ctx.beginPath();
        ctx.moveTo(atom.x, atom.y);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        const hx = atom.x + dir.x * IMPLICIT_H_LABEL_DIST;
        const hy = atom.y + dir.y * IMPLICIT_H_LABEL_DIST;
        ctx.font = P.implicitHFontCss;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = hCol;
        ctx.fillText('H', hx, hy);
      }
    });
  });
};

/** Heteroatom symbols, alias labels, and formal charge superscripts. */
export const drawAtomLabels = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const P = R.displayPrefs;
  const EL_FONT = P.elementFontCss;
  const SUB_FONT = P.subFontCss;
  const CHG_FONT = P.chargeFontCss;
  const ISO_FONT = P.isoFontCss;
  const colorOpts = { useElementColors: R.colorAtomLabels };

  ctx.font = P.subFontCss;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const drawChargeOnly = (x: number, y: number, chargeStr: string, fill = '#0f172a') => {
    ctx.font = CHG_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fill;
    ctx.fillText(chargeStr, x, y - 4);
  };

  R.renderedMolecule.atoms.forEach(atom => {
    // Explicit H atoms join the H-toggle subset (same as carbon stubs).
    if (atom.element === 'H') {
      const special = (atom.charge ?? 0) !== 0 || Boolean(atom.isotope && atom.isotope > 0);
      if (!special && !R.showHydrogens) return;
    }

    const currentValency = R.valencyMap.get(atom.id) || 0;
    const maxForImplicitH = getEffectiveValencyForImplicitHydrogen(atom.element, atom.charge || 0);
    const implicitH = Math.max(0, maxForImplicitH - currentValency);
    const isCarbon = atom.element === 'C';
    const chargeStr = getChargeString(atom.charge);
    const displayElement = getDisplayElement(atom.element, atom.isotope);
    const isotopeStr = getIsotopeString(atom.element, atom.isotope);

    /** Draw multi-glyph label with the bonding atom glyph centered on `atom` (ChemDraw-style). */
    const drawHeadAnchoredRuns = (rawLabel: string, fill: string) => {
      const runs = buildAliasDisplayRuns(rawLabel);
      const anchorSym = rawLabel[0];
      if (!anchorSym) return;
      ctx.font = EL_FONT;
      const wHead = ctx.measureText(anchorSym).width;
      let curX = atom.x - wHead / 2;
      const baseY = atom.y;
      const drawEl = (text: string, font: string, dy = 0) => {
        ctx.font = font;
        ctx.fillStyle = fill;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, curX, baseY + dy);
        curX += ctx.measureText(text).width;
      };
      let runIdx = 0;
      for (const r of runs) {
        if (
          runIdx === 0 &&
          r.kind === 'base' &&
          r.text.length > 0 &&
          r.text[0] === anchorSym
        ) {
          drawEl(anchorSym, EL_FONT, 0);
          const rest = r.text.slice(1);
          if (rest) drawEl(rest, EL_FONT, 0);
        } else {
          drawEl(r.text, r.kind === 'sub' ? SUB_FONT : EL_FONT, r.kind === 'sub' ? 5 : 0);
        }
        runIdx++;
      }
      if (chargeStr) drawEl(chargeStr, CHG_FONT, -4);
    };

    if (atom.alias?.trim()) {
      if (atom.id === R.omitAtomAliasBodyId) return;
      R.applyLabelUpright(atom.id, () => {
        drawHeadAnchoredRuns(atom.alias!.trim(), resolveAtomLabelColor(atom, colorOpts));
      });
      return;
    }

    if (R.condensedGroupLabels) {
      const condensed = condensedGroupLabelForAtom(atom, R.renderedMolecule, currentValency);
      if (condensed) {
        if (atom.id === R.omitAtomAliasBodyId) return;
        R.applyLabelUpright(atom.id, () => {
          drawHeadAnchoredRuns(condensed, resolveAtomLabelColor(atom, colorOpts));
        });
        return;
      }
    }

    if (isCarbon && R.showHydrogens && implicitH > 0 && !isotopeStr) {
      if (chargeStr) {
        R.applyLabelUpright(atom.id, () =>
          drawChargeOnly(atom.x, atom.y, chargeStr, resolveAtomLabelColor(atom, colorOpts)),
        );
      }
      return;
    }
    if (isCarbon && R.showHydrogens && implicitH === 0 && atom.charge === 0 && !isotopeStr) return;
    if (isCarbon && R.showHydrogens && implicitH === 0 && chargeStr) {
      R.applyLabelUpright(atom.id, () =>
        drawChargeOnly(atom.x, atom.y, chargeStr, resolveAtomLabelColor(atom, colorOpts)),
      );
      return;
    }

    const numH = isCarbon && R.showHydrogens ? 0 : !isCarbon || R.showHydrogens ? implicitH : 0;

    const needsLabel = !isCarbon || atom.charge !== 0 || R.showHydrogens || Boolean(isotopeStr);
    if (!needsLabel) return;

    R.applyLabelUpright(atom.id, () => {
      const leftH = numH > 0 && hGoesLeft(atom, R.renderedMolecule);
      const labelColor = resolveAtomLabelColor(atom, colorOpts);
      const hLabelColor = explicitHydrogenLabelColor(atom, colorOpts);

      ctx.font = EL_FONT;
      const isoW = isotopeStr ? (() => {
        ctx.font = ISO_FONT;
        const w = ctx.measureText(isotopeStr).width;
        ctx.font = EL_FONT;
        return w;
      })() : 0;
      const elW = ctx.measureText(displayElement).width;
      ctx.font = SUB_FONT;
      const subH = numH > 1 ? ctx.measureText(String(numH)).width : 0;
      ctx.font = EL_FONT;
      const hW = numH > 0 ? ctx.measureText('H').width + subH : 0;

      // Anchor the bonding atom glyph on the atom center; Hₙ / isotope / charge extend away.
      let curX = atom.x - elW / 2;
      if (isotopeStr) curX -= isoW;
      if (leftH && numH > 0) curX -= hW;
      const baseY = atom.y;

      const drawEl = (text: string, font: string, dy = 0, fill = labelColor) => {
        ctx.font = font;
        ctx.fillStyle = fill;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, curX, baseY + dy);
        curX += ctx.measureText(text).width;
      };

      if (isotopeStr) drawEl(isotopeStr, ISO_FONT, -7);

      if (leftH && numH > 0) {
        drawEl('H', EL_FONT, 0, hLabelColor);
        if (numH > 1) drawEl(String(numH), SUB_FONT, 5, hLabelColor);
      }

      drawEl(displayElement, EL_FONT, 0);

      if (!leftH && numH > 0) {
        drawEl('H', EL_FONT, 0, hLabelColor);
        if (numH > 1) drawEl(String(numH), SUB_FONT, 5, hLabelColor);
      }

      if (chargeStr) drawEl(chargeStr, CHG_FONT, -4);
    });
  });
};

/** Two dots per lone pair — stay on the bonding atom (O), not on the H tail. */
export const drawLonePairs = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  R.renderedMolecule.atoms.forEach(atom => {
    const lp = Math.max(0, atom.lonePairs ?? 0);
    if (lp <= 0) return;
    const layout = resolveLonePairLabelLayout(ctx, R, atom);
    const placements = getLonePairPlacements(atom, R.renderedMolecule, lp, {
      headBox: layout.headBox,
      labelTailLocal: layout.labelTailLocal,
      labelCounterRad: R.labelCounterRad,
    });
    const dotColor = resolveAtomLabelColor(atom, { useElementColors: R.colorAtomLabels });
    const sep = LONE_PAIR_DOT_SEP_PX;
    R.applyLabelUpright(atom.id, () => {
      ctx.fillStyle = dotColor;
      for (const p of placements) {
        const cx = atom.x + p.dir.x * p.dist;
        const cy = atom.y + p.dir.y * p.dist;
        const nx = -p.dir.y;
        const ny = p.dir.x;
        ctx.beginPath();
        ctx.arc(cx + nx * sep, cy + ny * sep, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx - nx * sep, cy - ny * sep, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  });
};

type LonePairLabelLayout = {
  headBox: LabelBoxLocal | null;
  /** Upright-local unit vector toward the label tail (H in OH); null if single glyph. */
  labelTailLocal: { x: number; y: number } | null;
};

/** Head keep-out + optional tail direction for condensed/alias labels. */
function resolveLonePairLabelLayout(
  ctx: CanvasRenderingContext2D,
  R: RenderContext,
  atom: Atom,
): LonePairLabelLayout {
  const P = R.displayPrefs;
  const mol = R.renderedMolecule;
  const charge = atom.charge ?? 0;

  const fromHeadAnchored = (m: {
    w: number;
    h: number;
    left: number;
    headRight: number;
    hasTail: boolean;
  }): LonePairLabelLayout => {
    if (m.w < 2) return { headBox: null, labelTailLocal: null };
    return {
      headBox: labelBoxFromExtents(m.left, m.headRight, m.h),
      labelTailLocal: m.hasTail ? { x: 1, y: 0 } : null,
    };
  };

  if (atom.alias?.trim()) {
    return fromHeadAnchored(measureAliasLabelSize(ctx, P, atom));
  }

  const currentValency = R.valencyMap.get(atom.id) || 0;
  if (R.condensedGroupLabels) {
    const condensed = condensedGroupLabelForAtom(atom, mol, currentValency);
    if (condensed) {
      return fromHeadAnchored(measureHeadAnchoredLabelSize(ctx, P, condensed, charge));
    }
  }

  const el = measureElementLabelBox(ctx, P, atom, mol, currentValency, R.showHydrogens);
  return {
    headBox: el.headBox,
    labelTailLocal: el.labelTailLocal,
  };
}

function measureElementLabelBox(
  ctx: CanvasRenderingContext2D,
  P: ResolvedCanvasPreferences,
  atom: Atom,
  mol: Molecule,
  bondOrderSum: number,
  showHydrogens: boolean,
): LonePairLabelLayout {
  const isCarbon = atom.element === 'C';
  const maxForImplicitH = getEffectiveValencyForImplicitHydrogen(atom.element, atom.charge || 0);
  const implicitH = Math.max(0, maxForImplicitH - bondOrderSum);
  const numH = isCarbon && showHydrogens ? 0 : !isCarbon || showHydrogens ? implicitH : 0;
  const displayElement = getDisplayElement(atom.element, atom.isotope);
  const isotopeStr = getIsotopeString(atom.element, atom.isotope);
  const chargeStr = getChargeString(atom.charge ?? 0);

  if (isCarbon && !isotopeStr && !chargeStr && numH === 0) {
    return {
      headBox: labelBoxFromExtents(-4, 4, 10),
      labelTailLocal: null,
    };
  }

  ctx.save();
  try {
    ctx.font = P.elementFontCss;
    const elW = ctx.measureText(displayElement).width;
    ctx.font = P.isoFontCss;
    const isoW = isotopeStr ? ctx.measureText(isotopeStr).width : 0;

    const leftH = numH > 0 && hGoesLeft(atom, mol);
    let left = -elW / 2;
    const headRight = elW / 2;
    if (isotopeStr) left -= isoW;

    const m = ctx.measureText('Mg');
    const asc = m.actualBoundingBoxAscent ?? 0;
    const desc = m.actualBoundingBoxDescent ?? 0;
    const h = (asc + desc || 14) + 10;

    let labelTailLocal: { x: number; y: number } | null = null;
    if (numH > 0 || chargeStr) {
      labelTailLocal = leftH ? { x: -1, y: 0 } : { x: 1, y: 0 };
    }

    return {
      headBox: labelBoxFromExtents(left, headRight, h),
      labelTailLocal,
    };
  } finally {
    ctx.restore();
  }
}
