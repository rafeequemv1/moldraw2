/**
 * After circular / hex array, group the resulting fragments into an Objects collection.
 * Group / ungroup helpers for the canvas context menu.
 */
import type { Molecule } from '@moldraw/domain';
import {
  createObjectCollection,
  deleteObjectCollection,
  reconcileObjectOutline,
  setObjectCollectionCollapsed,
  setObjectOutlineParent,
} from './objectOutline';
import {
  ensureFragmentIds,
  fragmentIdsForAtomIds,
  fragmentOutlineKey,
  parseFragmentOutlineKey,
} from './fragmentIds';
import {
  expandAtomIdsToInstanceArrays,
  expandInstanceArrays,
  hasInstanceArrays,
} from './instanceArrays';

export function collectAtomsAsObjectCollection(
  mol: Molecule,
  atomIds: string[],
  name: string,
): Molecule {
  if (atomIds.length === 0) return mol;
  let next = ensureFragmentIds(mol);
  const fids = fragmentIdsForAtomIds(next, atomIds);
  if (fids.length === 0) return next;

  const outline = reconcileObjectOutline(next);
  let collectionId =
    fids.map(fid => outline.parent?.[fragmentOutlineKey(fid)]).find(Boolean) ?? null;
  if (!collectionId || !outline.collections.some(c => c.id === collectionId)) {
    const created = createObjectCollection(next, { name });
    next = created.molecule;
    collectionId = created.collectionId;
  }
  for (const fid of fids) {
    next = setObjectOutlineParent(next, fragmentOutlineKey(fid), collectionId);
  }
  return next;
}

/**
 * Group canvas shapes into one Objects-panel collection (e.g. COF schematic).
 * Collapsed by default so the framework counts as a single object.
 */
export function collectShapesAsObjectCollection(
  mol: Molecule,
  shapeIds: string[],
  name: string,
): Molecule {
  if (shapeIds.length === 0) return mol;
  const keys = shapeIds.map(id => `shape:${id}`);
  const outline0 = reconcileObjectOutline(mol);
  let collectionId =
    keys.map(k => outline0.parent?.[k]).find(Boolean) ?? null;
  let next = mol;
  if (!collectionId || !outline0.collections.some(c => c.id === collectionId)) {
    const created = createObjectCollection(next, { name, collapsed: true });
    next = created.molecule;
    collectionId = created.collectionId;
  } else {
    next = setObjectCollectionCollapsed(next, collectionId, true);
  }
  for (const key of keys) {
    next = setObjectOutlineParent(next, key, collectionId);
  }
  return next;
}

/** Shape ids that share an Objects collection with `shapeId` (includes itself). */
export function siblingShapeIdsInCollection(mol: Molecule, shapeId: string): string[] {
  const key = `shape:${shapeId}`;
  const outline = reconcileObjectOutline(mol);
  const colId = outline.parent?.[key];
  if (!colId) return [shapeId];
  const ids: string[] = [];
  for (const [k, p] of Object.entries(outline.parent ?? {})) {
    if (p !== colId || !k.startsWith('shape:')) continue;
    ids.push(k.slice('shape:'.length));
  }
  return ids.length > 0 ? ids : [shapeId];
}

/** Group selected fragments into a new Objects collection. */
export function groupAtomsAsObjectCollection(
  mol: Molecule,
  atomIds: string[],
  name = 'Group',
): Molecule {
  return collectAtomsAsObjectCollection(mol, atomIds, name);
}

/**
 * Ungroup selected fragments: expand any InstanceArrays first so copies become
 * real molecules, then clear collection parenting. Empty collections are removed.
 */
export function ungroupAtomsFromObjectCollections(mol: Molecule, atomIds: string[]): Molecule {
  if (atomIds.length === 0) return mol;
  const extraSeed: string[] = [];
  for (const arr of mol.instanceArrays ?? []) {
    const touches =
      arr.seedAtomIds.some(id => atomIds.includes(id)) ||
      arr.dendrimer?.coreAtomIds.some(id => atomIds.includes(id)) ||
      atomIds.some(id => id.startsWith(`ia:${arr.id}:`));
    if (touches) {
      extraSeed.push(...arr.seedAtomIds);
      extraSeed.push(...(arr.dendrimer?.coreAtomIds ?? []));
    }
  }
  const targetIds = extraSeed.length > 0 ? [...atomIds, ...extraSeed] : atomIds;
  let next = hasInstanceArrays(mol) ? expandInstanceArrays(mol) : mol;
  next = ensureFragmentIds(next);
  const fids = fragmentIdsForAtomIds(next, targetIds);
  if (fids.length === 0) return next;

  const outline = reconcileObjectOutline(next);
  const touchedCollections = new Set<string>();
  for (const fid of fids) {
    const key = fragmentOutlineKey(fid);
    const col = outline.parent?.[key];
    if (col) touchedCollections.add(col);
    next = setObjectOutlineParent(next, key, null);
  }

  for (const colId of touchedCollections) {
    const o = reconcileObjectOutline(next);
    const stillHasChild = Object.values(o.parent ?? {}).some(p => p === colId);
    if (!stillHasChild) {
      next = deleteObjectCollection(next, colId);
    }
  }
  return next;
}

