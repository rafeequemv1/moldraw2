/**
 * Dashed/preview overlays that follow the cursor while drawing:
 *  - bond ghost (single/double/.../wedge tools) + live angle/length readout
 *  - bond hover hint (faint preview bond / placement-atom dot when a
 *    bond tool is active but no drag is in progress — "what will happen")
 *  - ring ghost (n-gon snapped to bond, atom, or freely placed)
 *  - chain ghost (numbered zig-zag of carbons)
 * Each is a no-op when its preview state isn't active.
 */
import { boatRingVertices } from '@moldraw/core';
import { chairRingVertices } from '@moldraw/core';
import { computeAutoExtendAngle, getChainPoints, chainVertexLabelOffset, type Point } from '../geometry';
import { computeRingFusionGeometry } from '../interaction/toolRing';
import type { RenderContext } from './types';

const BOND_TOOL_NAMES = new Set([
  'single_bond',
  'double_bond',
  'triple_bond',
  'aromatic_bond',
  'wedge_bond',
  'dash_bond',
  'either_bond',
  'wavy_bond',
  'cis_trans_bond',
  'dative_bond',
  'any_bond',
  'single_double_bond',
  'single_aromatic_bond',
  'double_aromatic_bond',
  'dotted_bond',
  'bold_bond',
]);

/**
 * Tiny pill-shaped readout floated near a bond's far end while dragging,
 * e.g. "60° • 40 px". Angle is screen-space (0° = right, +CW because canvas Y
 * points down), normalized to `[0, 360)`. Length is in canvas pixels — 1 bond
 * unit ≈ 40 px ≈ 1.5 Å in the molblock writer.
 */
const drawBondReadout = (ctx: CanvasRenderingContext2D, start: Point, end: Point): void => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;

  let degrees = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (degrees < 0) degrees += 360;
  const text = `${Math.round(degrees)}° • ${Math.round(len)} px`;

  const ux = dx / len;
  const uy = dy / len;
  // Perpendicular offset so the pill sits beside the line, not on top of it.
  const px = -uy;
  const py = ux;
  const anchorX = end.x + ux * 10 + px * 10;
  const anchorY = end.y + uy * 10 + py * 10;

  ctx.save();
  ctx.font = '11px Inter, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const metrics = ctx.measureText(text);
  const padX = 5;
  const w = metrics.width + padX * 2;
  const h = 16;
  const r = 4;
  const x = anchorX;
  const y = anchorY - h / 2;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(text, anchorX + padX, anchorY);
  ctx.restore();
};

/**
 * Touch only: the finger hides the ghost tip, so show the snap positions as a
 * ring of tick marks at bond length around the start atom. Ticks taken by an
 * existing bond are skipped; the tick the ghost currently snaps to is
 * emphasised so the user can feel the angle "click" before lifting.
 */
const drawTouchSnapTicks = (
  ctx: CanvasRenderingContext2D,
  R: RenderContext,
  start: Point,
  startAtomId: string | undefined,
  current: Point,
): void => {
  const step =
    R.displayPrefs.bondAngleSnapRad > 1e-9 ? R.displayPrefs.bondAngleSnapRad : Math.PI / 6;
  const count = Math.round((2 * Math.PI) / step);
  if (count < 3 || count > 72) return;
  const len = R.displayPrefs.bondLengthPx;
  if (!(len > 0)) return;

  // Occupied directions (existing bonds off the start atom) — no tick there.
  const taken: number[] = [];
  if (startAtomId) {
    for (const b of R.renderedMolecule.bonds) {
      const otherId =
        b.fromAtomId === startAtomId ? b.toAtomId : b.toAtomId === startAtomId ? b.fromAtomId : null;
      if (!otherId) continue;
      const other = R.renderedMolecule.atoms.find(a => a.id === otherId);
      if (other) taken.push(Math.atan2(other.y - start.y, other.x - start.x));
    }
  }
  const currentAngle = Math.atan2(current.y - start.y, current.x - start.x);
  const angDiff = (a: number, b: number): number => {
    let d = a - b;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
  };

  const zoom = Math.max(R.viewport.zoom, 1e-6);
  const tickLen = 6 / zoom;
  const activeLen = 9 / zoom;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const a = i * step;
    if (taken.some(t => angDiff(t, a) < step * 0.35)) continue;
    const isActive = angDiff(currentAngle, a) < step * 0.5;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const half = (isActive ? activeLen : tickLen) / 2;
    ctx.beginPath();
    ctx.moveTo(start.x + ux * (len - half), start.y + uy * (len - half));
    ctx.lineTo(start.x + ux * (len + half), start.y + uy * (len + half));
    ctx.strokeStyle = isActive ? 'rgba(37, 99, 235, 0.95)' : 'rgba(100, 116, 139, 0.45)';
    ctx.lineWidth = (isActive ? 2.5 : 1.25) / zoom;
    ctx.stroke();
  }
  // Faint guide circle so the ticks read as one ring.
  ctx.beginPath();
  ctx.arc(start.x, start.y, len, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.18)';
  ctx.lineWidth = 1 / zoom;
  ctx.setLineDash([2 / zoom, 4 / zoom]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
};

