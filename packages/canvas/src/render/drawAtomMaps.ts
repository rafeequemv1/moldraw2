/**
 * Draw atom-atom mapping numbers (reaction AAM) near atoms.
 */
import type { RenderContext } from './types';

export const drawAtomMaps = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const mol = R.renderedMolecule;
  const hasMaps = mol.atoms.some(a => a.atomMap != null && a.atomMap > 0);
  if (!hasMaps) return;

  ctx.save();
  ctx.font = 'bold 10px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const atom of mol.atoms) {
    const map = atom.atomMap;
    if (map == null || map <= 0) continue;
    if (atom.element === 'H' && (atom.charge ?? 0) === 0) continue;
    R.applyLabelUpright(atom.id, () => {
      const x = atom.x - 11;
      const y = atom.y - 11;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#b45309';
      ctx.fillText(String(map), x, y);
    });
  }
  ctx.restore();
};
