import type { CofLattice, InstanceArraySite, Molecule } from '@moldraw/domain';
import { collectAtomsAsObjectCollection } from '../molecule/arrayCollection';
import { ensureFragmentIds } from '../molecule/fragmentIds';
import {
  parseInstanceAtomId,
  upsertInstanceArray,
  upsertInstanceArraySeeds,
} from '../molecule/instanceArrays';
import { mergeGeneratedLattice } from '../molecule/latticeMerge';
import { mergePerspectivePositions } from '../molecule/perspective3D';
import { COF_LAYER_VIEW_RAD, crystalPoseForAtoms, layerInstanceSites } from './packing3d';
import { getMofBuilder, MOF_PRESET_INFO_BY_ID, mofNodeSpacing, mofStackingForPreset } from '../mofs/registry';
import { getCofBuilder, COF_PRESET_INFO_BY_ID, cofNodeSpacing, cofStackingForPreset } from './registry';
import { withLatticeIdScope } from './rings';
import {
  COF_LAYERS_MAX,
  COF_LAYERS_MIN,
  COF_PACK_MAX,
  COF_PACK_MIN,
  type CofTopologyId,
  type GenerateCofOptions,
  type GenerateCofResult,
} from './types';

const newId = () => Math.random().toString(36).slice(2, 11);

const clampPack = (n: number) =>
  Math.max(COF_PACK_MIN, Math.min(COF_PACK_MAX, Math.round(n)));

const clampLayers = (n: number) =>
  Math.max(COF_LAYERS_MIN, Math.min(COF_LAYERS_MAX, Math.round(n)));

const pruneCofLattices = (mol: Molecule, removed: Set<string>): Molecule => {
  if (!mol.cofLattices?.length) return mol;
  const present = new Set(mol.atoms.map(a => a.id));
  const next = mol.cofLattices
    .map(lat => ({
      ...lat,
      atomIds: lat.atomIds.filter(id => !removed.has(id) && present.has(id)),
    }))
    .filter(lat => lat.atomIds.length > 0);
  if (next.length === mol.cofLattices.length && next.every((l, i) => l === mol.cofLattices![i])) {
    return mol;
  }
  return { ...mol, cofLattices: next.length ? next : undefined };
};

const stripArraysForSeeds = (mol: Molecule, seedIds: readonly string[]): Molecule => {
  if (!mol.instanceArrays?.length || seedIds.length === 0) return mol;
  const set = new Set(seedIds);
  const kept = mol.instanceArrays.filter(a => !a.seedAtomIds.some(id => set.has(id)));
  if (kept.length === mol.instanceArrays.length) return mol;
  const next: Molecule = { ...mol };
  if (kept.length === 0) delete next.instanceArrays;
  else next.instanceArrays = kept;
  return next;
};

const writeLattice = (mol: Molecule, lattice: CofLattice): Molecule => {
  const others = (mol.cofLattices ?? []).filter(l => l.id !== lattice.id);
  return { ...mol, cofLattices: [...others, lattice] };
};

const frameworkNodeSpacing = (presetId: string, bondLength: number): number =>
  mofNodeSpacing(presetId, bondLength) ?? cofNodeSpacing(presetId, bondLength);

const frameworkStacking = (presetId: string) =>
  mofStackingForPreset(presetId) ?? cofStackingForPreset(presetId);

const frameworkTopology = (presetId: string): CofTopologyId =>
  MOF_PRESET_INFO_BY_ID.get(presetId)?.topology ??
  COF_PRESET_INFO_BY_ID.get(presetId)?.topology ??
  'hexagonal-honeycomb';

const depthSites = (
  presetId: string,
  layers: number,
  bondLength: number,
): InstanceArraySite[] =>
  layerInstanceSites(
    layers,
    frameworkNodeSpacing(presetId, bondLength),
    bondLength,
    frameworkStacking(presetId),
    frameworkTopology(presetId),
  );

