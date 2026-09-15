/**
 * All bond strokes: single, double, triple, stereo (wedge, dash, wavy).
 * Double bonds offset uses `% of bond length` from settings.
 */
import { bondEndPoints, bondStrokeColor, getSmallestRingCenter, type BondTrimContext } from '../geometry';
import type { RenderContext } from './types';

export const drawBonds = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const P = R.displayPrefs;
  const mol = R.renderedMolecule;

  const bondTrimCtx: BondTrimContext = {
    ctx,
    displayPrefs: P,
    labelRadForAtom: (atomId: string) =>
      R.selectedAtomIds.includes(atomId) && Math.abs(R.labelCounterRad) > 1e-5
        ? R.labelCounterRad
        : 0,
    condensedGroupLabels: R.condensedGroupLabels,
    molecule: mol,
    valencyMap: R.valencyMap,
  };

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const spacingFrac = P.bondSpacingFraction;

  mol.bonds.forEach(bond => {
    const from = mol.atoms.find(a => a.id === bond.fromAtomId);
    const to = mol.atoms.find(a => a.id === bond.toAtomId);
    if (!from || !to) return;

    // Explicit H–heavy bonds: hide with the H toggle unless H is special (D/T/charge).
    const touchesPlainH =
      (from.element === 'H' && (from.charge ?? 0) === 0 && !(from.isotope && from.isotope > 0)) ||
      (to.element === 'H' && (to.charge ?? 0) === 0 && !(to.isotope && to.isotope > 0));
    if (touchesPlainH && !R.showHydrogens) return;

    const bcol = bondStrokeColor(bond, from, to, {
      applyAtomColorsToBonds: R.applyAtomColorsToBonds,
    });
    ctx.strokeStyle = bcol;

    const normalizedOrder = bond.order === 4 ? 1 : bond.order;

    if (normalizedOrder === 1) {
      const T = bondEndPoints(from, to, bondTrimCtx);
      const dx = T.bx - T.ax;
      const dy = T.by - T.ay;
      const len = Math.hypot(dx, dy);

      if (bond.stereo === 'wedge') {
        if (len < 1e-6) return;
        const perpX = -dy / len;
        const perpY = dx / len;
        const endGap = 4;
        const tx = T.bx - (dx / len) * endGap;
        const ty = T.by - (dy / len) * endGap;
        const width = P.stereoWedgeWidthPx / 2;
        ctx.lineWidth = P.bondThicknessPx;
        ctx.beginPath();
        ctx.moveTo(T.ax, T.ay);
        ctx.lineTo(tx + perpX * width, ty + perpY * width);
        ctx.lineTo(tx - perpX * width, ty - perpY * width);
        ctx.closePath();
        ctx.fillStyle = bcol;
        ctx.fill();
      } else if (bond.stereo === 'dash') {
        if (len < 1e-6) return;
        const perpX = -dy / len;
        const perpY = dx / len;
        const numDashes = 4;
        ctx.lineWidth = P.bondThicknessPx;
        ctx.beginPath();
        for (let i = 1; i <= numDashes; i++) {
          const t = i / (numDashes + 0.65);
          const px = T.ax + dx * t;
          const py = T.ay + dy * t;
          const w = (i / numDashes) * (P.stereoWedgeWidthPx * 0.55);
          ctx.moveTo(px + perpX * w, py + perpY * w);
          ctx.lineTo(px - perpX * w, py - perpY * w);
        }
        ctx.stroke();
      } else if (bond.stereo === 'wavy') {
        if (len < 1e-6) return;
        const nx = -dy / len;
        const ny = dx / len;
        const segments = 28;
        const amp = Math.max(2.4, Math.min(4.2, len * 0.06));
        const waves = Math.max(2.4, Math.min(5.2, len / 16));
        ctx.lineWidth = P.bondThicknessPx;
        ctx.beginPath();
        ctx.moveTo(T.ax, T.ay);
        for (let i = 1; i <= segments; i++) {
          const t = i / segments;
          const bx = T.ax + dx * t;
          const by = T.ay + dy * t;
          const w = Math.sin(t * Math.PI * 2 * waves) * amp;
          ctx.lineTo(bx + nx * w, by + ny * w);
        }
        ctx.stroke();
      } else {
        ctx.lineWidth = P.bondThicknessPx;
        ctx.beginPath();
        ctx.moveTo(T.ax, T.ay);
        ctx.lineTo(T.bx, T.by);
        ctx.stroke();
      }
      return;
    }

    if (normalizedOrder === 2) {
      const T = bondEndPoints(from, to, bondTrimCtx);
      const dx = T.bx - T.ax;
      const dy = T.by - T.ay;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) return;
      const gapPx = len * spacingFrac;
      const offset = gapPx / 2;
      let nx = (-dy / len) * offset;
      let ny = (dx / len) * offset;

      const inset = Math.min(5, len * 0.08);
      const ux = dx / len;
      const uy = dy / len;

      ctx.lineWidth = P.bondThicknessPx;

      const ringCenter = getSmallestRingCenter(bond, mol);

      if (ringCenter) {
        const mx = (T.ax + T.bx) / 2;
        const my = (T.ay + T.by) / 2;
        const vx = ringCenter.x - mx;
        const vy = ringCenter.y - my;
        if (nx * vx + ny * vy < 0) {
          nx = -nx;
          ny = -ny;
        }
      }
      const hnx = nx / 2;
      const hny = ny / 2;
      ctx.beginPath();
      ctx.moveTo(T.ax + hnx + ux * inset, T.ay + hny + uy * inset);
      ctx.lineTo(T.bx + hnx - ux * inset, T.by + hny - uy * inset);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(T.ax - hnx + ux * inset, T.ay - hny + uy * inset);
      ctx.lineTo(T.bx - hnx - ux * inset, T.by - hny - uy * inset);
      ctx.stroke();
      return;
    }

    if (normalizedOrder === 3) {
      const T = bondEndPoints(from, to, bondTrimCtx);
      const dx = T.bx - T.ax;
      const dy = T.by - T.ay;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) return;
      const gapPx = len * spacingFrac;
      const offset = (gapPx / 2) * 1.15;
      const nx = (-dy / len) * offset;
      const ny = (dx / len) * offset;
      const inset = Math.min(4, len * 0.06);
      const ux = dx / len;
      const uy = dy / len;

      ctx.lineWidth = P.bondThicknessPx;

      ctx.beginPath();
      ctx.moveTo(T.ax, T.ay);
      ctx.lineTo(T.bx, T.by);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(T.ax + nx + ux * inset, T.ay + ny + uy * inset);
      ctx.lineTo(T.bx + nx - ux * inset, T.by + ny - uy * inset);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(T.ax - nx + ux * inset, T.ay - ny + uy * inset);
      ctx.lineTo(T.bx - nx - ux * inset, T.by - ny - uy * inset);
      ctx.stroke();
    }
  });

  ctx.strokeStyle = '#0f172a';
};