/** True when any selected fragment sits inside an Objects collection. */
export function selectionIsGrouped(mol: Molecule, atomIds: string[]): boolean {
  if (atomIds.length === 0) return false;
  if (
    mol.instanceArrays?.some(
      a =>
        a.seedAtomIds.some(id => atomIds.includes(id)) ||
        a.dendrimer?.coreAtomIds.some(id => atomIds.includes(id)) ||
        atomIds.some(id => id.startsWith(`ia:${a.id}:`)),
    )
  ) {
    return true;
  }
  const ensured = ensureFragmentIds(mol);
  const outline = reconcileObjectOutline(ensured);
  const fids = fragmentIdsForAtomIds(ensured, atomIds);
  return fids.some(fid => Boolean(outline.parent?.[fragmentOutlineKey(fid)]));
}

/**
 * If any seed atom belongs to an Objects collection (Pattern / Group), include
 * every atom in every fragment of those collections so the group moves as one.
 */
export function expandAtomIdsToObjectCollections(mol: Molecule, atomIds: string[]): string[] {
  if (atomIds.length === 0) return [];
  const instanced = expandAtomIdsToInstanceArrays(mol, atomIds);
  const seeds = instanced.length > 0 ? instanced : atomIds;
  const ensured = ensureFragmentIds(mol);
  const outline = reconcileObjectOutline(ensured);
  const map = ensured.fragmentByAtomId ?? {};
  const collectionIds = new Set<string>();
  for (const id of seeds) {
    const fid = map[id];
    if (!fid) continue;
    const col = outline.parent?.[fragmentOutlineKey(fid)];
    if (col) collectionIds.add(col);
  }
  if (collectionIds.size === 0) return [...seeds];

  const wantFids = new Set<string>();
  for (const [key, col] of Object.entries(outline.parent ?? {})) {
    if (!collectionIds.has(col)) continue;
    const fid = parseFragmentOutlineKey(key);
    if (fid) wantFids.add(fid);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of ensured.atoms) {
    const fid = map[a.id];
    if (!fid || !wantFids.has(fid) || seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a.id);
  }
  for (const id of seeds) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Remove InstanceArrays whose seed overlaps `seedAtomIds`, then delete `replaceAtomIds`. */
export function stripPatternPreviewState(
  mol: Molecule,
  seedAtomIds: string[],
  replaceAtomIds: string[] | undefined,
  deleteAtoms: (m: Molecule, ids: string[]) => Molecule,
): Molecule {
  const seedSet = new Set(seedAtomIds);
  let next = mol;
  if (next.instanceArrays?.length) {
    const kept = next.instanceArrays.filter(
      a => !a.seedAtomIds.some(id => seedSet.has(id)),
    );
    if (kept.length !== next.instanceArrays.length) {
      next = { ...next };
      if (kept.length === 0) delete next.instanceArrays;
      else next.instanceArrays = kept;
    }
  }
  const toDelete = (replaceAtomIds ?? []).filter(id => !seedSet.has(id) && next.atoms.some(a => a.id === id));
  if (toDelete.length > 0) {
    next = deleteAtoms(next, toDelete);
  }
  return next;
}

/** After optional InstanceArray expand, collect seed + newly created atom ids. */
export function resolveArrayAtomIds(
  before: Molecule,
  after: Molecule,
  seedAtomIds: string[],
  reportedNewIds: string[],
): { newAtomIds: string[]; allAtomIds: string[] } {
  if (reportedNewIds.length > 0) {
    return {
      newAtomIds: reportedNewIds,
      allAtomIds: [...seedAtomIds, ...reportedNewIds],
    };
  }
  const beforeIds = new Set(before.atoms.map(a => a.id));
  const newAtomIds = after.atoms.filter(a => !beforeIds.has(a.id)).map(a => a.id);
  return {
    newAtomIds,
    allAtomIds: [...seedAtomIds, ...newAtomIds],
  };
}