const existingSeedIds = (
  prev: Molecule,
  replace: string[],
  latticeId: string,
): string[] => {
  const lat = prev.cofLattices?.find(l => l.id === latticeId);
  const pool = new Set(lat?.atomIds?.length ? lat.atomIds : replace);
  const arr = prev.instanceArrays?.find(a => a.seedAtomIds.some(id => pool.has(id)));
  const present = new Set(prev.atoms.map(a => a.id));
  if (arr) return arr.seedAtomIds.filter(id => present.has(id));
  // Any single-layer baked sheet can be the depth-instance seed (not only 1×1).
  if (lat && (lat.layers ?? 1) === 1 && lat.atomIds.every(id => present.has(id))) {
    return lat.atomIds;
  }
  return [];
};

const applyLiveSeedPose = (
  mol: Molecule,
  seedIds: readonly string[],
  layers: number,
  previousAtomIds: readonly string[],
): Molecule => {
  if (layers <= 1) {
    return mergePerspectivePositions(mol, {}, [...previousAtomIds, ...seedIds]);
  }
  const idSet = new Set(seedIds);
  const atoms = mol.atoms.filter(a => idSet.has(a.id));
  const crystal = crystalPoseForAtoms(atoms, () => 0);
  return mergePerspectivePositions(mol, crystal, previousAtomIds);
};

/** Depth (D) change on an existing baked sheet: only the z-sites move. */
const attachDepthInstances = (
  mol: Molecule,
  seedIds: string[],
  options: GenerateCofOptions,
  cols: number,
  rows: number,
  layers: number,
  bondLength: number,
  latticeId: string,
  label: string,
  previousAtomIds: readonly string[],
): { molecule: Molecule; atomIds: string[] } => {
  let next = mol;
  if (layers <= 1) {
    next = stripArraysForSeeds(next, seedIds);
    next = applyLiveSeedPose(next, seedIds, 1, previousAtomIds);
  } else {
    const sites = depthSites(options.presetId, layers, bondLength);
    next = upsertInstanceArray(next, seedIds, sites, `${label} pack`).molecule;
    next = applyLiveSeedPose(next, seedIds, layers, previousAtomIds);
  }
  next = writeLattice(
    next,
    latticeRecord(latticeId, options, cols, rows, layers, bondLength, seedIds, true),
  );
  return { molecule: next, atomIds: seedIds };
};

const latticeRecord = (
  id: string,
  options: GenerateCofOptions,
  cols: number,
  rows: number,
  layers: number,
  bondLength: number,
  atomIds: string[],
  inPlaneBaked: boolean,
): CofLattice => ({
  id,
  presetId: options.presetId,
  cols,
  rows,
  layers,
  cx: options.cx,
  cy: options.cy,
  bondLengthPx: bondLength,
  atomIds,
  inPlaneBaked,
  ...(layers > 1 ? { viewRot: { x: COF_LAYER_VIEW_RAD.x, y: COF_LAYER_VIEW_RAD.y } } : {}),
});

/**
 * Generate or grow a COF / 2D-MOF lattice.
 *
 * Growth is incremental: builders emit deterministic ids (see `withLatticeIdScope`),
 * so changing H/V keeps every existing node / linker atom (same id, same
 * position), appends the new ones and drops stale outer terminals. Live scrub
 * and commit therefore produce the *same* molecule — no bake step, no jump.
 * Depth (D) is real instancing: extra layers are `ia:` copies of the sheet with
 * a crystal perspective pose, so 30k displayed atoms cost one sheet in the store.
 */
