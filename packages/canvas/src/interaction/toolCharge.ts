import { canApplyFormalChargeDelta, getMaxLonePairsForAtom } from '@moldraw/domain';
import type { Atom } from '@moldraw/domain';
import { pickAtomAt } from './hitTest';
import type { InteractionContext } from './types';

const PLACE_DRAG_THRESHOLD = 1.5;

/**
 * After placing a ± / δ± mark: click leaves the default seat; click-drag moves
 * the mark with the pointer and commits on release.
 */
function beginPlaceChargeMarkDrag(
  ctx: InteractionContext,
  atom: Atom,
  kind: 'formal' | 'delta',
  _markValue: number,
): void {
  ctx.setSelectedAtomIds?.([]);
  ctx.setSelectedBondIds?.([]);
  ctx.setSelectedChargeAtomIds?.([atom.id]);
  ctx.setSelectedChargeMarkKind?.(kind);
  // Orbit drag: seat is the atom center; click keeps default, drag places on the ring.
  ctx.setDragAction({
    type: 'move_charge_mark',
    atomId: atom.id,
    kind,
    startX: ctx.worldPos.x,
    startY: ctx.worldPos.y,
    currentX: ctx.worldPos.x,
    currentY: ctx.worldPos.y,
    origOffsetX: 0,
    origOffsetY: 0,
    seatAnchorX: atom.x,
    seatAnchorY: atom.y,
    placeDragThreshold: PLACE_DRAG_THRESHOLD,
  });
}

/**
 * Charge / lone-pair / free-radical / δ / add-explicit-H tools.
 *
 *   charge_plus / charge_minus → ±1 per click (stack within valency); drag to place
 *   delta_plus / delta_minus → set δ± (toggle off if same); drag to place
 *   lone_pair / free_radical / add_explicit_h → click only
 */
export const chargeToolMouseDown = (ctx: InteractionContext): boolean => {
  const { e, worldPos, activeTool, molecule } = ctx;
  if (e.button !== 0) return false;

  const atom = pickAtomAt(molecule, worldPos, ctx.hit.atomHitRadius);
  if (!atom) return true;

  if (activeTool === 'oplus' || activeTool === 'ominus') {
    if (!ctx.onSetAtomCharge) return true;
    const want = activeTool === 'oplus' ? 1 : -1;
    const cur = atom.charge ?? 0;
    const circled = atom.chargeMarkStyle === 'circled';
    if (cur === want && circled) {
      ctx.onSetAtomCharge(atom.id, 0);
      ctx.setSelectedChargeAtomIds?.([]);
      ctx.setSelectedChargeMarkKind?.(null);
      return true;
    }
    const bondSum = molecule.bonds
      .filter(b => b.fromAtomId === atom.id || b.toAtomId === atom.id)
      .reduce((sum, b) => sum + b.order, 0);
    if (!canApplyFormalChargeDelta(atom.element, cur, want - cur, bondSum)) {
      ctx.flashAtomError(atom.id);
      return true;
    }
    ctx.onSetAtomCharge(atom.id, want, 'circled');
    beginPlaceChargeMarkDrag(ctx, atom, 'formal', want);
    return true;
  }

  if (activeTool === 'delta_plus' || activeTool === 'delta_minus') {
    if (!ctx.onSetAtomDeltaCharge) return true;
    const want = activeTool === 'delta_plus' ? 1 : -1;
    const cur = atom.deltaCharge ?? 0;
    if (cur === want) {
      // Toggle off — no place-drag.
      ctx.onSetAtomDeltaCharge(atom.id, 0);
      ctx.setSelectedChargeAtomIds?.([]);
      ctx.setSelectedChargeMarkKind?.(null);
      return true;
    }
    ctx.onSetAtomDeltaCharge(atom.id, want);
    beginPlaceChargeMarkDrag(ctx, atom, 'delta', want);
    return true;
  }

  if (activeTool === 'charge_plus' && ctx.onUpdateAtomCharge) {
    const bondSum = molecule.bonds
      .filter(b => b.fromAtomId === atom.id || b.toAtomId === atom.id)
      .reduce((sum, b) => sum + b.order, 0);
    if (!canApplyFormalChargeDelta(atom.element, atom.charge ?? 0, 1, bondSum)) {
      ctx.flashAtomError(atom.id);
    } else {
      ctx.onUpdateAtomCharge(atom.id, 1);
      beginPlaceChargeMarkDrag(ctx, atom, 'formal', (atom.charge ?? 0) + 1);
    }
    return true;
  }
  if (activeTool === 'charge_minus' && ctx.onUpdateAtomCharge) {
    const bondSum = molecule.bonds
      .filter(b => b.fromAtomId === atom.id || b.toAtomId === atom.id)
      .reduce((sum, b) => sum + b.order, 0);
    if (!canApplyFormalChargeDelta(atom.element, atom.charge ?? 0, -1, bondSum)) {
      ctx.flashAtomError(atom.id);
    } else {
      ctx.onUpdateAtomCharge(atom.id, -1);
      beginPlaceChargeMarkDrag(ctx, atom, 'formal', (atom.charge ?? 0) - 1);
    }
    return true;
  }
  if (activeTool === 'add_explicit_h' && ctx.onAddExplicitHydrogen) {
    if (atom.element === 'H' || !ctx.onAddExplicitHydrogen(atom.id)) {
      ctx.flashAtomError(atom.id);
    }
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
  if (activeTool === 'free_radical' && ctx.onSetAtomRadical) {
    const next = (atom.radical ?? 0) > 0 ? 0 : 1;
    ctx.onSetAtomRadical(atom.id, next);
    return true;
  }
  if (
    (activeTool === 'radical_cation' || activeTool === 'radical_anion') &&
    ctx.onSetAtomRadicalIon
  ) {
    const wantCharge = activeTool === 'radical_cation' ? 1 : -1;
    const curCharge = atom.charge ?? 0;
    const curRad = atom.radical ?? 0;
    if (curCharge === wantCharge && curRad > 0) {
      ctx.onSetAtomRadicalIon(atom.id, 0, 0);
    } else {
      ctx.onSetAtomRadicalIon(atom.id, wantCharge, 1);
      beginPlaceChargeMarkDrag(ctx, atom, 'formal', wantCharge);
    }
    return true;
  }

  return true;
};
