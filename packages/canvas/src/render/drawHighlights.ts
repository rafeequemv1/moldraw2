/**
 * Selection wash (behind the molecule) + hover as a thin blue outline (overlay).
 *
 * Painted as one opaque mask on an offscreen canvas, then tinted, so overlapping
 * bonds / labels do not stack into darker blobs. Ring interiors are filled in
 * selection mode so a whole molecule reads as one silhouette.
 */
import { getEffectiveValencyForImplicitHydrogen } from '@moldraw/domain';
import {
  getHydrogenStubDirections,
  getSmallestCycleAtomIds,
  IMPLICIT_H_LABEL_DIST,
} from '../geometry';
import { PLACE_FRAGMENT_TOOL_ID } from '@moldraw/core';
import {
  ballStickSelectionAtomRadius,
  ballStickSelectionBondWidth,
} from '../themes/ballStick/draw';
import { isFragmentPlacementSnapValid } from './drawFragmentPlacementGhost';
import { atomLabelHighlightBox, fillRoundRect } from './atomLabelHighlightBox';
import { safeDrawImage } from './safeDrawImage';
import type { RenderContext } from './types';

const HOVER_OUTLINE = 'rgba(14, 165, 233, 1)';
/** Screen-px ring thickness (world space at zoom 1). */
const HOVER_OUTLINE_WIDTH = 2.2;

/** Halo diameter around atoms / bonds — large enough to read as a circle at vertices. */
const skeletonWidth = (R: RenderContext): number => {
  const t = R.displayPrefs.bondThicknessPx;
  return Math.max(18, t * 3.6 + 11);
};

const labelCounterRadFor = (atomId: string, R: RenderContext): number =>
  R.selectedAtomIds.includes(atomId) && Math.abs(R.labelCounterRad) > 1e-5
    ? R.labelCounterRad
    : 0;

const withLabelUpright = (
  ctx: CanvasRenderingContext2D,
  atomId: string,
  R: RenderContext,
  draw: () => void,
): void => {
  const rad = labelCounterRadFor(atomId, R);
  const at = R.atomById.get(atomId);
  if (!rad || !at) {
    draw();
    return;
  }
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(-rad);
  ctx.translate(-at.x, -at.y);
  draw();
  ctx.restore();
};

const isBallStick = (R: RenderContext): boolean =>
  (R.structureDrawMode ?? 'skeletal') === 'ball-stick';

