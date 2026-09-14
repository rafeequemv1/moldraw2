import { pickAtomAt } from './hitTest';
import type { InteractionContext } from './types';

/**
 * Atom-label tool (ChemDraw-style):
 * - Click an atom → rename / set alias inline.
 * - Click empty canvas → place a carbon and open the alias editor immediately
 *   so typing e.g. CH3OH creates a labeled molecule (digits render as subscripts).
 */
export const atomLabelToolMouseDown = (ctx: InteractionContext): boolean => {
  const { e, worldPos, molecule, onRequestAtomAliasEdit, onAddAtom } = ctx;
  if (e.button !== 0) return false;

  const atom = pickAtomAt(molecule, worldPos, ctx.hit.atomHitRadius);
  if (atom) {
    onRequestAtomAliasEdit?.(atom.id);
    return true;
  }

  // Empty canvas: place C and start typing straight away.
  if (!onAddAtom || !onRequestAtomAliasEdit) return true;
  const id = Math.random().toString(36).substr(2, 9);
  ctx.setSelectedAtomIds?.([id]);
  ctx.setSelectedBondIds?.([]);
  ctx.setSelectedCanvasTextId?.(null);
  ctx.setSelectedReactionArrowId?.(null);
  ctx.setSelectedCanvasImageId?.(null);
  ctx.setSelectedSruBracketId?.(null);
  onAddAtom({
    id,
    element: 'C',
    x: worldPos.x,
    y: worldPos.y,
    charge: 0,
  });
  onRequestAtomAliasEdit(id);
  return true;
};
