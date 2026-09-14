/**
 * Translucent ring fills (e.g. user-applied "color this ring red"). Drawn
 * before bonds so the bond strokes sit on top.
 */
import type { Atom } from '@moldraw/domain';
import { isSimpleCycleAtomSet, orderSimpleCycle, parseRingFillKey } from '@moldraw/domain';
import { hexToRgba } from '../geometry';
import type { RenderContext } from './types';

/** Faint preview of the ring that would be selected (ring-select tool hover). */
export const drawRingHoverFill = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const ids = R.hoverRingAtomIds;
  if (!ids?.length) return;
  if (!isSimpleCycleAtomSet(R.renderedMolecule, ids)) return;
  const ordered = orderSimpleCycle(R.renderedMolecule, ids);
  if (!ordered || ordered.length < 3) return;
  const verts = ordered.map(id => R.atomById.get(id)).filter((a): a is Atom => !!a);
  if (verts.length < 3) return;
  ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
  ctx.strokeStyle = 'rgba(14, 165, 233, 0.55)';
  ctx.lineWidth = 1.5 / R.viewport.zoom;
  ctx.beginPath();
  ctx.moveTo(verts[0].x, verts[0].y);
  for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
};

export const drawRingFills = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const rfMap = R.renderedMolecule.ringFills;
  if (!rfMap || Object.keys(rfMap).length === 0) return;

  for (const [key, spec] of Object.entries(rfMap)) {
    if (!spec?.color) continue;
    const ids = parseRingFillKey(key);
    if (!isSimpleCycleAtomSet(R.renderedMolecule, ids)) continue;
    const ordered = orderSimpleCycle(R.renderedMolecule, ids);
    if (!ordered || ordered.length < 3) continue;
    const fillAlpha = spec.opacity ?? 0.5;
    ctx.fillStyle = hexToRgba(spec.color, fillAlpha);
    const verts = ordered.map(id => R.atomById.get(id)).filter((a): a is Atom => !!a);
    if (verts.length < 3) continue;
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
    ctx.fill();
  }
};