const expandBounds = (
  atomIds: ReadonlySet<string>,
  R: RenderContext,
  measureCtx: CanvasRenderingContext2D,
  pad: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number, r: number) => {
    if (x - r < minX) minX = x - r;
    if (x + r > maxX) maxX = x + r;
    if (y - r < minY) minY = y - r;
    if (y + r > maxY) maxY = y + r;
  };
  const growRect = (x: number, y: number, w: number, h: number, p: number) => {
    if (x - p < minX) minX = x - p;
    if (y - p < minY) minY = y - p;
    if (x + w + p > maxX) maxX = x + w + p;
    if (y + h + p > maxY) maxY = y + h + p;
  };
  for (const atom of R.renderedMolecule.atoms) {
    if (!atomIds.has(atom.id)) continue;
    const atomR = isBallStick(R) ? ballStickSelectionAtomRadius(R, atom.element) : pad;
    grow(atom.x, atom.y, Math.max(pad, atomR));
    if (isBallStick(R)) continue;
    const glyphBox = atomLabelHighlightBox(measureCtx, atom, R);
    if (glyphBox) growRect(glyphBox.x, glyphBox.y, glyphBox.w, glyphBox.h, pad);
  }
  if (R.showHydrogens) {
    for (const atom of R.renderedMolecule.atoms) {
      if (!atomIds.has(atom.id) || atom.element !== 'C' || atom.alias?.trim() || atom.showElementLabel) {
        continue;
      }
      const v = R.valencyMap.get(atom.id) || 0;
      const maxV = getEffectiveValencyForImplicitHydrogen(atom.element, atom.charge || 0);
      const implicitH = Math.max(0, maxV - v);
      if (implicitH <= 0) continue;
      for (const dir of getHydrogenStubDirections(atom, R.renderedMolecule, implicitH)) {
        grow(
          atom.x + dir.x * IMPLICIT_H_LABEL_DIST,
          atom.y + dir.y * IMPLICIT_H_LABEL_DIST,
          pad,
        );
      }
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
};

const fillSelectedRings = (
  offCtx: CanvasRenderingContext2D,
  atomIds: ReadonlySet<string>,
  R: RenderContext,
): void => {
  const seen = new Set<string>();
  for (const bond of R.renderedMolecule.bonds) {
    const ids =
      R.ringAtomIdsByBondId.get(bond.id) ?? getSmallestCycleAtomIds(bond, R.renderedMolecule);
    if (!ids || ids.length < 3) continue;
    if (!ids.every(id => atomIds.has(id))) continue;
    const key = [...ids].sort().join('\0');
    if (seen.has(key)) continue;
    seen.add(key);
    const first = R.atomById.get(ids[0]);
    if (!first) continue;
    offCtx.beginPath();
    offCtx.moveTo(first.x, first.y);
    for (let i = 1; i < ids.length; i++) {
      const a = R.atomById.get(ids[i]);
      if (a) offCtx.lineTo(a.x, a.y);
    }
    offCtx.closePath();
    offCtx.fill();
  }
};

const paintBallStickSkeleton = (
  offCtx: CanvasRenderingContext2D,
  atomIds: ReadonlySet<string>,
  R: RenderContext,
  outset: number,
  extraBondIds?: ReadonlySet<string>,
  fillRings = false,
): void => {
  if (fillRings) fillSelectedRings(offCtx, atomIds, R);
  offCtx.lineCap = 'round';
  offCtx.lineJoin = 'round';
  offCtx.strokeStyle = '#000';
  offCtx.fillStyle = '#000';

  for (const bond of R.renderedMolecule.bonds) {
    const both = atomIds.has(bond.fromAtomId) && atomIds.has(bond.toAtomId);
    const extra = extraBondIds?.has(bond.id) ?? false;
    if (!both && !extra) continue;
    const from = R.atomById.get(bond.fromAtomId);
    const to = R.atomById.get(bond.toAtomId);
    if (!from || !to) continue;
    offCtx.lineWidth = ballStickSelectionBondWidth(R, bond) + outset * 2;
    offCtx.beginPath();
    offCtx.moveTo(from.x, from.y);
    offCtx.lineTo(to.x, to.y);
    offCtx.stroke();
  }

  for (const atom of R.renderedMolecule.atoms) {
    if (!atomIds.has(atom.id)) continue;
    const r = ballStickSelectionAtomRadius(R, atom.element) + outset;
    offCtx.beginPath();
    offCtx.arc(atom.x, atom.y, r, 0, Math.PI * 2);
    offCtx.fill();
  }
};

const paintSkeleton = (
  offCtx: CanvasRenderingContext2D,
  measureCtx: CanvasRenderingContext2D,
  atomIds: ReadonlySet<string>,
  R: RenderContext,
  width: number,
  extraBondIds?: ReadonlySet<string>,
  labelOutset = 0,
  fillRings = false,
  includeLabels = true,
): void => {
  const r = width / 2;
  const labeled = new Set<string>();
  for (const atom of R.renderedMolecule.atoms) {
    if (!atomIds.has(atom.id)) continue;
    if (atomLabelHighlightBox(measureCtx, atom, R)) labeled.add(atom.id);
  }

  if (fillRings) fillSelectedRings(offCtx, atomIds, R);

  // Round, untrimmed sausages from atom centers so adjacent selected bonds
  // union into one continuous silhouette (no gaps at vertices).
  offCtx.lineCap = 'round';
  offCtx.lineJoin = 'round';
  offCtx.lineWidth = width;

  for (const bond of R.renderedMolecule.bonds) {
    const both = atomIds.has(bond.fromAtomId) && atomIds.has(bond.toAtomId);
    const extra = extraBondIds?.has(bond.id) ?? false;
    if (!both && !extra) continue;
    const from = R.atomById.get(bond.fromAtomId) ?? R.renderedMolecule.atoms.find(a => a.id === bond.fromAtomId);
    const to = R.atomById.get(bond.toAtomId) ?? R.renderedMolecule.atoms.find(a => a.id === bond.toAtomId);
    if (!from || !to) continue;
    offCtx.beginPath();
    offCtx.moveTo(from.x, from.y);
    offCtx.lineTo(to.x, to.y);
    offCtx.stroke();
  }

  if (R.showHydrogens) {
    for (const atom of R.renderedMolecule.atoms) {
      if (!atomIds.has(atom.id) || atom.element !== 'C' || atom.alias?.trim() || atom.showElementLabel) {
        continue;
      }
      const v = R.valencyMap.get(atom.id) || 0;
      const maxV = getEffectiveValencyForImplicitHydrogen(atom.element, atom.charge || 0);
      const implicitH = Math.max(0, maxV - v);
      if (implicitH <= 0) continue;
      for (const dir of getHydrogenStubDirections(atom, R.renderedMolecule, implicitH)) {
        offCtx.beginPath();
        offCtx.moveTo(atom.x, atom.y);
        offCtx.lineTo(
          atom.x + dir.x * IMPLICIT_H_LABEL_DIST,
          atom.y + dir.y * IMPLICIT_H_LABEL_DIST,
        );
        offCtx.stroke();
      }
    }
  }

  offCtx.fillStyle = '#000';
  for (const atom of R.renderedMolecule.atoms) {
    if (!atomIds.has(atom.id) || labeled.has(atom.id)) continue;
    offCtx.beginPath();
    offCtx.arc(atom.x, atom.y, r, 0, Math.PI * 2);
    offCtx.fill();
  }

  if (!includeLabels) return;
  for (const atom of R.renderedMolecule.atoms) {
    if (!atomIds.has(atom.id)) continue;
    const glyphBox = atomLabelHighlightBox(measureCtx, atom, R);
    if (!glyphBox) continue;
    withLabelUpright(offCtx, atom.id, R, () => {
      fillRoundRect(
        offCtx,
        glyphBox.x - labelOutset,
        glyphBox.y - labelOutset,
        glyphBox.w + labelOutset * 2,
        glyphBox.h + labelOutset * 2,
        (glyphBox.h + labelOutset * 2) / 2,
      );
    });
  }
};

const tintMask = (
  offCtx: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
): void => {
  offCtx.setTransform(1, 0, 0, 1, 0, 0);
  offCtx.globalCompositeOperation = 'source-in';
  offCtx.fillStyle = color;
  offCtx.fillRect(0, 0, w, h);
  offCtx.globalCompositeOperation = 'source-over';
};

const blitHighlight = (
  ctx: CanvasRenderingContext2D,
  R: RenderContext,
  atomIds: string[],
  color: string,
  mode: 'fill' | 'outline',
  extraBondIds?: ReadonlySet<string>,
): void => {
  if (atomIds.length === 0 && !extraBondIds?.size) return;
  const offCanvas = R.offscreenCanvas;
  const offCtx = offCanvas?.getContext('2d');
  if (!offCanvas || !offCtx) return;

  const idSet = new Set(atomIds);
  if (extraBondIds) {
    for (const bond of R.renderedMolecule.bonds) {
      if (!extraBondIds.has(bond.id)) continue;
      idSet.add(bond.fromAtomId);
      idSet.add(bond.toAtomId);
    }
  }

  const inner = skeletonWidth(R);
  const ring = HOVER_OUTLINE_WIDTH;
  const outer = mode === 'outline' ? inner + ring * 2 : inner;
  const bounds = expandBounds(idSet, R, ctx, outer);
  if (!bounds) return;

  const padding = outer + 6;
  const w = Math.ceil(bounds.maxX - bounds.minX + padding * 2);
  const h = Math.ceil(bounds.maxY - bounds.minY + padding * 2);
  // Canvas width/height truncate to integers; sub-pixel sizes become 0 and
  // the later drawImage throws InvalidStateError (white-screens the SPA).
  if (!(w >= 1 && h >= 1)) return;

  offCanvas.width = w;
  offCanvas.height = h;
  if (offCanvas.width < 1 || offCanvas.height < 1) return;
  offCtx.setTransform(1, 0, 0, 1, 0, 0);
  offCtx.clearRect(0, 0, w, h);
  offCtx.translate(-bounds.minX + padding, -bounds.minY + padding);
  offCtx.strokeStyle = '#000';
  offCtx.fillStyle = '#000';

  const ball = isBallStick(R);
  if (mode === 'outline') {
    if (ball) {
      paintBallStickSkeleton(offCtx, idSet, R, ring, extraBondIds, false);
      offCtx.globalCompositeOperation = 'destination-out';
      paintBallStickSkeleton(offCtx, idSet, R, 0, extraBondIds, false);
      offCtx.globalCompositeOperation = 'source-over';
    } else {
      paintSkeleton(offCtx, ctx, idSet, R, outer, extraBondIds, ring, false, true);
      offCtx.globalCompositeOperation = 'destination-out';
      paintSkeleton(offCtx, ctx, idSet, R, inner, extraBondIds, 0, false, true);
      offCtx.globalCompositeOperation = 'source-over';
    }
  } else if (ball) {
    paintBallStickSkeleton(offCtx, idSet, R, 0, extraBondIds, true);
  } else {
    paintSkeleton(offCtx, ctx, idSet, R, outer, extraBondIds, 0, true, true);
  }

  tintMask(offCtx, w, h, color);
  safeDrawImage(ctx, offCanvas, bounds.minX - padding, bounds.minY - padding);
};

/** Opaque wash under bonds/labels — call before `paintStructureLayers`. */
export const drawSelectionFillBehind = (
  ctx: CanvasRenderingContext2D,
  R: RenderContext,
): void => {
  const theme = R.structureTheme;
  const parentSeedIds = (R.renderedMolecule.instanceArrays ?? []).flatMap(a => [
    ...a.seedAtomIds,
    ...(a.dendrimer?.coreAtomIds ?? []),
  ]);
  if (parentSeedIds.length > 0) {
    blitHighlight(ctx, R, parentSeedIds, 'rgba(251, 191, 36, 0.42)', 'fill');
  }
  const extraBonds = new Set(
    R.selectedBondIds.filter(
      id => {
        const b = R.renderedMolecule.bonds.find(x => x.id === id);
        if (!b) return false;
        return !(R.selectedAtomIds.includes(b.fromAtomId) && R.selectedAtomIds.includes(b.toAtomId));
      },
    ),
  );
  blitHighlight(
    ctx,
    R,
    R.selectedAtomIds,
    theme.selectionFill ?? 'rgba(59, 130, 246, 0.28)',
    'fill',
    extraBonds.size ? extraBonds : undefined,
  );
};

/** Thin blue outline on hover (overlay, above the molecule). */
export const drawHoverOutlineAndToolHints = (
  ctx: CanvasRenderingContext2D,
  R: RenderContext,
): void => {
  const selectedSet = new Set(R.selectedAtomIds);
  const hoveredFragment = R.hoveredComponentIds;
  const hoverTouchesSelection = hoveredFragment.some(id => selectedSet.has(id));
  if (hoveredFragment.length > 0 && !hoverTouchesSelection) {
    blitHighlight(
      ctx,
      R,
      hoveredFragment,
      R.structureTheme.selectionHoverStroke ?? HOVER_OUTLINE,
      'outline',
    );
  }

  if (R.hoveredAtomCircleId) {
    const a = R.renderedMolecule.atoms.find(x => x.id === R.hoveredAtomCircleId);
    const coveredByOutline =
      hoveredFragment.includes(a?.id ?? '') && !hoverTouchesSelection;
    if (a && !coveredByOutline && !selectedSet.has(a.id)) {
      const placingFragment = R.activeTool === PLACE_FRAGMENT_TOOL_ID;
      const snapValid = !placingFragment || isFragmentPlacementSnapValid(R);
      ctx.save();
      ctx.strokeStyle = placingFragment
        ? snapValid
          ? 'rgba(37, 99, 235, 0.85)'
          : 'rgba(202, 138, 4, 0.85)'
        : HOVER_OUTLINE;
      ctx.lineWidth = placingFragment ? 1.8 : 2.2;
      ctx.beginPath();
      ctx.arc(a.x, a.y, placingFragment ? 14 : 11, 0, Math.PI * 2);
      ctx.stroke();
      if (placingFragment) {
        ctx.fillStyle = snapValid ? 'rgba(37, 99, 235, 0.12)' : 'rgba(234, 179, 8, 0.14)';
        ctx.fill();
      }
      ctx.restore();
    }
  }

  if (R.hoveredBondHighlightId && R.hoveredComponentIds.length === 0) {
    const b = R.renderedMolecule.bonds.find(x => x.id === R.hoveredBondHighlightId);
    if (b && !selectedSet.has(b.fromAtomId) && !selectedSet.has(b.toAtomId)) {
      blitHighlight(
        ctx,
        R,
        [],
        R.structureTheme.selectionHoverStroke ?? HOVER_OUTLINE,
        'outline',
        new Set([R.hoveredBondHighlightId]),
      );
    }
  }
};

/** @deprecated Overlay path — hover outline only. Selection fill is behind the molecule. */
export const drawSelectionAndHoverHighlights = drawHoverOutlineAndToolHints;

/** Brief red circle around the offending atom when valency would be exceeded. */
export const drawErrorAtomMarker = (
  ctx: CanvasRenderingContext2D,
  R: RenderContext,
): void => {
  if (!R.errorAtomId) return;
  const errorAtom = R.renderedMolecule.atoms.find(a => a.id === R.errorAtomId);
  if (!errorAtom) return;
  ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(errorAtom.x, errorAtom.y, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
};

/** Amber indicator for stereochemistry warnings (does not hide structures). */
export const drawStereoWarningMarkers = (
  ctx: CanvasRenderingContext2D,
  R: RenderContext,
): void => {
  const ids = R.stereoWarningAtomIds;
  if (!ids.size) return;
  ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
  ctx.strokeStyle = 'rgba(217, 119, 6, 0.85)';
  ctx.lineWidth = 2;
  for (const id of ids) {
    if (id === R.errorAtomId) continue;
    const at = R.renderedMolecule.atoms.find(a => a.id === id);
    if (!at) continue;
    ctx.beginPath();
    ctx.arc(at.x, at.y, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
};
