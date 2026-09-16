import type { Atom, Bond, Molecule } from '@moldraw/domain';
import { condensedGroupLabelForAtom } from '@moldraw/domain';
import type { Point } from '../geometry';
import {
  estimateAliasLabelAabb,
  estimateLabelTextAabb,
  getMoleculeRevisionCache,
  getSpatialGridForMolecule,
  queryAtomIdsInRect,
  queryAtomIdsNear,
} from '../geometry';
import {
  estimateChargeMarkAabb,
  estimateDeltaChargeMarkAabb,
  type DeltaChargeLabelExtents,
} from '../render/drawFormalCharge';

export const ATOM_HIT_RADIUS = 15;
/** Tight center-only radius for bond / FG / chain attach (no label grab). */
export const ATOM_ATTACH_HIT_RADIUS = 12;
export const BOND_HIT_TOLERANCE = 10;

export type PickAtomOptions = {
  /**
   * When true (default), alias/condensed labels enlarge the hit target (select /
   * edit). When false, only the atom center disk counts — use for bond ends,
   * FG attach, chain roots, so nearby OH/NH/Cl labels don't steal the snap.
   */
  includeLabels?: boolean;
};

/** Visible alias or condensed FG label (OH, NH2, CH3, …) used for hit / edit. */
export const displayGroupLabelForAtom = (a: Atom, mol: Molecule): string | null => {
  const alias = a.alias?.trim();
  if (alias) return alias;
  let bondSum = 0;
  for (const b of mol.bonds) {
    if (b.fromAtomId === a.id || b.toAtomId === a.id) bondSum += b.order;
  }
  return condensedGroupLabelForAtom(a, mol, bondSum);
};

/** Larger grab area for condensed/alias labels (e.g. CH₃OH) that extend past the atom. */
const hitRadiusForAtom = (a: Atom, mol: Molecule, base: number): number => {
  const label = displayGroupLabelForAtom(a, mol);
  if (!label) return base;
  return Math.max(base, 20 + label.length * 8);
};

/** True when pointer is over the head-anchored alias / condensed FG text box. */
const pointInGroupLabel = (a: Atom, mol: Molecule, worldPos: Point): boolean => {
  const aliasBox = estimateAliasLabelAabb(a, mol);
  if (aliasBox) {
    const pad = 4;
    if (
      worldPos.x >= aliasBox.minX - pad &&
      worldPos.x <= aliasBox.maxX + pad &&
      worldPos.y >= aliasBox.minY - pad &&
      worldPos.y <= aliasBox.maxY + pad
    ) {
      return true;
    }
  }
  const condensed = displayGroupLabelForAtom(a, mol);
  if (!condensed || a.alias?.trim()) return false;
  const box = estimateLabelTextAabb(a, condensed, mol);
  if (!box) return false;
  const pad = 4;
  return (
    worldPos.x >= box.minX - pad &&
    worldPos.x <= box.maxX + pad &&
    worldPos.y >= box.minY - pad &&
    worldPos.y <= box.maxY + pad
  );
};

/** Returns the atom whose center is within `radius` of `worldPos`, if any. */
export const pickAtomAt = (
  molecule: Molecule,
  worldPos: Point,
  radius = ATOM_HIT_RADIUS,
  opts?: PickAtomOptions,
): Atom | null => {
  const includeLabels = opts?.includeLabels !== false;
  const cache = getMoleculeRevisionCache(molecule);
  const grid = getSpatialGridForMolecule(molecule, cache.atomById);
  const queryR = Math.max(radius, includeLabels ? 120 : radius + 8);
  const candidates = queryAtomIdsNear(grid, worldPos, queryR);
  let best: Atom | null = null;
  let bestScore = Infinity;
  const consider = (a: Atom) => {
    const r = includeLabels ? hitRadiusForAtom(a, molecule, radius) : radius;
    const d = Math.hypot(a.x - worldPos.x, a.y - worldPos.y);
    const inLabel = includeLabels && pointInGroupLabel(a, molecule, worldPos);
    if (d > r && !inLabel) return;
    // Prefer closer centers; label hits count as slightly farther than center hits.
    const score = inLabel && d > r ? r + 0.5 : d;
    if (score < bestScore) {
      bestScore = score;
      best = a;
    }
  };
  for (const id of candidates) {
    const a = cache.atomById.get(id);
    if (a) consider(a);
  }
  // Fallback for empty grid / edge cells
  if (!best && molecule.atoms.length > 0) {
    for (const a of molecule.atoms) consider(a);
  }
  return best;
};

