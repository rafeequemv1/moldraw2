/**
 * Imaginary split-line rays for a live dendrimer (radial) InstanceArray.
 * Overlay only — not stored as atoms and not exported.
 */
import type { RenderContext } from './types';

const WEDGE_STROKE = 'rgba(217, 119, 6, 0.42)';
const ATTACH_STROKE = 'rgba(217, 119, 6, 0.22)';

export const drawDendrimerGuides = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const arrays = (R.renderedMolecule.instanceArrays ?? []).filter(a => a.dendrimer);
  if (arrays.length === 0) return;

  const invZ = 1 / Math.max(1e-6, R.viewport.zoom);
  const reach = 900;

  ctx.save();
  ctx.lineCap = 'round';

  for (const arr of arrays) {
    const d = arr.dendrimer;
    if (!d) continue;
    const n = Math.max(2, d.foldCount);
    const step = (Math.PI * 2) / n;

    ctx.strokeStyle = WEDGE_STROKE;
    ctx.lineWidth = 1.25 * invZ;
    ctx.setLineDash([7 * invZ, 5 * invZ]);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const ang = (i + 0.5) * step;
      ctx.moveTo(d.cx, d.cy);
      ctx.lineTo(d.cx + Math.cos(ang) * reach, d.cy + Math.sin(ang) * reach);
    }
    ctx.stroke();

    ctx.strokeStyle = ATTACH_STROKE;
    ctx.lineWidth = 1 * invZ;
    ctx.setLineDash([3 * invZ, 6 * invZ]);
    ctx.beginPath();
    for (const id of d.attachmentAtomIds) {
      const atom = R.renderedMolecule.atoms.find(a => a.id === id);
      if (!atom) continue;
      const ang = Math.atan2(atom.y - d.cy, atom.x - d.cx);
      ctx.moveTo(d.cx, d.cy);
      ctx.lineTo(d.cx + Math.cos(ang) * reach, d.cy + Math.sin(ang) * reach);
    }
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = WEDGE_STROKE;
    ctx.beginPath();
    ctx.arc(d.cx, d.cy, 3.2 * invZ, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
};
