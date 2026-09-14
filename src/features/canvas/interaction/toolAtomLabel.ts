import { pickAtomAt } from './hitTest';
import type { InteractionContext } from './types';

/**
 * Atom-label tool: pointer-down on an atom requests an inline rename in the
 * parent (App owns the editor overlay). No-op if pointer misses an atom.
 */
export const atomLabelToolMouseDown = (ctx: InteractionContext): boolean => {
  const { e, worldPos, molecule, onRequestAtomAliasEdit } = ctx;
  if (e.button !== 0) return false;
  const atom = pickAtomAt(molecule, worldPos);
  if (atom && onRequestAtomAliasEdit) {
    onRequestAtomAliasEdit(atom.id);
  }
  return true;
};
