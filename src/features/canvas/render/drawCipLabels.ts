/**
 * Draw Indigo CIP labels (R/S near atoms, E/Z near bond midpoints).
 */
import type { RenderContext } from './types';

export const drawCipLabels = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  if (!R.showCipLabels) return;
  const atomTags = R.cipAtomLabels;
  const bondTags = R.cipBondLabels;
  if ((!atomTags || atomTags.size === 0) && (!bondTags || bondTags.size === 0)) return;

  const mol = R.renderedMolecule;
  ctx.save();
  ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (atomTags && atomTags.size > 0) {
    for (const atom of mol.atoms) {
      const cip = atomTags.get(atom.id);
      if (!cip) continue;
      // Skip plain H unless it's the only place to show stereo (rare).
      if (atom.element === 'H' && (atom.charge ?? 0) === 0) continue;
      R.applyLabelUpright(atom.id, () => {
        const x = atom.x + 10;
        const y = atom.y - 12;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(x, y, 7.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1d4ed8';
        ctx.fillText(cip, x, y);
      });
    }
  }

  if (bondTags && bondTags.size > 0) {
    for (const bond of mol.bonds) {
      const cip = bondTags.get(bond.id);
      if (!cip) continue;
      const from = mol.atoms.find(a => a.id === bond.fromAtomId);
      const to = mol.atoms.find(a => a.id === bond.toAtomId);
      if (!from || !to) continue;
      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const ox = (-dy / len) * 10;
      const oy = (dx / len) * 10;
      const x = mx + ox;
      const y = my + oy;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(x, y, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7c3aed';
      ctx.fillText(cip, x, y);
    }
  }

  ctx.restore();
};
