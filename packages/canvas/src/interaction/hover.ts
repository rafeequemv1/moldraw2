import {
  functionalGroupAtomIds,
  getMoleculeRevisionCache,
  getSpatialGridForMolecule,
  pointSegDist,
  queryAtomIdsNear,
  sharedFunctionalGroupAtomIds,
} from '../geometry';
import type { InteractionContext } from './types';

const ATOM_BIAS = 6;

/**
 * Hover outline is local: the atom, a recognized functional group (OH, NH,
 * COOH, …), or a single bond — not the whole connected molecule.
 */
export const updateCanvasHover = (ctx: InteractionContext): void => {
  const {
    worldPos,
    molecule,
    drawingBond,
    drawingChain,
    drawingStroke,
    drawingReactionArrow,
    drawingCanvasShape,
  } = ctx;

  const hasActiveDraw = !!(
    drawingBond ||
    drawingChain ||
    drawingStroke ||
    drawingReactionArrow ||
    drawingCanvasShape
  );
  if (hasActiveDraw) {
    ctx.setHoveredAtomCircleId(null);
    ctx.setHoveredBondHighlightId(null);
    ctx.setHoveredComponentIds([]);
    return;
  }

  // Profile-aware radii: a fingertip needs a much larger halo than a mouse.
  const HOVER_ATOM_RADIUS = ctx.hit.hoverAtomRadius;
  const HOVER_BOND_RADIUS = ctx.hit.hoverBondRadius;

  const cache = getMoleculeRevisionCache(molecule);
  const grid = getSpatialGridForMolecule(molecule, cache.atomById);
  const nearAtomIds = queryAtomIdsNear(grid, worldPos, HOVER_ATOM_RADIUS);

  let bestAtom: { id: string; d: number } | null = null;
  for (const id of nearAtomIds) {
    const a = cache.atomById.get(id);
    if (!a) continue;
    const d = Math.hypot(a.x - worldPos.x, a.y - worldPos.y);
    if (d <= HOVER_ATOM_RADIUS && (!bestAtom || d < bestAtom.d)) bestAtom = { id: a.id, d };
  }

  const nearBondPad = queryAtomIdsNear(grid, worldPos, HOVER_BOND_RADIUS + 40);
  const nearSet = new Set(nearBondPad);
  let bestBond: { id: string; d: number } | null = null;
  const bonds =
    nearSet.size > 0 && molecule.bonds.length > 64
      ? molecule.bonds.filter(b => nearSet.has(b.fromAtomId) || nearSet.has(b.toAtomId))
      : molecule.bonds;
  for (const b of bonds) {
    const a1 = cache.atomById.get(b.fromAtomId);
    const a2 = cache.atomById.get(b.toAtomId);
    if (!a1 || !a2) continue;
    const d = pointSegDist(worldPos.x, worldPos.y, a1.x, a1.y, a2.x, a2.y);
    if (d <= HOVER_BOND_RADIUS && (!bestBond || d < bestBond.d)) bestBond = { id: b.id, d };
  }

  const atomD = bestAtom?.d ?? Infinity;
  const bondD = bestBond?.d ?? Infinity;
  if (bestAtom && (bondD === Infinity || atomD <= bondD + ATOM_BIAS)) {
    ctx.setHoveredAtomCircleId(bestAtom.id);
    ctx.setHoveredBondHighlightId(null);
    ctx.setHoveredComponentIds(functionalGroupAtomIds(molecule, bestAtom.id));
    return;
  }

  ctx.setHoveredAtomCircleId(null);
  if (!bestBond) {
    ctx.setHoveredBondHighlightId(null);
    ctx.setHoveredComponentIds([]);
    return;
  }

  const bond = cache.bondById.get(bestBond.id);
  const group = bond
    ? sharedFunctionalGroupAtomIds(molecule, bond.fromAtomId, bond.toAtomId)
    : null;
  if (group) {
    ctx.setHoveredBondHighlightId(null);
    ctx.setHoveredComponentIds(group);
  } else {
    ctx.setHoveredBondHighlightId(bestBond.id);
    ctx.setHoveredComponentIds([]);
  }
};