export const drawBondGhost = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  if (!R.drawingBond) return;
  const startAtom = R.drawingBond.startAtomId
    ? R.renderedMolecule.atoms.find(a => a.id === R.drawingBond!.startAtomId)
    : null;
  const start = startAtom ? { x: startAtom.x, y: startAtom.y } : R.drawingBond.startPos;
  if (R.touchPointerWorldPos) {
    drawTouchSnapTicks(ctx, R, start, R.drawingBond.startAtomId, R.drawingBond.currentPos);
  }
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(R.drawingBond.currentPos.x, R.drawingBond.currentPos.y);
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
  ctx.lineWidth = Math.max(1, R.displayPrefs.bondThicknessPx);
  ctx.setLineDash([5, 5]);
  ctx.stroke();
  ctx.setLineDash([]);

  drawBondReadout(ctx, start, R.drawingBond.currentPos);
};

/**
 * Faint dot or label for the would-be new atom under the cursor. Carbon shows
 * a small circle (matches its empty-vertex appearance); heteroatoms show their
 * symbol on a translucent halo so the grid stays visible behind it.
 */
const drawPlacementAtomGhost = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  element: string,
): void => {
  ctx.save();
  if (!element || element === 'C') {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.font = '14px Inter, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const metrics = ctx.measureText(element);
    const w = metrics.width + 6;
    const h = 16;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.fillText(element, x, y);
  }
  ctx.restore();
};

/**
 * "What will happen" affordance for the bond tools. Only renders when no draw
 * is in progress; complements `drawRingGhost` which already covers the ring
 * tool family.
 *
 *   - Hovering an existing atom → faint preview bond pointing in the
 *     auto-extend direction (away from the atom's structure), terminating
 *     in a placement-atom ghost showing the symbol that will be created.
 *   - Hovering empty canvas → faint placement-atom ghost at the cursor.
 *
 * The bond ghost intentionally uses a thin neutral stroke (no fancy
 * order/stereo decoration) — its job is to show direction, not order. The
 * actual order ramps up the moment the user clicks/drags.
 */
export const drawBondHoverHint = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const bl = R.displayPrefs.bondLengthPx;
  if (!BOND_TOOL_NAMES.has(R.activeTool)) return;
  if (R.drawingBond || R.drawingRing || R.drawingChain) return;
  // If the user is mid-drag (selection/move/etc.), suppress the hint to
  // avoid two competing previews.
  if (R.dragAction) return;
  if (R.hoverBondId) return;

  if (R.hoverAtomId) {
    const atom = R.renderedMolecule.atoms.find(a => a.id === R.hoverAtomId);
    if (!atom) return;
    const angle = computeAutoExtendAngle(
      R.renderedMolecule,
      R.hoverAtomId,
      R.displayPrefs.bondAngleSnapRad,
    );
    const endX = atom.x + Math.cos(angle) * bl;
    const endY = atom.y + Math.sin(angle) * bl;

    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.30)';
    ctx.lineWidth = Math.max(1, R.displayPrefs.bondThicknessPx * 0.75);
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(atom.x, atom.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    drawPlacementAtomGhost(ctx, endX, endY, R.placementElement);
    return;
  }

  if (R.mouseWorldPos) {
    drawPlacementAtomGhost(ctx, R.mouseWorldPos.x, R.mouseWorldPos.y, R.placementElement);
  }
};

