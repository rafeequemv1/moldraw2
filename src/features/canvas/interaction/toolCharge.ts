import { getMaxLonePairsForAtom } from '@moldraw/domain';
import { pickAtomAt } from './hitTest';
import type { InteractionContext } from './types';

/**
 * Charge / lone-pair tools: each pointer-down increments or decrements a
 * single property on the clicked atom.
 *
 *   charge_plus   → onUpdateAtomCharge(+1)
 *   charge_minus  → onUpdateAtomCharge(-1)
 *   lone_pair     → onUpdateAtomLonePairs(+1) up to the element's lone-pair cap
 *
 * Hitting the lone-pair cap flashes the atom red instead of mutating.
 */
export const chargeToolMouseDown = (ctx: InteractionContext): boolean => {
  const { e, worldPos, activeTool, molecule } = ctx;
  if (e.button !== 0) return false;
  const atom = pickAtomAt(molecule, worldPos);
  if (!atom) return true;

  if (activeTool === 'charge_plus' && ctx.onUpdateAtomCharge) {
    ctx.onUpdateAtomCharge(atom.id, 1);
    return true;
  }
  if (activeTool === 'charge_minus' && ctx.onUpdateAtomCharge) {
    ctx.onUpdateAtomCharge(atom.id, -1);
    return true;
  }
  if (activeTool === 'lone_pair' && ctx.onUpdateAtomLonePairs) {
    const bondOrderSum = molecule.bonds
      .filter(b => b.fromAtomId === atom.id || b.toAtomId === atom.id)
      .reduce((sum, b) => sum + b.order, 0);
    const maxLP = getMaxLonePairsForAtom(atom.element, atom.charge, bondOrderSum);
    const current = atom.lonePairs ?? 0;
    if (current < maxLP) {
      ctx.onUpdateAtomLonePairs(atom.id, 1);
    } else {
      ctx.flashAtomError(atom.id);
    }
    return true;
  }

  return true;
};
