import type { CanvasOrbital } from '@moldraw/domain';
import {
  canvasOrbitalWithDragPreview,
  getOrbitalRotateHandleWorld,
  orbitalSupportsRotation,
  resolveOrbitalCenter,
} from '../geometry/orbitals';
import type { RenderContext } from './types';

/**
 * Textbook / ChemDraw 2D lobe: a rounded ellipse (prolate spheroid), not a
 * pointed teardrop. `phase` is the orbital sign (shaded vs unshaded).
 */
function fillLobe(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  angle: number,
  size: number,
  phase: 'light' | 'dark',
  ink: string,
  scale = 1,
): void {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const major = size * 0.46 * scale;
  const minor = size * 0.26 * scale;
  const gap = Math.max(2.2, size * 0.045);
  const lx = cx + ux * (major + gap);
  const ly = cy + uy * (major + gap);

  ctx.beginPath();
  ctx.ellipse(lx, ly, major, minor, angle, 0, Math.PI * 2);
  ctx.fillStyle = phase === 'dark' ? ink : '#ffffff';
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function drawS(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, ink: string): void {
  const g = ctx.createRadialGradient(cx - r * 0.28, cy - r * 0.32, r * 0.12, cx, cy, r);
  g.addColorStop(0, '#f4f4f4');
  g.addColorStop(0.45, '#9a9a9a');
  g.addColorStop(1, ink);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.15;
  ctx.stroke();
}

function drawP(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rot: number,
  size: number,
  ink: string,
): void {
  fillLobe(ctx, cx, cy, rot, size, 'light', ink);
  fillLobe(ctx, cx, cy, rot + Math.PI, size, 'dark', ink);
}

function drawDxy(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rot: number,
  size: number,
  ink: string,
): void {
  for (let i = 0; i < 4; i++) {
    fillLobe(
      ctx,
      cx,
      cy,
      rot + (i * Math.PI) / 2 + Math.PI / 4,
      size,
      i % 2 === 0 ? 'light' : 'dark',
      ink,
      0.88,
    );
  }
}

function drawDz2(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rot: number,
  size: number,
  ink: string,
): void {
  fillLobe(ctx, cx, cy, rot, size, 'light', ink, 0.9);
  fillLobe(ctx, cx, cy, rot + Math.PI, size, 'dark', ink, 0.9);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.4, size * 0.15, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(80,80,80,0.28)';
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.1;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

function drawOne(
  ctx: CanvasRenderingContext2D,
  orbital: CanvasOrbital,
  cx: number,
  cy: number,
  selected: boolean,
  ink: string,
): void {
  ctx.save();
  if (orbital.kind === 's') drawS(ctx, cx, cy, orbital.size * 0.42, ink);
  else if (orbital.kind === 'p') drawP(ctx, cx, cy, orbital.rotationRad, orbital.size, ink);
  else if (orbital.kind === 'd_xy') drawDxy(ctx, cx, cy, orbital.rotationRad, orbital.size, ink);
  else drawDz2(ctx, cx, cy, orbital.rotationRad, orbital.size, ink);

  if (selected) {
    ctx.beginPath();
    ctx.arc(cx, cy, orbital.size * 1.08, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.85)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    if (orbitalSupportsRotation(orbital)) {
      const h = getOrbitalRotateHandleWorld(orbital, cx, cy);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(orbital.rotationRad) * orbital.size, cy + Math.sin(orbital.rotationRad) * orbital.size);
      ctx.lineTo(h.x, h.y);
      ctx.strokeStyle = 'rgba(37, 99, 235, 0.75)';
      ctx.lineWidth = 1.15;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(h.x, h.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawCanvasOrbitals(ctx: CanvasRenderingContext2D, R: RenderContext): void {
  const list = R.renderedMolecule.orbitals ?? [];
  if (list.length === 0) return;
  const selected = new Set(R.selectedCanvasOrbitalIds ?? []);
  const ink = R.structureTheme.ink;
  const drag =
    R.dragAction?.type === 'move_canvas_orbital' || R.dragAction?.type === 'rotate_canvas_orbital'
      ? R.dragAction
      : null;
  for (const raw of list) {
    const o = canvasOrbitalWithDragPreview(raw, drag);
    const c = resolveOrbitalCenter(R.renderedMolecule, o);
    drawOne(ctx, o, c.x, c.y, selected.has(raw.id), o.color ?? ink);
  }
}
