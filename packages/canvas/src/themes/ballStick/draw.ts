import { covalentRadius } from '@moldraw/core';
import type { Atom, Bond } from '@moldraw/domain';
import type { RenderContext } from '../../render/types';
import { cpkColorForElement } from '../cpk';

const OUTLINE = '#111111';
const CARBON_COVALENT_A = covalentRadius('C');

function atomFill(atom: Atom): string {
  if (atom.color && /^#[0-9A-Fa-f]{6}$/.test(atom.color)) return atom.color;
  return cpkColorForElement(atom.element);
}

function stickFill(bond: Bond): string {
  if (bond.color && /^#[0-9A-Fa-f]{6}$/.test(bond.color)) return bond.color;
  return OUTLINE;
}

function insetEnds(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  insetA: number,
  insetB: number,
): { ax: number; ay: number; bx: number; by: number } | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const ux = dx / len;
  const uy = dy / len;
  const a = Math.min(insetA, len * 0.42);
  const b = Math.min(insetB, len * 0.42);
  if (a + b >= len - 0.5) return null;
  return { ax: x1 + ux * a, ay: y1 + uy * a, bx: x2 - ux * b, by: y2 - uy * b };
}

function drawRectBar(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  fill: string,
  outlineW: number,
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const nx = (-dy / len) * (width / 2);
  const ny = (dx / len) * (width / 2);
  ctx.beginPath();
  ctx.moveTo(ax + nx, ay + ny);
  ctx.lineTo(bx + nx, by + ny);
  ctx.lineTo(bx - nx, by - ny);
  ctx.lineTo(ax - nx, ay - ny);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineJoin = 'miter';
  ctx.lineWidth = outlineW;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

function stickCount(bond: Bond): number {
  if (bond.order >= 2.5) return 3;
  if (bond.order >= 1.5 || bond.aromatic) return 2;
  return 1;
}

/** Carbon sphere ~32% of bond length; other elements scale by covalent radius / C. */
export function ballStickAtomRadius(R: RenderContext, element: string): number {
  const carbonR = Math.max(9.5, R.displayPrefs.bondLengthPx * 0.32);
  const scale = covalentRadius(element) / CARBON_COVALENT_A;
  return Math.max(4.4, carbonR * scale);
}

function stickWidth(R: RenderContext, count: number): number {
  const base = Math.max(5.6, R.displayPrefs.bondLengthPx * 0.28);
  // Simple theme: singles were a fat bar (~12 px). Keep them close to one
  // stick of a double so the 2D canvas does not read as a heavy sausage.
  if (count === 1) return Math.max(3.2, base * 0.34);
  if (count === 2) return base * 0.38;
  return base * 0.3;
}

export function ballStickSelectionAtomRadius(R: RenderContext, element: string): number {
  return ballStickAtomRadius(R, element) + 1.6;
}

export function ballStickSelectionBondWidth(R: RenderContext, bond: Bond): number {
  return stickWidth(R, stickCount(bond)) + 2.8;
}

/** Center-to-center spacing so the gap between parallel sticks stays readable. */
function stickGap(R: RenderContext, width: number, count: number): number {
  if (count < 2) return 0;
  return Math.max(width * 2.9, R.displayPrefs.bondLengthPx * 0.3);
}

export function ballStickBondHighlightWidth(R: RenderContext, bond: Bond): number {
  const n = stickCount(bond);
  const w = stickWidth(R, n);
  const gap = stickGap(R, w, n);
  return (n - 1) * gap + w + 8;
}

export function drawBallStickStructure(ctx: CanvasRenderingContext2D, R: RenderContext): void {
  const mol = R.renderedMolecule;
  const atomById = R.atomById;
  const visibleAtomIds = R.visibleAtomIds;
  const visibleBondIds = R.visibleBondIds;
  const outlineW = Math.max(0.9, 1.15 / Math.max(R.viewport.zoom, 0.5));

  ctx.save();

  for (const bond of mol.bonds) {
    if (visibleBondIds && !visibleBondIds.has(bond.id)) continue;
    const from = atomById.get(bond.fromAtomId);
    const to = atomById.get(bond.toAtomId);
    if (!from || !to) continue;
    const insetA = ballStickAtomRadius(R, from.element) * 0.72;
    const insetB = ballStickAtomRadius(R, to.element) * 0.72;
    const ends = insetEnds(from.x, from.y, to.x, to.y, insetA, insetB);
    if (!ends) continue;
    const n = stickCount(bond);
    const w = stickWidth(R, n);
    const fill = stickFill(bond);
    const dx = ends.bx - ends.ax;
    const dy = ends.by - ends.ay;
    const len = Math.hypot(dx, dy);
    const nx = len > 1e-6 ? -dy / len : 0;
    const ny = len > 1e-6 ? dx / len : 0;
    const gap = stickGap(R, w, n);
    const start = -((n - 1) / 2) * gap;
    for (let i = 0; i < n; i++) {
      const off = start + i * gap;
      drawRectBar(
        ctx,
        ends.ax + nx * off,
        ends.ay + ny * off,
        ends.bx + nx * off,
        ends.by + ny * off,
        w,
        fill,
        outlineW,
      );
    }
  }

  for (const atom of mol.atoms) {
    if (visibleAtomIds && !visibleAtomIds.has(atom.id)) continue;
    const r = ballStickAtomRadius(R, atom.element);
    const fill = atomFill(atom);
    const op = R.atomOpacityById?.get(atom.id) ?? atom.opacity ?? 1;
    ctx.globalAlpha = op;
    ctx.beginPath();
    ctx.arc(atom.x, atom.y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = outlineW;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(atom.x - r * 0.28, atom.y - r * 0.28, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}
