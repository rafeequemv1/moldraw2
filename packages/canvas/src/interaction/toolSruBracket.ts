/**
 * Polymer SRU bracket tool: drag a box over ≥2 atoms to wrap them in ChemDraw-style
 * brackets, or click (no drag) when a selection of ≥2 atoms already exists.
 * Click an existing bracket (or its subscript) to select / edit.
 */
import { pickAtomAt } from './hitTest';
import { pickSruBracketAt } from '../geometry/sruBracket';
import { updateActiveDragAction } from './toolSelect';
import type { InteractionContext } from './types';

const BOX_DRAG_THRESHOLD = 4;

export const sruBracketToolMouseDown = (ctx: InteractionContext): boolean => {
  if (ctx.e.button !== 0) return false;
  const { worldPos, molecule } = ctx;

  const sruHit = pickSruBracketAt(molecule.sruBrackets, worldPos.x, worldPos.y);
  if (sruHit && (ctx.setSelectedSruBracketId || ctx.setSelectedAtomIds)) {
    const already = ctx.selectedSruBracketId === sruHit.bracket.id;
    ctx.setSelectedSruBracketId?.(sruHit.bracket.id);
    ctx.setSelectedCanvasTextId?.(null);
    ctx.setSelectedReactionArrowId?.(null);
    ctx.setSelectedCanvasImageId?.(null);
    ctx.setSelectedBondIds?.([]);
    ctx.setSelectedAtomIds?.(sruHit.bracket.atomIds);
    if (sruHit.onLabel && already) {
      ctx.onEditSruBracketSubscript?.(sruHit.bracket.id);
    }
    ctx.setMouseDownPos({ x: ctx.e.clientX, y: ctx.e.clientY });
    return true;
  }

  // Optional: click an atom to seed selection (Shift adds).
  const hitAtom = pickAtomAt(molecule, worldPos, ctx.hit.atomHitRadius);
  if (hitAtom && ctx.e.shiftKey && ctx.setSelectedAtomIds) {
    const set = new Set(ctx.selectedAtomIds);
    if (set.has(hitAtom.id)) set.delete(hitAtom.id);
    else set.add(hitAtom.id);
    ctx.setSelectedAtomIds([...set]);
    ctx.setSelectedBondIds?.([]);
    ctx.setSelectedSruBracketId?.(null);
    ctx.setMouseDownPos({ x: ctx.e.clientX, y: ctx.e.clientY });
    return true;
  }

  ctx.setSelectedSruBracketId?.(null);
  if (!ctx.e.shiftKey) {
    ctx.setSelectedAtomIds?.([]);
    ctx.setSelectedBondIds?.([]);
  }
  ctx.setSelectedCanvasTextId?.(null);
  ctx.setSelectedReactionArrowId?.(null);
  ctx.setSelectedCanvasImageId?.(null);
  ctx.setDragAction({
    type: 'box_select',
    startX: worldPos.x,
    startY: worldPos.y,
    currentX: worldPos.x,
    currentY: worldPos.y,
  });
  ctx.setMouseDownPos({ x: ctx.e.clientX, y: ctx.e.clientY });
  return true;
};

export const sruBracketToolMouseMove = (ctx: InteractionContext): boolean => {
  if (ctx.activeTool !== 'sru_bracket') return false;
  return updateActiveDragAction(ctx);
};

export const sruBracketToolMouseUp = (ctx: InteractionContext): boolean => {
  if (ctx.activeTool !== 'sru_bracket') return false;
  const { dragAction, molecule, selectedAtomIds } = ctx;

  if (dragAction?.type === 'box_select') {
    const boxW = Math.abs(dragAction.currentX - dragAction.startX);
    const boxH = Math.abs(dragAction.currentY - dragAction.startY);
    const dragged = boxW > BOX_DRAG_THRESHOLD || boxH > BOX_DRAG_THRESHOLD;

    if (dragged) {
      const minX = Math.min(dragAction.startX, dragAction.currentX);
      const maxX = Math.max(dragAction.startX, dragAction.currentX);
      const minY = Math.min(dragAction.startY, dragAction.currentY);
      const maxY = Math.max(dragAction.startY, dragAction.currentY);
      const atomsInBox = molecule.atoms
        .filter(a => a.x >= minX && a.x <= maxX && a.y >= minY && a.y <= maxY)
        .map(a => a.id);
      ctx.setDragAction(null);
      if (atomsInBox.length >= 2 && ctx.onAddSruBracketAroundAtoms) {
        ctx.onAddSruBracketAroundAtoms(atomsInBox);
        return true;
      }
      if (atomsInBox.length > 0) {
        ctx.setSelectedAtomIds?.(atomsInBox);
        ctx.setSelectedBondIds?.([]);
      }
      return true;
    }

    ctx.setDragAction(null);
  }

  // Tiny click: wrap the current selection if it already has ≥2 atoms.
  if (selectedAtomIds.length >= 2 && ctx.onAddSruBracketAroundAtoms) {
    ctx.onAddSruBracketAroundAtoms(selectedAtomIds);
    return true;
  }

  return true;
};