/** Center-disk only — bond / FG / chain attach must not snap via neighbor labels. */
export const pickAtomCenterAt = (
  molecule: Molecule,
  worldPos: Point,
  radius = ATOM_ATTACH_HIT_RADIUS,
): Atom | null => pickAtomAt(molecule, worldPos, radius, { includeLabels: false });

/** Rough upright-local label extents for δ± hit-testing (no canvas measure). */
const estimateDeltaLabelExtents = (a: Atom, mol: Molecule): DeltaChargeLabelExtents => {
  const label = displayGroupLabelForAtom(a, mol) ?? (a.element !== 'C' || (a.charge ?? 0) !== 0 ? a.element : null);
  const box = estimateLabelTextAabb(a, label, mol);
  if (!box) return { left: -8, right: 8 };
  return { left: box.minX - a.x, right: box.maxX - a.x };
};

export type ChargeMarkHit = { atom: Atom; kind: 'formal' | 'delta' };

/** Formal or δ± charge mark under `worldPos` (select / drag / delete). */
export const pickChargeMarkAt = (
  molecule: Molecule,
  worldPos: Point,
): ChargeMarkHit | null => {
  let best: ChargeMarkHit | null = null;
  let bestD = Infinity;
  for (const a of molecule.atoms) {
    const candidates: Array<{ kind: 'formal' | 'delta'; box: ReturnType<typeof estimateChargeMarkAabb> }> = [
      { kind: 'formal', box: estimateChargeMarkAabb(a, molecule, a.charge ?? 0) },
      {
        kind: 'delta',
        box: estimateDeltaChargeMarkAabb(
          a,
          molecule,
          a.deltaCharge ?? 0,
          a.deltaCharge ? estimateDeltaLabelExtents(a, molecule) : null,
        ),
      },
    ];
    for (const { kind, box } of candidates) {
      if (!box) continue;
      // Generous pad so clicks on the drawn mark are not stolen by atom/group drag.
      const pad = 8;
      if (
        worldPos.x < box.minX - pad ||
        worldPos.x > box.maxX + pad ||
        worldPos.y < box.minY - pad ||
        worldPos.y > box.maxY + pad
      ) {
        continue;
      }
      const cx = (box.minX + box.maxX) / 2;
      const cy = (box.minY + box.maxY) / 2;
      const d = Math.hypot(worldPos.x - cx, worldPos.y - cy);
      if (d < bestD) {
        bestD = d;
        best = { atom: a, kind };
      }
    }
  }
  return best;
};

/** @deprecated Prefer {@link pickChargeMarkAt}. */
export const pickChargeAt = (molecule: Molecule, worldPos: Point): Atom | null =>
  pickChargeMarkAt(molecule, worldPos)?.atom ?? null;

/**
 * Bond-tool pointer routing: if a click lies on a bond segment *and* inside an
 * atom disk (common on short bonds), prefer the bond when the closest point on
 * the segment is not near an endpoint — so 1→2→3 cycling hits the shaft;
 * near endpoints, atoms win so drawing from an atom still works.
 */
