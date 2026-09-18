/**
 * Reaction arrows, endpoint handles when selected, reagent labels, and draw ghost.
 */
import type { ReactionArrow } from '@moldraw/domain';
import { reactionArrowSupportsReagentLabels, resolveReagentFontSize } from '@moldraw/domain';
import {
  formatReagentLineForCanvas,
  getLonePairPlacements,
  lonePairSlotCountForAtom,
  moleculeCentroid,
  quadraticControlAwayFromCentroid,
  resolveReactionArrowGeometry,
  LONE_PAIR_DOT_R_PX,
  LONE_PAIR_DOT_SEP_PX,
} from '@moldraw/core';
import {
  buildReactionArrowFromDrag,
  drawReactionArrowShape,
  listReactionArrowEditHandles,
  reactionArrowAfterDelta,
  reactionArrowEndpointResizePatch,
  reactionArrowReagentLabelAnchor,
  reactionArrowReagentSlotPositions,
} from '../geometry';
import type { RenderContext } from './types';

const ENDPOINT_HANDLE_R = 11;

const highlightAccent = (R: RenderContext): string =>
  R.structureTheme.transformAccent ?? '#2dd4bf';

const arrowWithDragPreview = (arr: ReactionArrow, R: RenderContext): ReactionArrow => {
  const d = R.dragAction;
  if (d?.type === 'move_reaction_arrow' && d.arrowId === arr.id) {
    const odx = d.currentX - d.startX;
    const ody = d.currentY - d.startY;
    return reactionArrowAfterDelta(d.origArrow, odx, ody);
  }
  if (d?.type === 'resize_reaction_arrow' && d.arrowId === arr.id) {
    const odx = d.currentX - d.startX;
    const ody = d.currentY - d.startY;
    return {
      ...d.origArrow,
      ...reactionArrowEndpointResizePatch(d.origArrow, d.endpoint, odx, ody, {
        vertexIndex: d.vertexIndex,
      }),
    } as ReactionArrow;
  }
  return arr;
};

const drawEditHandles = (
  ctx: CanvasRenderingContext2D,
  a: ReactionArrow,
  R: RenderContext,
): void => {
  const vz = R.viewport.zoom;
  const lw = 1.5 / vz;
  const r = ENDPOINT_HANDLE_R / vz;
  ctx.save();
  ctx.setLineDash([]);
  for (const h of listReactionArrowEditHandles(a)) {
    ctx.beginPath();
    ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = highlightAccent(R);
    ctx.lineWidth = lw;
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
};

const drawReagentLabels = (ctx: CanvasRenderingContext2D, a: ReactionArrow, R: RenderContext): void => {
  if (!a.reagentAbove?.trim() && !a.reagentBelow?.trim()) return;
  const { mx, my, nx, ny, angle: labelAngle } = reactionArrowReagentLabelAnchor(a);
  const weight = a.reagentFontWeight === 'bold' ? 700 : 500;

  ctx.save();
  ctx.fillStyle = a.reagentColor ?? R.structureTheme.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const fmt = a.reagentFormat;
  const drawStack = (lines: string[], sign: 1 | -1, fs: number) => {
    const lineGap = fs * 1.18;
    const baseOff = 18 + fs * 0.45;
    ctx.font = `${weight} ${fs}px system-ui, sans-serif`;
    lines.forEach((line, li) => {
      const display = formatReagentLineForCanvas(line, fmt);
      const off = baseOff + li * lineGap;
      const px = mx + sign * nx * off;
      const py = my + sign * ny * off;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(labelAngle);
      ctx.fillText(display, 0, 0);
      ctx.restore();
    });
  };

  if (a.reagentAbove?.trim()) {
    drawStack(
      a.reagentAbove.split('\n').map(s => s.trim()).filter(Boolean),
      1,
      resolveReagentFontSize(a, 'above'),
    );
  }
  if (a.reagentBelow?.trim()) {
    drawStack(
      a.reagentBelow.split('\n').map(s => s.trim()).filter(Boolean),
      -1,
      resolveReagentFontSize(a, 'below'),
    );
  }
  ctx.restore();
};

const drawReagentSlotChips = (
  ctx: CanvasRenderingContext2D,
  a: ReactionArrow,
  R: RenderContext,
): void => {
  if (!reactionArrowSupportsReagentLabels(a.kind)) return;
  const slots = reactionArrowReagentSlotPositions(a);
  const vz = R.viewport.zoom;
  const r = 10 / vz;
  const lw = 1.5 / vz;
  const accent = highlightAccent(R);

  ctx.save();
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  for (const slot of ['above', 'below'] as const) {
    const { x, y } = slots[slot];
    const hasText =
      slot === 'above' ? Boolean(a.reagentAbove?.trim()) : Boolean(a.reagentBelow?.trim());
    if (hasText) continue;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = lw;
    ctx.fill();
    ctx.stroke();
    const arm = r * 0.42;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2 / vz;
    ctx.beginPath();
    ctx.moveTo(x - arm, y);
    ctx.lineTo(x + arm, y);
    ctx.moveTo(x, y - arm);
    ctx.lineTo(x, y + arm);
    ctx.stroke();
  }
  ctx.restore();
};

export const drawReactionArrows = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const mol = R.renderedMolecule;
  (mol.reactionArrows ?? []).forEach(arr => {
    const previewed = arrowWithDragPreview(arr, R);
    const resizing =
      R.dragAction?.type === 'resize_reaction_arrow' && R.dragAction.arrowId === arr.id;
    // While dragging a handle, keep the live preview — do not re-resolve from
    // chemistry anchors (that would pin the dots and ignore the pointer).
    const drawn = resizing ? previewed : resolveReactionArrowGeometry(mol, previewed);
    const isSelected =
      (R.selectedReactionArrowIds?.includes(arr.id) ?? false) ||
      R.selectedReactionArrowId === arr.id;
    const col = isSelected ? highlightAccent(R) : R.structureTheme.ink;
    const lw = isSelected ? 2.25 : 2;
    drawReactionArrowShape(ctx, drawn, { color: col, lineWidth: drawn.strokeWidth ?? lw });
    if (drawn.reagentAbove?.trim() || drawn.reagentBelow?.trim()) {
      drawReagentLabels(ctx, drawn, R);
    }
    if (isSelected) {
      drawEditHandles(ctx, drawn, R);
      drawReagentSlotChips(ctx, drawn, R);
    }
  });
};

