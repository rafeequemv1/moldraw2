/**
 * Atom-level decorations rendered AFTER bonds:
 *  - Implicit-H labels (carbons get C–H bonds + "H" at explicit-H size when toggled).
 *  - Atom labels — heteroatom symbols, alias text (e.g. "OH", "NH₂", "Boc"),
 *    and superscripted formal charges.
 *  - Lone-pair dots placed clear of bonds, the atom label, and nearby atoms.
 *
 * All three live together because they share the same upright-counter-rotation
 * logic and the same charge / H-count math.
 */
import { clampChargeMarkOffset } from '@moldraw/core';
import { resolveAtomLabelFonts } from '@moldraw/core/canvasPreferences';
import {
  explicitHydrogenLabelColor,
  formulaLabelCharFills,
  resolveAtomLabelColor,
} from '@moldraw/domain';
import { getEffectiveValencyForImplicitHydrogen } from '@moldraw/domain';
import { buildAliasDisplayRuns } from '@moldraw/domain';
import { condensedGroupLabelForAtom, isIsolatedWaterOxygen } from '@moldraw/domain';
import {
  carbonLabelHGoesLeft,
  hGoesLeft,
  getHydrogenStubDirections,
  implicitHydrogenBondEnd,
  implicitHydrogenLabelDist,
} from '../geometry';
import {
  measureHeadAnchoredLabelSize,
  measureAliasLabelSize,
} from '../geometry/aliasLabelMetrics';
import {
  getLonePairPlacements,
  labelBoxFromExtents,
  LONE_PAIR_DOT_R_PX,
  LONE_PAIR_DOT_SEP_PX,
  RADICAL_DIST_PX,
  RADICAL_DOT_R_PX,
  type LabelBoxLocal,
} from '../geometry/lonePairLayout';
import {
  chargeGoesLeft,
  deltaChargeMarkBox,
  drawDeltaChargeMark,
  drawFormalChargeMark,
  estimateChargeMarkAabb,
  estimateDeltaChargeMarkAabb,
  FORMAL_CHARGE_MARK_W,
  type ChargeMarkOffset,
  type DeltaChargeLabelExtents,
} from './drawFormalCharge';
import type { RenderContext } from './types';
import type { Atom, Molecule } from '@moldraw/domain';
import type { ResolvedCanvasPreferences } from '@moldraw/core';

const getDisplayElement = (element: string, isotope?: number): string => {
  if (element === 'H' && isotope === 2) return 'D';
  if (element === 'H' && isotope === 3) return 'T';
  return element;
};

const getIsotopeString = (element: string, isotope?: number): string =>
  element === 'H' && (isotope === 2 || isotope === 3) ? '' : isotope ? String(isotope) : '';

const formulaImplicitHydrogenCount = (
  atom: Atom,
  mol: Molecule,
  bondOrderSum: number,
  showHydrogens: boolean,
): number => {
  if (isIsolatedWaterOxygen(atom, mol, bondOrderSum)) return 0;
  const isCarbon = atom.element === 'C';
  const forceElementLabel = Boolean(atom.showElementLabel);
  const maxForImplicitH = getEffectiveValencyForImplicitHydrogen(atom.element, atom.charge || 0);
  const implicitH = Math.max(0, maxForImplicitH - bondOrderSum);
  return isCarbon && showHydrogens && !forceElementLabel
    ? 0
    : !isCarbon || showHydrogens || forceElementLabel
      ? implicitH
      : 0;
};

/**
 * Display-only C–H bonds + "H" labels. Geometry and glyph size match explicit H
 * atoms (right-click Add explicit H) so Settings is not a tiny stub overlay.
 * Isolated water always shows two bent H stubs (even when implicit-H display is off).
 */
