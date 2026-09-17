/**
 * ChemDraw-style polymer SRU brackets: left/right square brackets + subscript.
 */
import type { SruBracket } from '@moldraw/domain';
import { buildAliasDisplayRuns } from '@moldraw/domain';
import { sruBracketLabelBounds } from '../geometry/sruBracket';
import type { RenderContext } from './types';

const BRACKET_HOOK = 10;

function withDragOffset(b: SruBracket, R: RenderContext): SruBracket {
  const drag = R.dragAction;
  if (!drag || drag.type !== 'move_selection') return b;
  const moved = new Set(R.selectedAtomIds);
  if (!b.atomIds.some(id => moved.has(id))) return b;
  const dx = drag.currentX - drag.startX;
  const dy = drag.currentY - drag.startY;
  if (dx === 0 && dy === 0) return b;
  return {
    ...b,
    x1: b.x1 + dx,
    y1: b.y1 + dy,
    x2: b.x2 + dx,
    y2: b.y2 + dy,
  };
}

function drawOneBracket(
  ctx: CanvasRenderingContext2D,
  b: SruBracket,
  selected: boolean,
  zoom: number,
  defaultInk: string,
): void {
  const color = b.color ?? defaultInk;
  const lw = Math.max(1.25, 1.75 / zoom);
  const hook = Math.min(BRACKET_HOOK, (b.y2 - b.y1) * 0.25);

  ctx.save();
  ctx.strokeStyle = selected ? '#2dd4bf' : color;
  ctx.lineWidth = selected ? lw * 1.35 : lw;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  ctx.setLineDash([]);

  // Left [
  ctx.beginPath();
  ctx.moveTo(b.x1 + hook, b.y1);
  ctx.lineTo(b.x1, b.y1);
  ctx.lineTo(b.x1, b.y2);
  ctx.lineTo(b.x1 + hook, b.y2);
  ctx.stroke();

  // Right ]
  ctx.beginPath();
  ctx.moveTo(b.x2 - hook, b.y1);
  ctx.lineTo(b.x2, b.y1);
  ctx.lineTo(b.x2, b.y2);
  ctx.lineTo(b.x2 - hook, b.y2);
  ctx.stroke();

  if (selected) {
    ctx.strokeStyle = 'rgba(45, 212, 191, 0.4)';
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([4 / zoom, 3 / zoom]);
    ctx.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
    ctx.setLineDash([]);
  }

  const label = b.subscript || 'n';
  const fontSize = 14;
  const box = sruBracketLabelBounds(b);
  ctx.fillStyle = selected ? '#0d9488' : color;
  const subSize = Math.round(fontSize * 0.72);
  const runs = buildAliasDisplayRuns(label);
  let x = box.x + 4;
  const y = box.y + 4;
  for (const run of runs) {
    ctx.font =
      run.kind === 'sub'
        ? `${subSize}px "Segoe UI", system-ui, sans-serif`
        : `${fontSize}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(run.text, x, run.kind === 'sub' ? y + (fontSize - subSize) * 0.55 : y);
    x += ctx.measureText(run.text).width;
  }

  ctx.restore();
}

export const drawSruBrackets = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const list = R.molecule.sruBrackets;
  if (!list?.length) return;
  const zoom = R.viewport?.zoom ?? 1;
  for (const raw of list) {
    const b = withDragOffset(raw, R);
    const selected = R.selectedSruBracketId === raw.id;
    drawOneBracket(ctx, b, selected, zoom, R.structureTheme.ink);
  }
};