export function generateCofInMolecule(prev: Molecule, options: GenerateCofOptions): GenerateCofResult {
  const builder = getCofBuilder(options.presetId) ?? getMofBuilder(options.presetId);
  if (!builder) {
    return { molecule: prev, newAtomIds: [], allAtomIds: [], latticeId: options.latticeId ?? '' };
  }

  const cols = clampPack(options.cols);
  const rows = clampPack(options.rows);
  const layers = clampLayers(options.layers ?? 1);
  const bondLength = Math.max(16, options.bondLength);
  const info = COF_PRESET_INFO_BY_ID.get(options.presetId) ?? MOF_PRESET_INFO_BY_ID.get(options.presetId);
  const label = info?.label ?? 'COF';

  const present = new Set(prev.atoms.map(a => a.id));
  const replace = (options.replaceAtomIds ?? []).filter(id => present.has(id));
  const replaceSet = new Set(replace);
  const latticeId =
    options.latticeId ??
    prev.cofLattices?.find(l => l.atomIds.some(id => replaceSet.has(id)))?.id ??
    newId();
  const lat = prev.cofLattices?.find(l => l.id === latticeId);
  const seedIds = existingSeedIds(prev, replace, latticeId);
  const hvUnchanged = Boolean(lat && lat.cols === cols && lat.rows === rows);
  const samePreset = Boolean(lat && lat.presetId === options.presetId);
  const sameGeometry =
    Boolean(lat) &&
    Math.abs((lat!.bondLengthPx || bondLength) - bondLength) < 1e-6 &&
    Math.abs(lat!.cx - options.cx) < 1e-6 &&
    Math.abs(lat!.cy - options.cy) < 1e-6;

  // Depth-only change on a baked sheet: upsert z-sites, no chemistry work at all.
  if (seedIds.length > 0 && hvUnchanged && samePreset && sameGeometry && lat?.inPlaneBaked !== false) {
    const attached = attachDepthInstances(
      prev,
      seedIds,
      options,
      cols,
      rows,
      layers,
      bondLength,
      latticeId,
      label,
      replace,
    );
    return {
      molecule: attached.molecule,
      newAtomIds: [],
      allAtomIds: attached.atomIds,
      latticeId,
    };
  }

  // In-plane change (or first placement): deterministic sheet + incremental merge.
  // Owned atoms = the previous seed sheet (legacy 1×1-pore seeds included) plus
  // anything the caller asked us to replace; ids the builder re-emits survive.
  const owned = [...new Set([...replace, ...seedIds])];
  const sheet = withLatticeIdScope(latticeId, () =>
    builder({ cols, rows, layers: 1, bondLength, cx: options.cx, cy: options.cy }),
  );

  const merged = mergeGeneratedLattice(prev, owned, sheet);
  let next = merged.molecule;
  if (merged.removedAtomIds.length) {
    next = pruneCofLattices(next, new Set(merged.removedAtomIds));
  }

  // Depth copies follow the new seed set (array id kept → `ia:` ids stay stable).
  if (layers <= 1) {
    next = stripArraysForSeeds(next, owned);
    next = stripArraysForSeeds(next, sheet.atomIds);
    next = mergePerspectivePositions(next, {}, [...owned, ...sheet.atomIds]);
  } else {
    const sites = depthSites(options.presetId, layers, bondLength);
    next = upsertInstanceArraySeeds(next, owned, sheet.atomIds, sites, `${label} pack`).molecule;
    next = applyLiveSeedPose(next, sheet.atomIds, layers, owned);
  }

  next = writeLattice(
    next,
    latticeRecord(latticeId, options, cols, rows, layers, bondLength, sheet.atomIds, true),
  );

  if (!merged.unchanged || !lat) {
    next = ensureFragmentIds(next);
    next = collectAtomsAsObjectCollection(next, sheet.atomIds, label);
  }

  return {
    molecule: next,
    newAtomIds: merged.addedAtomIds,
    allAtomIds: sheet.atomIds,
    latticeId,
  };
}

export function cofLatticeForAtomIds(mol: Molecule, atomIds: string[]): CofLattice | undefined {
  if (!mol.cofLattices?.length || atomIds.length === 0) return undefined;
  const set = new Set(atomIds);
  return mol.cofLattices.find(l => l.atomIds.some(id => set.has(id)));
}

/**
 * Seed + instanced copies for any COF lattice (including a single sheet).
 * The 3D viewer uses this as a canvas template — no UFF / GENERATE_3D.
 */
export function cofStackAtomIds(mol: Molecule): string[] | null {
  if (!mol.cofLattices?.length) return null;
  const seed = new Set(mol.cofLattices.flatMap(l => l.atomIds));
  if (seed.size === 0) return null;
  const ids: string[] = [];
  for (const a of mol.atoms) {
    if (seed.has(a.id)) {
      ids.push(a.id);
      continue;
    }
    const p = parseInstanceAtomId(a.id);
    if (p && seed.has(p.seedAtomId)) ids.push(a.id);
  }
  return ids.length ? ids : null;
}
