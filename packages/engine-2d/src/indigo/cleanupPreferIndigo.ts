import type { Molecule, Point } from '@moldraw/domain';
import { hasLockedRingConformations } from '@moldraw/domain';
import {
  cleanupWithIndigo,
  layoutMoleculeIndigoSync,
  scaleMoleculeBonds,
} from './layoutMolecule';
import { isIndigoReady, loadIndigo } from './loadIndigo';
import type { IndigoLayoutOptions } from './layout2d';
import {
  alignCleanupCoordsPerComponent,
  listConnectedComponents,
  resolveCleanupBondLength,
} from '@moldraw/core';
import { cleanupMolecule } from '@moldraw/engine';

export interface CleanupPreferIndigoOptions {
  bondLengthPx?: number;
  /** When true, try Indigo only if native cleanup is degraded. Default false. */
  preferIndigo?: boolean;
  indigo?: IndigoLayoutOptions;
  preserveOrientation?: boolean;
}

export type CleanupPreferIndigoResult = {
  molecule: Molecule;
  source: 'indigo' | 'native';
};

const emptyExtras = {
  strokes: [] as Molecule['strokes'],
  reactionArrows: [] as Molecule['reactionArrows'],
  canvasTexts: [] as Molecule['canvasTexts'],
  ringFills: {} as NonNullable<Molecule['ringFills']>,
};

const subsetMolecule = (mol: Molecule, atomIds: ReadonlySet<string>): Molecule => ({
  atoms: mol.atoms.filter(a => atomIds.has(a.id)),
  bonds: mol.bonds.filter(b => atomIds.has(b.fromAtomId) && atomIds.has(b.toAtomId)),
  ...emptyExtras,
  ...(mol.ringConformations ? { ringConformations: mol.ringConformations } : {}),
});

const rematchLaid = (prev: Molecule, laid: Molecule): Molecule => {
  const cleanedById = new Map<string, Point>(
    laid.atoms.map(a => [a.id, { x: a.x, y: a.y }]),
  );
  return alignCleanupCoordsPerComponent(prev, cleanedById);
};

const atomIdsFromIndices = (mol: Molecule, indices?: number[]): Set<string> | undefined => {
  if (!indices?.length) return undefined;
  const heavy = mol.atoms.filter(a => a.element !== 'H' && a.element !== 'D');
  const out = new Set<string>();
  for (const i of indices) {
    const a = heavy[i];
    if (a) out.add(a.id);
  }
  return out.size > 0 ? out : undefined;
};

const runNative = (
  mol: Molecule,
  bondLen: number,
  preserveOrientation?: boolean,
  selectedAtomIds?: ReadonlySet<string>,
  forceFullRebuild?: boolean,
): CleanupPreferIndigoResult => {
  const result = cleanupMolecule(mol, {
    bondLengthPx: bondLen,
    preserveOrientation: preserveOrientation ?? true,
    selectedAtomIds,
    forceFullRebuild,
  });
  return { molecule: rematchLaid(mol, result.molecule), source: 'native' };
};

const tryIndigo = async (
  mol: Molecule,
  bondLen: number,
  indigoOpts?: IndigoLayoutOptions,
): Promise<Molecule | null> => {
  try {
    await loadIndigo();
    if (!isIndigoReady()) return null;
    const result = await cleanupWithIndigo(mol, {
      bondLengthPx: bondLen,
      mode: indigoOpts?.mode ?? 'layout',
      selectedAtomIndices: indigoOpts?.selectedAtomIndices,
    });
    return result.molecule;
  } catch {
    return null;
  }
};

const cleanupOne = async (
  subset: Molecule,
  bondLen: number,
  preferIndigo: boolean,
  indigoOpts: IndigoLayoutOptions | undefined,
  preserveOrientation: boolean | undefined,
  selectedAtomIds?: ReadonlySet<string>,
  forceFullRebuild?: boolean,
): Promise<CleanupPreferIndigoResult> => {
  const native = runNative(subset, bondLen, preserveOrientation, selectedAtomIds, forceFullRebuild);
  if (!preferIndigo || hasLockedRingConformations(subset)) return native;
  const indigoMol = await tryIndigo(subset, bondLen, indigoOpts);
  if (indigoMol) return { molecule: rematchLaid(subset, indigoMol), source: 'indigo' };
  return native;
};

const cleanupPerConnectedComponent = async (
  mol: Molecule,
  bondLen: number,
  preferIndigo: boolean,
  indigoOpts: IndigoLayoutOptions | undefined,
  preserveOrientation: boolean | undefined,
): Promise<CleanupPreferIndigoResult> => {
  const comps = listConnectedComponents(mol);
  const cleanedById = new Map<string, Point>();
  let usedIndigo = false;

  for (const compIds of comps) {
    const idSet = new Set(compIds);
    const subset = subsetMolecule(mol, idSet);
    if (subset.atoms.length < 3) {
      for (const a of subset.atoms) cleanedById.set(a.id, { x: a.x, y: a.y });
      continue;
    }
    const result = await cleanupOne(subset, bondLen, preferIndigo, indigoOpts, preserveOrientation);
    if (result.source === 'indigo') usedIndigo = true;
    for (const a of result.molecule.atoms) cleanedById.set(a.id, { x: a.x, y: a.y });
  }

  return {
    molecule: alignCleanupCoordsPerComponent(mol, cleanedById),
    source: usedIndigo ? 'indigo' : 'native',
  };
};

export const cleanupPreferIndigo = async (
  mol: Molecule,
  options: CleanupPreferIndigoOptions = {},
): Promise<CleanupPreferIndigoResult> => {
  const bondLen = resolveCleanupBondLength(mol, options.bondLengthPx);
  const preferIndigo = options.preferIndigo === true;
  const selection = options.indigo?.selectedAtomIndices;
  const selectedAtomIds = atomIdsFromIndices(mol, selection);
  const hasSelection = selectedAtomIds != null && selectedAtomIds.size > 0;
  const comps = listConnectedComponents(mol);
  const forceFullRebuild = options.indigo?.mode === 'layout' && !hasSelection;

  if (!hasSelection && comps.length > 1) {
    return cleanupPerConnectedComponent(
      mol,
      bondLen,
      preferIndigo,
      options.indigo,
      options.preserveOrientation,
    );
  }

  return cleanupOne(
    mol,
    bondLen,
    preferIndigo,
    options.indigo,
    options.preserveOrientation,
    selectedAtomIds,
    forceFullRebuild && !hasSelection,
  );
};

export const cleanupIndigoSyncOrNull = (
  mol: Molecule,
  bondLengthPx?: number,
): Molecule | null => {
  const bondLen = resolveCleanupBondLength(mol, bondLengthPx);
  const native = cleanupMolecule(mol, {
    bondLengthPx: bondLen,
    preserveOrientation: true,
  }).molecule;
  if (isIndigoReady() && !hasLockedRingConformations(mol)) {
    const laid = layoutMoleculeIndigoSync(mol, { bondLengthPx: bondLen });
    if (laid) return laid;
  }
  return rematchLaid(mol, native);
};

export { isIndigoReady, loadIndigo, scaleMoleculeBonds };
