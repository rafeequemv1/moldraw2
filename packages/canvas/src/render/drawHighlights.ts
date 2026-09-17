/**
 * Selection wash (behind the molecule) + hover as a thin teal outline (overlay).
 *
 * Painted as one opaque mask on an offscreen canvas, then tinted, so overlapping
 * bonds / labels do not stack into darker blobs. Ring interiors are filled in
 * selection mode so a whole molecule reads as one silhouette.
 */
import { getEffectiveValencyForImplicitHydrogen } from '@moldraw/domain';
import {
  getHydrogenStubDirections,
  getSmallestCycleAtomIds,
  implicitHydrogenLabelDist,
} from '../geometry';
import { PLACE_FRAGMENT_TOOL_ID } from '@moldraw/core';
import {
  ballStickAtomRadius,
  ballStickSelectionAtomRadius,
  ballStickSelectionBondWidth,
} from '../themes/ballStick/draw';
import { isFragmentPlacementSnapValid } from './drawFragmentPlacementGhost';
import { atomLabelHighlightBox, fillRoundRect } from './atomLabelHighlightBox';
import { safeDrawImage } from './safeDrawImage';
import type { RenderContext } from './types';
import { canvasBackingDpr } from '../geometry';

const HOVER_OUTLINE = 'rgba(45, 212, 191, 1)';
/** Hover ring thickness in CSS pixels (world = css / zoom). */
const HOVER_OUTLINE_CSS_PX = 1.35;
const HIGHLIGHT_MAX_EDGE = 4096;

/** Halo diameter around atoms / bonds — large enough to read as a circle at vertices. */
const skeletonWidth = (R: RenderContext): number => {
  const t = R.displayPrefs.bondThicknessPx;
  return Math.max(14, t * 2.8 + 8);
};

const highlightZoom = (R: RenderContext): number =>
  Math.max(1e-6, R.viewport.zoom * (R.displayScale || 1));

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
      const hDist = implicitHydrogenLabelDist(R.displayPrefs.bondLengthPx);
      for (const dir of getHydrogenStubDirections(atom, R.renderedMolecule, implicitH)) {
        grow(atom.x + dir.x * hDist, atom.y + dir.y * hDist, pad);
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
      const hDist = implicitHydrogenLabelDist(R.displayPrefs.bondLengthPx);
      for (const dir of getHydrogenStubDirections(atom, R.renderedMolecule, implicitH)) {
        offCtx.beginPath();
        offCtx.moveTo(atom.x, atom.y);
        offCtx.lineTo(atom.x + dir.x * hDist, atom.y + dir.y * hDist);
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
  const z = highlightZoom(R);
  const ring = mode === 'outline' ? HOVER_OUTLINE_CSS_PX / z : 0;
  const outer = mode === 'outline' ? inner + ring * 2 : inner;
  const bounds = expandBounds(idSet, R, ctx, outer);
  if (!bounds) return;

  const padding = outer + 6;
  const worldW = bounds.maxX - bounds.minX + padding * 2;
  const worldH = bounds.maxY - bounds.minY + padding * 2;
  if (!(worldW >= 1 && worldH >= 1)) return;

  let scale = Math.max(1, canvasBackingDpr(ctx.canvas) * z);
  const cap = Math.max(worldW, worldH, 1);
  if (cap * scale > HIGHLIGHT_MAX_EDGE) scale = Math.max(1, HIGHLIGHT_MAX_EDGE / cap);

  const pxW = Math.max(1, Math.ceil(worldW * scale));
  const pxH = Math.max(1, Math.ceil(worldH * scale));
  offCanvas.width = pxW;
  offCanvas.height = pxH;
  if (offCanvas.width < 1 || offCanvas.height < 1) return;
  offCtx.setTransform(1, 0, 0, 1, 0, 0);
  offCtx.clearRect(0, 0, pxW, pxH);
  offCtx.setTransform(scale, 0, 0, scale, 0, 0);
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

  tintMask(offCtx, pxW, pxH, color);
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  safeDrawImage(ctx, offCanvas, bounds.minX - padding, bounds.minY - padding, worldW, worldH);
  ctx.imageSmoothingEnabled = prevSmooth;
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
    theme.selectionFill ?? 'rgba(45, 212, 191, 0.36)',
    'fill',
    extraBonds.size ? extraBonds : undefined,
  );
};

/** Thin teal outline on hover (overlay, above the molecule). */
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
      ctx.lineWidth = placingFragment ? 1.5 / highlightZoom(R) : HOVER_OUTLINE_CSS_PX / highlightZoom(R);
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

/**
 * Octet / valence warning. Drawing never blocks on valency, so an over-filled
 * atom (C with five bonds, N with four neutral bonds, …) gets a soft red-orange
 * ring plus a small "+n" badge for the bond-order surplus. Purely visual — the
 * structure is left exactly as the user drew it (no auto-fix, no kekulize).
 */
export const drawOverValentMarkers = (
  ctx: CanvasRenderingContext2D,
  R: RenderContext,
): void => {
  const over = R.overValentAtoms;
  if (!over || over.size === 0) return;
  const z = R.viewport.zoom || 1;
  const ballStick = (R.structureDrawMode ?? 'skeletal') === 'ball-stick';
  // Constant on-screen size so the ring reads the same at any zoom; in
  // ball-and-stick sit just outside the sphere so the sphere can't hide it.
  const lw = 1.75 / z;
  const badgeR = 8 / z;
  ctx.save();
  for (const [id, surplus] of over) {
    if (id === R.errorAtomId) continue;
    const at = R.renderedMolecule.atoms.find(a => a.id === id);
    if (!at) continue;
    const radius = ballStick
      ? Math.max(15 / z, ballStickAtomRadius(R, at.element) * 1.25 + 3 / z)
      : 15 / z;
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(249, 115, 22, 0.14)';
    ctx.strokeStyle = 'rgba(234, 88, 12, 0.9)';
    ctx.lineWidth = lw;
    ctx.setLineDash([3 / z, 2.5 / z]);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    // "+n" badge at the upper-right of the ring.
    const bx = at.x + radius * 0.85;
    const by = at.y - radius * 0.85;
    ctx.beginPath();
    ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = '#ea580c';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${10 / z}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`+${surplus}`, bx, by + 0.3 / z);
  }
  ctx.restore();
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