export const drawImplicitHydrogenStubs = (
  ctx: CanvasRenderingContext2D,
  R: RenderContext,
): void => {
  const P = R.displayPrefs;
  ctx.lineWidth = P.bondThicknessPx;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const labelDist = implicitHydrogenLabelDist(P.bondLengthPx);

  R.renderedMolecule.atoms.forEach(atom => {
    if (R.visibleAtomIds && !R.visibleAtomIds.has(atom.id)) return;
    const v = R.valencyMap.get(atom.id) || 0;
    const water = isIsolatedWaterOxygen(atom, R.renderedMolecule, v);
    if (!water) {
      if (!R.showHydrogens) return;
      if (atom.element !== 'C' || atom.alias?.trim() || atom.showElementLabel) return;
    }
    const maxValency = getEffectiveValencyForImplicitHydrogen(atom.element, atom.charge || 0);
    const implicitH = Math.max(0, maxValency - v);
    if (implicitH <= 0) return;
    if (
      !water &&
      R.condensedGroupLabels &&
      condensedGroupLabelForAtom(atom, R.renderedMolecule, v)
    ) {
      return;
    }
    const hCol = explicitHydrogenLabelColor(atom, {
      useElementColors: R.colorAtomLabels,
      defaultInk: R.structureTheme.ink,
      hydrogenInk: R.structureTheme.hydrogen,
    });
    ctx.strokeStyle = hCol;
    const dirs = getHydrogenStubDirections(atom, R.renderedMolecule, implicitH);
    const fonts = resolveAtomLabelFonts(P, atom.labelFontSizePt);
    const hFont = fonts.elementFontCss;
    ctx.font = hFont;
    const bondEnd = implicitHydrogenBondEnd(labelDist, ctx.measureText('H').width / 2);
    R.applyLabelUpright(atom.id, () => {
      for (const dir of dirs) {
        const x1 = atom.x + dir.x * bondEnd;
        const y1 = atom.y + dir.y * bondEnd;
        ctx.beginPath();
        ctx.moveTo(atom.x, atom.y);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        const hx = atom.x + dir.x * labelDist;
        const hy = atom.y + dir.y * labelDist;
        ctx.font = hFont;
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
  const colorOpts = {
    useElementColors: R.colorAtomLabels,
    defaultInk: R.structureTheme.ink,
    hydrogenInk: R.structureTheme.hydrogen,
  };

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  R.renderedMolecule.atoms.forEach(atom => {
    if (R.visibleAtomIds && !R.visibleAtomIds.has(atom.id)) return;
    // Explicit H atoms always label (real graph atoms). Implicit stubs use showHydrogens.

    ctx.save();
    ctx.globalAlpha = R.atomOpacityById?.get(atom.id) ?? 1;

    const fonts = resolveAtomLabelFonts(P, atom.labelFontSizePt);
    const EL_FONT = fonts.elementFontCss;
    const SUB_FONT = fonts.subFontCss;
    const ISO_FONT = fonts.isoFontCss;

    const currentValency = R.valencyMap.get(atom.id) || 0;
    const maxForImplicitH = getEffectiveValencyForImplicitHydrogen(atom.element, atom.charge || 0);
    const implicitH = Math.max(0, maxForImplicitH - currentValency);
    const isCarbon = atom.element === 'C';
    const charge = atom.charge || 0;
    const hasCharge = charge !== 0;
    const displayElement = getDisplayElement(atom.element, atom.isotope);
    const isotopeStr = getIsotopeString(atom.element, atom.isotope);

    /** Draw multi-glyph label with the bonding atom glyph centered on `atom` (ChemDraw-style). */
    const drawHeadAnchoredRuns = (rawLabel: string) => {
      const metrics = measureHeadAnchoredLabelSize(ctx, { ...P, ...fonts }, rawLabel, charge, {
        tailGoesLeft: hGoesLeft(atom, R.renderedMolecule),
        attachmentElement: atom.element,
      });
      if (!metrics.text) return;
      const runs = buildAliasDisplayRuns(metrics.text);
      const fills = formulaLabelCharFills(metrics.text, atom, colorOpts);
      let curX = atom.x + metrics.drawLeft;
      const baseY = atom.y;
      let fillIdx = 0;
      const drawEl = (text: string, font: string, dy = 0) => {
        ctx.font = font;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        for (const ch of text) {
          ctx.fillStyle = fills[fillIdx] ?? fills[fills.length - 1] ?? resolveAtomLabelColor(atom, colorOpts);
          ctx.fillText(ch, curX, baseY + dy);
          curX += ctx.measureText(ch).width;
          fillIdx += 1;
        }
      };
      for (const r of runs) {
        drawEl(r.text, r.kind === 'sub' ? SUB_FONT : EL_FONT, r.kind === 'sub' ? 5 : 0);
      }
      // Formal charges are drawn in `drawFormalCharges` (movable around the atom).
    };

    if (atom.alias?.trim()) {
      if (atom.id !== R.omitAtomAliasBodyId) {
        R.applyLabelUpright(atom.id, () => {
          drawHeadAnchoredRuns(atom.alias!.trim());
        });
      }
      ctx.restore();
      return;
    }

    if (R.condensedGroupLabels) {
      const condensed = condensedGroupLabelForAtom(atom, R.renderedMolecule, currentValency);
      if (condensed) {
        if (atom.id !== R.omitAtomAliasBodyId) {
          R.applyLabelUpright(atom.id, () => {
            drawHeadAnchoredRuns(condensed);
          });
        }
        ctx.restore();
        return;
      }
    }

    const forceElementLabel = Boolean(atom.showElementLabel);

    if (!forceElementLabel && isCarbon && R.showHydrogens && implicitH > 0 && !isotopeStr) {
      // Formal charge (if any) is drawn in `drawFormalCharges`.
      ctx.restore();
      return;
    }
    if (
      !forceElementLabel &&
      isCarbon &&
      R.showHydrogens &&
      implicitH === 0 &&
      atom.charge === 0 &&
      !isotopeStr
    ) {
      ctx.restore();
      return;
    }
    if (!forceElementLabel && isCarbon && R.showHydrogens && implicitH === 0 && hasCharge) {
      ctx.restore();
      return;
    }

    // Forced "C" draws like a heteroatom: C plus bonded H as linear CHₙ / HₙC.
    // Isolated water keeps angular H stubs instead of H₂O / H–OH.
    const numH = formulaImplicitHydrogenCount(
      atom,
      R.renderedMolecule,
      currentValency,
      R.showHydrogens,
    );

    const needsLabel =
      !isCarbon ||
      atom.charge !== 0 ||
      R.showHydrogens ||
      Boolean(isotopeStr) ||
      forceElementLabel;
    if (!needsLabel) {
      ctx.restore();
      return;
    }

    R.applyLabelUpright(atom.id, () => {
      const leftH = numH > 0 && carbonLabelHGoesLeft(atom, R.renderedMolecule);
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

      // Anchor the bonding atom glyph on the atom center; Hₙ / isotope extend away.
      // Formal charges are drawn separately so they can be dragged.
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
    });
    ctx.restore();
  });
};

/** Live offset from atom center while dragging (ring-clamped — no pull-back). */
export function chargeMarkDragPreview(
  R: RenderContext,
  atomId: string,
  kind: 'formal' | 'delta',
): ChargeMarkOffset | null {
  const d = R.dragAction;
  if (!d || d.type !== 'move_charge_mark' || d.atomId !== atomId || d.kind !== kind) return null;
  const atom = R.renderedMolecule.atoms.find(a => a.id === atomId);
  if (!atom) return null;
  const dragged =
    Math.hypot(d.currentX - d.startX, d.currentY - d.startY) > (d.placeDragThreshold ?? 1.5);
  if (!dragged) return null; // keep default / stored seat until the pointer moves
  // Orbit the atom: pointer position → vector from atom center → clamp to ring.
  return clampChargeMarkOffset(d.currentX - atom.x, d.currentY - atom.y);
}

/** Formal ± marks — parented to atom; offset/drag for fine adjust. */
export const drawFormalCharges = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const P = R.displayPrefs;
  const colorOpts = {
    useElementColors: R.colorAtomLabels,
    defaultInk: R.structureTheme.ink,
    hydrogenInk: R.structureTheme.hydrogen,
  };
  for (const atom of R.renderedMolecule.atoms) {
    if (R.visibleAtomIds && !R.visibleAtomIds.has(atom.id)) continue;
    const q = atom.charge ?? 0;
    if (!q) continue;
    const preview = chargeMarkDragPreview(R, atom.id, 'formal');
    const box = estimateChargeMarkAabb(atom, R.renderedMolecule, q, preview);
    if (!box) continue;
    const labelColor = resolveAtomLabelColor(atom, colorOpts);
    ctx.save();
    ctx.globalAlpha = R.atomOpacityById?.get(atom.id) ?? 1;
    R.applyLabelUpright(atom.id, () => {
      drawFormalChargeMark(
        ctx,
        (box.minX + box.maxX) / 2,
        (box.minY + box.maxY) / 2,
        q,
        labelColor,
        P,
        'center',
        q === 1 || q === -1 ? atom.chargeMarkStyle === 'circled' : false,
      );
    });
    ctx.restore();
  }
};

/** Full label left/right in upright-local coords so δ± clears Cl / OH / aliases. */
export function measureDeltaLabelExtents(
  ctx: CanvasRenderingContext2D,
  R: RenderContext,
  atom: Atom,
): DeltaChargeLabelExtents {
  const P = { ...R.displayPrefs, ...resolveAtomLabelFonts(R.displayPrefs, atom.labelFontSizePt) };
  const mol = R.renderedMolecule;
  const charge = atom.charge ?? 0;
  const bondSum = R.valencyMap.get(atom.id) || 0;

  if (atom.alias?.trim()) {
    const m = measureAliasLabelSize(ctx, P, atom, mol);
    return { left: m.left, right: m.right };
  }
  if (R.condensedGroupLabels) {
    const condensed = condensedGroupLabelForAtom(atom, mol, bondSum);
    if (condensed) {
      const m = measureHeadAnchoredLabelSize(ctx, P, condensed, charge, {
        tailGoesLeft: hGoesLeft(atom, mol),
        attachmentElement: atom.element,
      });
      return { left: m.left, right: m.right };
    }
  }

  const numH = formulaImplicitHydrogenCount(atom, mol, bondSum, R.showHydrogens);
  const displayElement = getDisplayElement(atom.element, atom.isotope);
  const isotopeStr = getIsotopeString(atom.element, atom.isotope);

  ctx.save();
  try {
    ctx.font = P.elementFontCss;
    const elW = ctx.measureText(displayElement).width;
    ctx.font = P.subFontCss;
    const hDigitW = numH > 1 ? ctx.measureText(String(numH)).width : 0;
    ctx.font = P.elementFontCss;
    const hW = numH > 0 ? ctx.measureText('H').width + hDigitW : 0;
    ctx.font = P.isoFontCss;
    const isoW = isotopeStr ? ctx.measureText(isotopeStr).width : 0;
    const qW = charge !== 0 ? FORMAL_CHARGE_MARK_W : 0;
    const leftH = numH > 0 && carbonLabelHGoesLeft(atom, mol);
    const chargeLeft = charge !== 0 && chargeGoesLeft(atom, mol);

    // Match drawAtomLabels flow: [qL][iso][HL][El][HR][qR]
    let left = -elW / 2;
    let right = elW / 2;
    if (isotopeStr) left -= isoW;
    if (leftH) left -= hW;
    else right += hW;
    if (chargeLeft) left -= qW + 2;
    else if (charge !== 0) right += qW + 2;
    return { left, right };
  } finally {
    ctx.restore();
  }
}

/** Partial-charge δ± marks — placed past the label on the free side. */
export const drawDeltaCharges = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const P = R.displayPrefs;
  const colorOpts = {
    useElementColors: R.colorAtomLabels,
    defaultInk: R.structureTheme.ink,
    hydrogenInk: R.structureTheme.hydrogen,
  };
  for (const atom of R.renderedMolecule.atoms) {
    if (R.visibleAtomIds && !R.visibleAtomIds.has(atom.id)) continue;
    const dq = atom.deltaCharge ?? 0;
    if (!dq) continue;
    const extents = measureDeltaLabelExtents(ctx, R, atom);
    const preview = chargeMarkDragPreview(R, atom.id, 'delta');
    const box = deltaChargeMarkBox(atom, R.renderedMolecule, dq, extents, preview);
    if (!box) continue;
    const labelColor = resolveAtomLabelColor(atom, colorOpts);
    ctx.save();
    ctx.globalAlpha = R.atomOpacityById?.get(atom.id) ?? 1;
    R.applyLabelUpright(atom.id, () => {
      drawDeltaChargeMark(ctx, box.cx, box.cy, dq, labelColor, P, 'center');
    });
    ctx.restore();
  }
};

/** Highlight selected formal / partial-charge marks (Delete clears them). */
export const drawSelectedChargeMarks = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const ids = R.selectedChargeAtomIds;
  if (!ids?.length) return;
  const set = new Set(ids);
  for (const atom of R.renderedMolecule.atoms) {
    if (!set.has(atom.id)) continue;
    const dq = atom.deltaCharge ?? 0;
    const q = atom.charge ?? 0;
    const deltaExtents = dq ? measureDeltaLabelExtents(ctx, R, atom) : null;
    const boxes = [
      estimateChargeMarkAabb(
        atom,
        R.renderedMolecule,
        q,
        chargeMarkDragPreview(R, atom.id, 'formal'),
      ),
      estimateDeltaChargeMarkAabb(
        atom,
        R.renderedMolecule,
        dq,
        deltaExtents,
        chargeMarkDragPreview(R, atom.id, 'delta'),
      ),
    ].filter(Boolean) as Array<{ minX: number; maxX: number; minY: number; maxY: number }>;
    if (!boxes.length) continue;
    R.applyLabelUpright(atom.id, () => {
      for (const box of boxes) {
        ctx.save();
        ctx.strokeStyle = R.structureTheme.transformAccent ?? '#2dd4bf';
        ctx.fillStyle = 'rgba(45, 212, 191, 0.14)';
        ctx.lineWidth = 1.5;
        const pad = 3;
        ctx.beginPath();
        ctx.rect(
          box.minX - pad,
          box.minY - pad,
          box.maxX - box.minX + pad * 2,
          box.maxY - box.minY + pad * 2,
        );
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    });
  }
};

/** Two dots per lone pair — stay on the bonding atom (O), not on the H tail. */
export const drawLonePairs = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  R.renderedMolecule.atoms.forEach(atom => {
    const lp = Math.max(0, atom.lonePairs ?? 0);
    const radical = Math.max(0, atom.radical ?? 0) > 0 ? 1 : 0;
    if (lp <= 0 && radical <= 0) return;
    const layout = resolveLonePairLabelLayout(ctx, R, atom);
    const placements = getLonePairPlacements(atom, R.renderedMolecule, lp, {
      headBox: layout.headBox,
      labelTailLocal: layout.labelTailLocal,
      labelCounterRad: R.labelCounterRad,
      preferSide: atom.lonePairSide ?? 'above',
    });
    const dotColor = resolveAtomLabelColor(atom, {
      useElementColors: R.colorAtomLabels,
      defaultInk: R.structureTheme.ink,
      hydrogenInk: R.structureTheme.hydrogen,
    });
    const sep = LONE_PAIR_DOT_SEP_PX;
    const r = LONE_PAIR_DOT_R_PX;
    R.applyLabelUpright(atom.id, () => {
      ctx.fillStyle = dotColor;
      for (let i = 0; i < lp; i++) {
        const p = placements[i];
        if (!p) continue;
        const cx = atom.x + p.dir.x * p.dist;
        const cy = atom.y + p.dir.y * p.dist;
        const nx = -p.dir.y;
        const ny = p.dir.x;
        ctx.beginPath();
        ctx.arc(cx + nx * sep, cy + ny * sep, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx - nx * sep, cy - ny * sep, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Free radical: always above the atom with a larger clear gap.
      if (radical > 0) {
        ctx.beginPath();
        ctx.arc(atom.x, atom.y - RADICAL_DIST_PX, RADICAL_DOT_R_PX, 0, Math.PI * 2);
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
  const P = { ...R.displayPrefs, ...resolveAtomLabelFonts(R.displayPrefs, atom.labelFontSizePt) };
  const mol = R.renderedMolecule;
  const charge = atom.charge ?? 0;

  const fromHeadAnchored = (m: {
    w: number;
    h: number;
    left: number;
    headRight: number;
    hasTail: boolean;
    tailGoesLeft?: boolean;
  }): LonePairLabelLayout => {
    if (m.w < 2) return { headBox: null, labelTailLocal: null };
    return {
      // Alias metrics add ~10px for bond trim; lone-pair keep-out uses the glyph.
      headBox: labelBoxFromExtents(m.left, m.headRight, Math.max(10, m.h - 10)),
      labelTailLocal: m.hasTail
        ? m.tailGoesLeft
          ? { x: -1, y: 0 }
          : { x: 1, y: 0 }
        : null,
    };
  };

  if (atom.alias?.trim()) {
    return fromHeadAnchored(measureAliasLabelSize(ctx, P, atom, mol));
  }

  const currentValency = R.valencyMap.get(atom.id) || 0;
  if (R.condensedGroupLabels) {
    const condensed = condensedGroupLabelForAtom(atom, mol, currentValency);
    if (condensed) {
      return fromHeadAnchored(
        measureHeadAnchoredLabelSize(ctx, P, condensed, charge, {
          tailGoesLeft: hGoesLeft(atom, mol),
          attachmentElement: atom.element,
        }),
      );
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
  const forceElementLabel = Boolean(atom.showElementLabel);
  const numH = formulaImplicitHydrogenCount(atom, mol, bondOrderSum, showHydrogens);
  const displayElement = getDisplayElement(atom.element, atom.isotope);
  const isotopeStr = getIsotopeString(atom.element, atom.isotope);
  const hasCharge = (atom.charge ?? 0) !== 0;

  if (isCarbon && !isotopeStr && !hasCharge && numH === 0 && !forceElementLabel) {
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

    const leftH = numH > 0 && carbonLabelHGoesLeft(atom, mol);
    let left = -elW / 2;
    const headRight = elW / 2;
    if (isotopeStr) left -= isoW;

    const m = ctx.measureText(displayElement || 'O');
    const asc = m.actualBoundingBoxAscent ?? 0;
    const desc = m.actualBoundingBoxDescent ?? 0;
    const h = (asc + desc || 14) + 1;

    let labelTailLocal: { x: number; y: number } | null = null;
    if (numH > 0 || hasCharge) {
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