/**
 * In-progress drag ghost — must paint on the overlay layer so structure-cache
 * reuse during drag still shows a live preview.
 */
const drawImplicitLonePairLoci = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const ink = R.structureTheme.ink;
  const mol = R.renderedMolecule;
  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.fillStyle = ink;
  for (const atom of mol.atoms) {
    const drawn = atom.lonePairs ?? 0;
    const slots = lonePairSlotCountForAtom(mol, atom);
    if (slots <= drawn) continue;
    const placements = getLonePairPlacements(atom, mol, slots, {
      preferSide: atom.lonePairSide ?? 'above',
    });
    const sep = LONE_PAIR_DOT_SEP_PX;
    const r = LONE_PAIR_DOT_R_PX * 0.92;
    for (let i = drawn; i < placements.length; i++) {
      const p = placements[i];
      if (!p) continue;
      const cx = atom.x + p.dir.x * p.dist;
      const cy = atom.y + p.dir.y * p.dist;
      const nx = -p.dir.y;
      const ny = p.dir.x;
      ctx.beginPath();
      ctx.arc(cx + nx * sep, cy + ny * sep, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx - nx * sep, cy - ny * sep, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
};

export const drawReactionArrowGhost = (
  ctx: CanvasRenderingContext2D,
  R: RenderContext,
): void => {
  const showLoci =
    R.activeTool === 'reaction_arrow' &&
    (R.reactionArrowKind === 'electron_flow' || R.drawingReactionArrow?.kind === 'electron_flow');
  if (showLoci) drawImplicitLonePairLoci(ctx, R);

  if (!R.drawingReactionArrow) return;
  const d = R.drawingReactionArrow;
  const vz = R.viewport.zoom;
  const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);

  const drawSnapHint = (x: number, y: number) => {
    const r = 7.5 / vz;
    const ink = R.structureTheme.ink;
    ctx.save();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.6 / vz;
    ctx.globalAlpha = 0.9;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 2.4 / vz, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.globalAlpha = 1;
    ctx.fill();
    ctx.restore();
  };

  // Parked first click: show the start handle so the user knows to click the end.
  if (len < 6) {
    const r = ENDPOINT_HANDLE_R / vz;
    ctx.save();
    ctx.beginPath();
    ctx.arc(d.x1, d.y1, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = highlightAccent(R);
    ctx.lineWidth = 1.5 / vz;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (d.fromSnapKind) drawSnapHint(d.x1, d.y1);
    return;
  }
  let ghost = buildReactionArrowFromDrag(d, '_ghost');
  if (d.kind === 'electron_flow') {
    const centroid = moleculeCentroid(R.renderedMolecule);
    const ctrl = quadraticControlAwayFromCentroid(d.x1, d.y1, d.x2, d.y2, centroid);
    ghost = {
      ...ghost,
      ...ctrl,
      headStyle: d.headStyle ?? 'pair',
      tailStyle: d.tailStyle ?? 'none',
      headScale: d.headScale ?? 0.72,
    };
    if (d.fromAnchor || d.toAnchor) {
      ghost = resolveReactionArrowGeometry(R.renderedMolecule, ghost);
    }
  }
  ctx.save();
  ctx.globalAlpha = 0.55;
  drawReactionArrowShape(ctx, ghost, {
    color: R.structureTheme.ink,
    lineWidth: 2,
    dashedGhost: true,
  });
  ctx.restore();
  if (d.fromSnapKind) drawSnapHint(ghost.x1, ghost.y1);
  if (d.toSnapKind) drawSnapHint(ghost.x2, ghost.y2);
};