export function pickAtomOrBondForBondTool(
  molecule: Molecule,
  worldPos: Point,
  atomRadius = ATOM_HIT_RADIUS,
  bondTol = BOND_HIT_TOLERANCE,
  opts?: PickAtomOptions,
): { atom: Atom | null; bond: Bond | null } {
  const atom = pickAtomAt(molecule, worldPos, atomRadius, opts);
  const bond = pickBondAt(molecule, worldPos, bondTol);
  if (!bond) return { atom, bond: null };
  if (!atom) return { atom: null, bond };

  const cache = getMoleculeRevisionCache(molecule);
  const a1 = cache.atomById.get(bond.fromAtomId);
  const a2 = cache.atomById.get(bond.toAtomId);
  if (!a1 || !a2) return { atom, bond: null };

  const l2 = (a1.x - a2.x) ** 2 + (a1.y - a2.y) ** 2;
  if (l2 < 1e-12) return { atom, bond: null };

  let t = ((worldPos.x - a1.x) * (a2.x - a1.x) + (worldPos.y - a1.y) * (a2.y - a1.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const bondLen = Math.sqrt(l2);
  const distAlongFromNearestEnd = Math.min(t * bondLen, (1 - t) * bondLen);

  const endpointZonePx = Math.min(atomRadius + 3, bondLen * 0.34);

  if (distAlongFromNearestEnd <= endpointZonePx) {
    return { atom, bond: null };
  }
  return { atom: null, bond };
}

/** Returns the bond whose closest point on its segment is within `tol` of `worldPos`. */
export const pickBondAt = (
  molecule: Molecule,
  worldPos: Point,
  tol = BOND_HIT_TOLERANCE,
): Bond | null => {
  const cache = getMoleculeRevisionCache(molecule);
  const grid = getSpatialGridForMolecule(molecule, cache.atomById);
  // Bonds near pointer: candidates whose endpoints are in a padded neighborhood.
  const nearIds = new Set(queryAtomIdsNear(grid, worldPos, tol + 40));
  let best: Bond | null = null;
  let bestDist = tol;
  const bonds =
    nearIds.size > 0 && molecule.bonds.length > 64
      ? molecule.bonds.filter(b => nearIds.has(b.fromAtomId) || nearIds.has(b.toAtomId))
      : molecule.bonds;
  for (const b of bonds) {
    const a1 = cache.atomById.get(b.fromAtomId);
    const a2 = cache.atomById.get(b.toAtomId);
    if (!a1 || !a2) continue;
    const l2 = (a1.x - a2.x) ** 2 + (a1.y - a2.y) ** 2;
    if (l2 === 0) continue;
    let t = ((worldPos.x - a1.x) * (a2.x - a1.x) + (worldPos.y - a1.y) * (a2.y - a1.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = a1.x + t * (a2.x - a1.x);
    const projY = a1.y + t * (a2.y - a1.y);
    const d = Math.hypot(worldPos.x - projX, worldPos.y - projY);
    if (d < bestDist) {
      bestDist = d;
      best = b;
    }
  }
  return best;
};

/**
 * Ring-tool hit routing: prefer a bond mid-shaft for side-to-side fusion.
 * Near endpoints, atoms win so "click atom + drag" still attaches via a bond.
 */
export function pickAtomOrBondForRingTool(
  molecule: Molecule,
  worldPos: Point,
  atomRadius = ATOM_HIT_RADIUS,
  bondTol = BOND_HIT_TOLERANCE + 4,
  opts?: PickAtomOptions,
): { atom: Atom | null; bond: Bond | null } {
  const atom = pickAtomAt(molecule, worldPos, atomRadius, opts);
  const bond = pickBondAt(molecule, worldPos, bondTol);
  if (!bond) return { atom, bond: null };
  if (!atom) return { atom: null, bond };

  const cache = getMoleculeRevisionCache(molecule);
  const a1 = cache.atomById.get(bond.fromAtomId);
  const a2 = cache.atomById.get(bond.toAtomId);
  if (!a1 || !a2) return { atom, bond: null };

  const l2 = (a1.x - a2.x) ** 2 + (a1.y - a2.y) ** 2;
  if (l2 < 1e-12) return { atom, bond: null };

  let t = ((worldPos.x - a1.x) * (a2.x - a1.x) + (worldPos.y - a1.y) * (a2.y - a1.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const bondLen = Math.sqrt(l2);
  const distAlongFromNearestEnd = Math.min(t * bondLen, (1 - t) * bondLen);
  // Mid-shaft → fuse on this bond; near ends → treat as atom for single-bond attach.
  const endpointZonePx = Math.min(atomRadius * 0.85, bondLen * 0.28);
  if (distAlongFromNearestEnd <= endpointZonePx) {
    return { atom, bond: null };
  }
  return { atom: null, bond };
}

/** Sum of bond orders incident on `atomId`. */
export const getAtomValency = (atomId: string, mol: Molecule): number => {
  const cache = getMoleculeRevisionCache(mol);
  return cache.valencyMap.get(atomId) ?? 0;
};

/** Atom ids inside an axis-aligned world rect (spatial-index accelerated). */
export const pickAtomIdsInRect = (
  molecule: Molecule,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): string[] => {
  const cache = getMoleculeRevisionCache(molecule);
  const grid = getSpatialGridForMolecule(molecule, cache.atomById);
  const candidates = queryAtomIdsInRect(grid, minX, minY, maxX, maxY);
  const out: string[] = [];
  for (const id of candidates) {
    const a = cache.atomById.get(id);
    if (!a) continue;
    if (a.x >= minX && a.x <= maxX && a.y >= minY && a.y <= maxY) out.push(id);
  }
  return out;
};
