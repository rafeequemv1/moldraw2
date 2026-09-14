/**
 * Selection halo (offscreen-composited) + soft hover indicators + the brief
 * red "valency exceeded" indicator. These run BEFORE bond/atom drawing so the
 * highlight sits underneath everything else.
 */
import { getEffectiveValencyForImplicitHydrogen } from '@moldraw/domain';
import {
  bondEndPoints,
  getHydrogenStubDirections,
  IMPLICIT_H_LABEL_DIST,
  type BondTrimContext,
} from '../geometry';
import { PLACE_FRAGMENT_TOOL_ID } from '@moldraw/core/molecule/fragmentPlacement';
import { isFragmentPlacementSnapValid } from './drawFragmentPlacementGhost';
import type { RenderContext } from './types';

export const drawSelectionAndHoverHighlights = (
  ctx: CanvasRenderingContext2D,
  R: RenderContext,
): void => {
  const labelRadForAtom = (atomId: string) =>
    R.selectedAtomIds.includes(atomId) && Math.abs(R.labelCounterRad) > 1e-5
      ? R.labelCounterRad
      : 0;

  const offCanvas = R.offscreenCanvas;
  if (offCanvas) {
    const offCtx = offCanvas.getContext('2d');
    if (offCtx) {
      const drawMoleculeHighlight = (atomIds: string[], style: 'hover' | 'selected') => {
        if (atomIds.length === 0) return;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        R.renderedMolecule.atoms.forEach(a => {
          if (atomIds.includes(a.id)) {
            if (a.x < minX) minX = a.x;
            if (a.x > maxX) maxX = a.x;
            if (a.y < minY) minY = a.y;
            if (a.y > maxY) maxY = a.y;
          }
        });

        if (R.showHydrogens) {
          R.renderedMolecule.atoms.forEach(atom => {
            if (!atomIds.includes(atom.id) || atom.element !== 'C' || atom.alias?.trim()) return;
            const v = R.valencyMap.get(atom.id) || 0;
            const maxV = getEffectiveValencyForImplicitHydrogen(atom.element, atom.charge || 0);
            const implicitH = Math.max(0, maxV - v);
            if (implicitH <= 0) return;
            const dirs = getHydrogenStubDirections(atom, R.renderedMolecule, implicitH);
            const pad = 12;
            for (const dir of dirs) {
              const hx = atom.x + dir.x * IMPLICIT_H_LABEL_DIST;
              const hy = atom.y + dir.y * IMPLICIT_H_LABEL_DIST;
              if (hx - pad < minX) minX = hx - pad;
              if (hx + pad > maxX) maxX = hx + pad;
              if (hy - pad < minY) minY = hy - pad;
              if (hy + pad > maxY) maxY = hy + pad;
            }
          });
        }

        const padding = 18;
        const w = maxX - minX + padding * 2;
        const h = maxY - minY + padding * 2;
        if (!(w > 0 && h > 0)) return;

        offCanvas.width = w;
        offCanvas.height = h;

        offCtx.translate(-minX + padding, -minY + padding);
        offCtx.lineCap = 'round';
        offCtx.lineJoin = 'round';

        const bondTrimOff: BondTrimContext = {
          ctx: offCtx,
          displayPrefs: R.displayPrefs,
          labelRadForAtom,
          condensedGroupLabels: R.condensedGroupLabels,
          molecule: R.renderedMolecule,
          valencyMap: R.valencyMap,
        };

        const highlightPath = new Path2D();
        let hasPath = false;

        R.renderedMolecule.bonds.forEach(bond => {
          if (atomIds.includes(bond.fromAtomId) && atomIds.includes(bond.toAtomId)) {
            const from = R.renderedMolecule.atoms.find(a => a.id === bond.fromAtomId);
            const to = R.renderedMolecule.atoms.find(a => a.id === bond.toAtomId);
            if (from && to) {
              const T = bondEndPoints(from, to, bondTrimOff);
              highlightPath.moveTo(T.ax, T.ay);
              highlightPath.lineTo(T.bx, T.by);
              hasPath = true;
            }
          }
        });

        R.renderedMolecule.atoms.forEach(atom => {
          if (atomIds.includes(atom.id)) {
            const hasActiveBond = R.renderedMolecule.bonds.some(
              b =>
                (b.fromAtomId === atom.id && atomIds.includes(b.toAtomId)) ||
                (b.toAtomId === atom.id && atomIds.includes(b.fromAtomId)),
            );
            if (!hasActiveBond) {
              highlightPath.moveTo(atom.x, atom.y);
              highlightPath.lineTo(atom.x + 0.1, atom.y);
              hasPath = true;
            }
          }
        });

        if (R.showHydrogens) {
          R.renderedMolecule.atoms.forEach(atom => {
            if (!atomIds.includes(atom.id) || atom.element !== 'C' || atom.alias?.trim()) return;
            const v = R.valencyMap.get(atom.id) || 0;
            const maxV = getEffectiveValencyForImplicitHydrogen(atom.element, atom.charge || 0);
            const implicitH = Math.max(0, maxV - v);
            if (implicitH <= 0) return;
            const dirs = getHydrogenStubDirections(atom, R.renderedMolecule, implicitH);
            for (const dir of dirs) {
              const hx = atom.x + dir.x * IMPLICIT_H_LABEL_DIST;
              const hy = atom.y + dir.y * IMPLICIT_H_LABEL_DIST;
              highlightPath.moveTo(atom.x, atom.y);
              highlightPath.lineTo(hx, hy);
              hasPath = true;
            }
          });
        }

        if (hasPath) {
          offCtx.globalCompositeOperation = 'source-over';
          offCtx.lineJoin = 'round';
          offCtx.lineCap = 'round';
          if (style === 'hover') {
            offCtx.lineWidth = 18;
            offCtx.strokeStyle = 'rgba(125, 211, 252, 0.55)';
            offCtx.stroke(highlightPath);
            ctx.globalAlpha = 0.9;
            ctx.drawImage(offCanvas, minX - padding, minY - padding);
            ctx.globalAlpha = 1;
          } else if (style === 'selected') {
            offCtx.lineWidth = 20;
            offCtx.strokeStyle = 'rgba(186, 230, 253, 0.92)';
            offCtx.stroke(highlightPath);
            ctx.globalAlpha = 1;
            ctx.drawImage(offCanvas, minX - padding, minY - padding);
          }
        }
      };

      const hoveredNotSelected = R.hoveredComponentIds.filter(id => !R.selectedAtomIds.includes(id));
      drawMoleculeHighlight(hoveredNotSelected, 'hover');
      drawMoleculeHighlight(R.selectedAtomIds, 'selected');

      // Individually selected bonds (even when endpoints are not both selected).
      if (R.selectedBondIds.length > 0) {
        const bondTrimMain: BondTrimContext = {
          ctx,
          displayPrefs: R.displayPrefs,
          labelRadForAtom,
          condensedGroupLabels: R.condensedGroupLabels,
          molecule: R.renderedMolecule,
          valencyMap: R.valencyMap,
        };
        const selectedBondSet = new Set(R.selectedBondIds);
        for (const bond of R.renderedMolecule.bonds) {
          if (!selectedBondSet.has(bond.id)) continue;
          // Skip bonds already covered by the atom-pair highlight.
          if (
            R.selectedAtomIds.includes(bond.fromAtomId) &&
            R.selectedAtomIds.includes(bond.toAtomId)
          ) {
            continue;
          }
          const from = R.renderedMolecule.atoms.find(a => a.id === bond.fromAtomId);
          const to = R.renderedMolecule.atoms.find(a => a.id === bond.toAtomId);
          if (!from || !to) continue;
          const T = bondEndPoints(from, to, bondTrimMain);
          ctx.save();
          ctx.strokeStyle = 'rgba(186, 230, 253, 0.95)';
          ctx.lineWidth = 12 / R.viewport.zoom;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(T.ax, T.ay);
          ctx.lineTo(T.bx, T.by);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  if (R.hoveredAtomCircleId) {
    const a = R.renderedMolecule.atoms.find(x => x.id === R.hoveredAtomCircleId);
    if (a) {
      const placingFragment = R.activeTool === PLACE_FRAGMENT_TOOL_ID;
      const snapValid = !placingFragment || isFragmentPlacementSnapValid(R);
      ctx.save();
      ctx.fillStyle = placingFragment
        ? snapValid
          ? 'rgba(37, 99, 235, 0.28)'
          : 'rgba(234, 179, 8, 0.22)'
        : 'rgba(125, 211, 252, 0.35)';
      ctx.beginPath();
      ctx.arc(a.x, a.y, placingFragment ? 12 : 10, 0, Math.PI * 2);
      ctx.fill();
      if (placingFragment) {
        ctx.strokeStyle = snapValid ? 'rgba(37, 99, 235, 0.75)' : 'rgba(202, 138, 4, 0.85)';
        ctx.lineWidth = 1.5 / R.viewport.zoom;
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  if (R.hoveredBondHighlightId) {
    const b = R.renderedMolecule.bonds.find(x => x.id === R.hoveredBondHighlightId);
    if (b) {
      const from = R.renderedMolecule.atoms.find(a => a.id === b.fromAtomId);
      const to = R.renderedMolecule.atoms.find(a => a.id === b.toAtomId);
      if (from && to) {
        const bondTrimMain: BondTrimContext = {
          ctx,
          displayPrefs: R.displayPrefs,
          labelRadForAtom,
          condensedGroupLabels: R.condensedGroupLabels,
          molecule: R.renderedMolecule,
          valencyMap: R.valencyMap,
        };
        const T = bondEndPoints(from, to, bondTrimMain);
        ctx.save();
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.42)';
        ctx.lineWidth = 8 / R.viewport.zoom;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(T.ax, T.ay);
        ctx.lineTo(T.bx, T.by);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
};

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
