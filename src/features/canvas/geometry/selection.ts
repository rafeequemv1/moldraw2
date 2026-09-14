/**
 * Selection bounding boxes, centroids, and the rotate-handle layout used by
 * the "select" tool. Also contains lasso → atom-id collection.
 */
import type { Molecule } from '@moldraw/domain';
import { pointInPolygon, type Point } from './polygons';

export type SelectionAabb = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cx: number;
  cy: number;
};

export const ROTATE_HANDLE_R = 14;
export const ROTATE_HANDLE_OFFSET = 34;
/** Move handle below the selection box (mirrors rotate on top). */
export const MOVE_HANDLE_R = 14;
export const MOVE_HANDLE_OFFSET = 34;
export const TRANSFORM_PAD = 14;
export const TRANSFORM_MIN_SPAN = 28;

/** Tight axis-aligned bbox covering all selected atoms (or null when empty). */
export const getSelectionAabb = (mol: Molecule, ids: string[]): SelectionAabb | null => {
  const set = new Set(ids);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const a of mol.atoms) {
    if (!set.has(a.id)) continue;
    minX = Math.min(minX, a.x);
    maxX = Math.max(maxX, a.x);
    minY = Math.min(minY, a.y);
    maxY = Math.max(maxY, a.y);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
};

/** Geometric centroid of selected atoms (rotation pivot). */
export const getSelectionCentroid = (
  mol: Molecule,
  ids: string[],
): { cx: number; cy: number } | null => {
  const set = new Set(ids);
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const a of mol.atoms) {
    if (!set.has(a.id)) continue;
    sx += a.x;
    sy += a.y;
    n++;
  }
  return n ? { cx: sx / n, cy: sy / n } : null;
};

export interface SelectionTransformLayout {
  boxMinX: number;
  boxMinY: number;
  boxW: number;
  boxH: number;
  /** Rotate handle (above box top-center). */
  handleX: number;
  handleY: number;
  /** Move handle (below box bottom-center). */
  moveHandleX: number;
  moveHandleY: number;
}

/** Padded selection box + rotate/move handles (shared by hit-test and draw). */
export const getSelectionTransformLayout = (
  mol: Molecule,
  ids: string[],
): SelectionTransformLayout | null => {
  const raw = getSelectionAabb(mol, ids);
  if (!raw) return null;
  let minX = raw.minX;
  let maxX = raw.maxX;
  let minY = raw.minY;
  let maxY = raw.maxY;
  const w = maxX - minX;
  const h = maxY - minY;
  if (w < TRANSFORM_MIN_SPAN) {
    const e = (TRANSFORM_MIN_SPAN - w) / 2;
    minX -= e;
    maxX += e;
  }
  if (h < TRANSFORM_MIN_SPAN) {
    const e = (TRANSFORM_MIN_SPAN - h) / 2;
    minY -= e;
    maxY += e;
  }
  const boxMinX = minX - TRANSFORM_PAD;
  const boxMinY = minY - TRANSFORM_PAD;
  const boxW = maxX - minX + TRANSFORM_PAD * 2;
  const boxH = maxY - minY + TRANSFORM_PAD * 2;
  const handleX = boxMinX + boxW / 2;
  const handleY = boxMinY - ROTATE_HANDLE_OFFSET;
  const moveHandleX = handleX;
  const moveHandleY = boxMinY + boxH + MOVE_HANDLE_OFFSET;
  return { boxMinX, boxMinY, boxW, boxH, handleX, handleY, moveHandleX, moveHandleY };
};

/** True if the world-space point lies within the rotate handle. */
export const isNearTransformRotateHandle = (
  wx: number,
  wy: number,
  mol: Molecule,
  ids: string[],
): boolean => {
  const L = getSelectionTransformLayout(mol, ids);
  if (!L) return false;
  return Math.hypot(wx - L.handleX, wy - L.handleY) <= ROTATE_HANDLE_R;
};

/** True if the world-space point lies within the move handle. */
export const isNearTransformMoveHandle = (
  wx: number,
  wy: number,
  mol: Molecule,
  ids: string[],
): boolean => {
  const L = getSelectionTransformLayout(mol, ids);
  if (!L) return false;
  return Math.hypot(wx - L.moveHandleX, wy - L.moveHandleY) <= MOVE_HANDLE_R;
};

/**
 * Atoms (and atoms whose connecting bond crosses the lasso) inside a freeform
 * lasso path. Returns IDs in arbitrary order.
 */
export const collectAtomIdsFromLasso = (mol: Molecule, path: Point[]): string[] => {
  if (path.length < 3) return [];
  const picked = new Set<string>();
  for (const a of mol.atoms) {
    if (pointInPolygon(a.x, a.y, path)) picked.add(a.id);
  }
  for (const b of mol.bonds) {
    const a1 = mol.atoms.find(x => x.id === b.fromAtomId);
    const a2 = mol.atoms.find(x => x.id === b.toAtomId);
    if (!a1 || !a2) continue;
    for (let k = 0; k <= 24; k++) {
      const t = k / 24;
      const x = a1.x + t * (a2.x - a1.x);
      const y = a1.y + t * (a2.y - a1.y);
      if (pointInPolygon(x, y, path)) {
        picked.add(a1.id);
        picked.add(a2.id);
        break;
      }
    }
  }
  return [...picked];
};

/**
 * If any atom of a bonded fragment appears in `seeds`, include every atom in
 * that fragment. Isolated atoms stay single-atom selections.
 *
 * Used for arrange / copy-SMILES / “select connected fragment” — not for the
 * primary select tool (which selects individual atoms and bonds).
 */
export const expandAtomIdsToConnectedFragments = (mol: Molecule, seeds: string[]): string[] => {
  if (seeds.length === 0) return [];
  const seedSet = new Set(seeds);
  const visited = new Set<string>();
  const adj = new Map<string, string[]>();
  for (const b of mol.bonds) {
    if (!adj.has(b.fromAtomId)) adj.set(b.fromAtomId, []);
    if (!adj.has(b.toAtomId)) adj.set(b.toAtomId, []);
    adj.get(b.fromAtomId)!.push(b.toAtomId);
    adj.get(b.toAtomId)!.push(b.fromAtomId);
  }

  const components: string[][] = [];
  for (const a of mol.atoms) {
    if (visited.has(a.id)) continue;
    const comp: string[] = [];
    const q = [a.id];
    visited.add(a.id);
    while (q.length) {
      const u = q.pop()!;
      comp.push(u);
      for (const v of adj.get(u) ?? []) {
        if (!visited.has(v)) {
          visited.add(v);
          q.push(v);
        }
      }
    }
    components.push(comp);
  }

  const out = new Set<string>();
  for (const comp of components) {
    if (comp.some(id => seedSet.has(id))) {
      for (const id of comp) out.add(id);
    }
  }
  return mol.atoms.filter(a => out.has(a.id)).map(a => a.id);
};

/**
 * Atoms that should move/rotate with the current selection: explicitly selected
 * atoms plus both endpoints of any selected bonds.
 */
export const atomIdsForSelectionTransform = (
  mol: Molecule,
  selectedAtomIds: string[],
  selectedBondIds: string[] = [],
): string[] => {
  const out = new Set(selectedAtomIds);
  if (selectedBondIds.length === 0) return [...out];
  const bondSet = new Set(selectedBondIds);
  for (const b of mol.bonds) {
    if (!bondSet.has(b.id)) continue;
    out.add(b.fromAtomId);
    out.add(b.toAtomId);
  }
  return mol.atoms.filter(a => out.has(a.id)).map(a => a.id);
};