export const drawRingGhost = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  if (!R.isRingTool) return;
  if (!R.mouseWorldPos && !R.drawingRing) return;

  const numSides = R.numSides;
  const FIXED_BOND = R.displayPrefs.bondLengthPx;

  let center: Point | null = R.mouseWorldPos;
  let angleOffset = -Math.PI / 2;
  let activeAngleStep = (Math.PI * 2) / numSides;
  let activeRadius = FIXED_BOND / (2 * Math.sin(Math.PI / numSides));

  if (R.hoverBondId && !R.drawingRing) {
    const bond = R.renderedMolecule.bonds.find(b => b.id === R.hoverBondId);
    if (bond) {
      const a1 = R.renderedMolecule.atoms.find(a => a.id === bond.fromAtomId);
      const a2 = R.renderedMolecule.atoms.find(a => a.id === bond.toAtomId);
      if (a1 && a2 && R.mouseWorldPos) {
        const geom = computeRingFusionGeometry(a1, a2, R.mouseWorldPos, numSides);
        if (geom) {
          center = geom.center;
          activeRadius = geom.radius;
          angleOffset = geom.angleOffset;
          activeAngleStep = geom.angleStep;
        }
      }
    }
  } else if (R.drawingRing) {
    const startAtom = R.renderedMolecule.atoms.find(a => a.id === R.drawingRing!.startAtomId);
    if (startAtom) {
      const dx = R.drawingRing.currentPos.x - startAtom.x;
      const dy = R.drawingRing.currentPos.y - startAtom.y;
      if (Math.hypot(dx, dy) > 10) {
        const snapAngle =
          R.displayPrefs.bondAngleSnapRad > 1e-9 ? R.displayPrefs.bondAngleSnapRad : Math.PI / 6;
        let dragAngle = Math.atan2(dy, dx);
        dragAngle = Math.round(dragAngle / snapAngle) * snapAngle;
        const endX = startAtom.x + Math.cos(dragAngle) * FIXED_BOND;
        const endY = startAtom.y + Math.sin(dragAngle) * FIXED_BOND;

        ctx.beginPath();
        ctx.moveTo(startAtom.x, startAtom.y);
        ctx.lineTo(endX, endY);
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        center = {
          x: endX + activeRadius * Math.cos(dragAngle),
          y: endY + activeRadius * Math.sin(dragAngle),
        };
        angleOffset = dragAngle + Math.PI;
      } else {
        center = { x: startAtom.x, y: startAtom.y + activeRadius };
      }
    } else {
      center = R.drawingRing.currentPos;
    }
  } else if (R.hoverAtomId) {
    const hoverAtom = R.renderedMolecule.atoms.find(a => a.id === R.hoverAtomId);
    if (hoverAtom) center = { x: hoverAtom.x, y: hoverAtom.y + activeRadius };
  }

  if (!center) return;

  ctx.beginPath();
  if (R.isChairTool) {
    const verts = chairRingVertices(center, FIXED_BOND);
    verts.forEach((v, i) => {
      if (i === 0) ctx.moveTo(v.x, v.y);
      else ctx.lineTo(v.x, v.y);
    });
    ctx.closePath();
  } else if (R.isBoatTool) {
    const verts = boatRingVertices(center, FIXED_BOND);
    verts.forEach((v, i) => {
      if (i === 0) ctx.moveTo(v.x, v.y);
      else ctx.lineTo(v.x, v.y);
    });
    ctx.closePath();
  } else {
    for (let i = 0; i < numSides; i++) {
      const angle = angleOffset + i * activeAngleStep;
      const vx = center.x + activeRadius * Math.cos(angle);
      const vy = center.y + activeRadius * Math.sin(angle);
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
  }
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = Math.max(1, R.displayPrefs.bondThicknessPx);
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.4)';
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = R.structureTheme.ink;
};

export const drawChainGhost = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  if (R.activeTool !== 'chain' || !R.drawingChain) return;
  const points = getChainPoints(
    R.drawingChain.startPos,
    R.drawingChain.currentPos,
    R.displayPrefs.bondLengthPx,
    R.drawingChain.preferredFirstBondAngle,
    R.displayPrefs.bondAngleSnapRad,
  );
  if (points.length <= 1) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.strokeStyle = R.structureTheme.ink;
  ctx.lineWidth = Math.max(1, R.displayPrefs.bondThicknessPx);
  ctx.stroke();

  ctx.font = 'bold 12px Inter, sans-serif';
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labelPad = Math.max(14, R.displayPrefs.bondLengthPx * 0.38);
  for (let i = 0; i < points.length; i++) {
    const labelPos = chainVertexLabelOffset(points, i, labelPad);
    const text = (i + 1).toString();
    // Thin white halo keeps digits readable over bonds on light/dark grids.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = 3;
    ctx.strokeText(text, labelPos.x, labelPos.y);
    ctx.fillText(text, labelPos.x, labelPos.y);
  }
};
