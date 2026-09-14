/**
 * Optional 3D engine peer — native UFF embed, progressive shells, region refine.
 * Does not load Indigo WASM. Optional Indigo 2D seed via registerIndigo2DSeedFor3D.
 *
 * Import rule: only App sync hooks + molecule3dWorker should pull this package
 * into the product; canvas/domain stay 2D-only.
 */
export { embed3D, type Conformer, type Atom3D, type Embed3DOptions } from './embed';
export { conformerToMolblock3D } from './molblock3d';
export {
  refine3DRegion,
  dirtyAtomIdsFromEdit,
  expandAtomNeighborhood,
  type Refine3DRegionOptions,
  type Refine3DRegionResult,
} from './refineRegion';
export {
  choose3DUpdatePath,
  NATIVE_3D_FULL_HEAVY_LIMIT,
  NATIVE_3D_PREVIEW_HEAVY_LIMIT,
  isOptimized3DSource,
  localEditDirtyBudget,
  type Viewer3DUpdatePath,
  type Choose3DUpdatePathInput,
} from './choose3DUpdatePath';
export {
  embed3DProgressive,
  bfsShells,
  pickCenterAtomId,
  resolveHeavyClashes,
  type Progressive3DOptions,
  type Progressive3DProgress,
  type Progressive3DResult,
} from './progressiveEmbed';
export {
  generateConformers,
  type RankedConformer,
  type GenerateConformersOptions,
} from './conformers';
export {
  registerIndigo2DSeedFor3D,
  tryIndigo2DSeed,
  type Indigo2DSeedFn,
} from './indigoSeed';

import type { Molecule } from '@moldraw/domain';
import type {
  Conformer3DResult,
  Generate3DOptions,
  GenerateConformersOptions as EngineGenerateConformersOptions,
  Refine3DRegionOptions as EngineRefineOpts,
  Refine3DRegionResult as EngineRefineResult,
} from '@moldraw/engine';
import { embed3D } from './embed';
import { conformerToMolblock3D } from './molblock3d';
import { generateConformers } from './conformers';
import { refine3DRegion as refine3DRegionImpl } from './refineRegion';

/** Facade used by molecule3dWorker / NativeEngine thin wrappers. */
export function generate3DMolblock(mol: Molecule, opts: Generate3DOptions = {}): string {
  const sampleCount = opts.count ?? 8;
  const includeHydrogens = opts.includeHydrogens ?? true;

  if (sampleCount <= 1 || opts.forceField === 'none') {
    const conformer = embed3D(mol, {
      includeHydrogens,
      iterations: opts.iterations,
      forceField: opts.forceField,
      maxIterations: opts.maxIterations,
    });
    return conformerToMolblock3D(conformer);
  }

  const ranked = generateConformers(mol, {
    count: sampleCount,
    includeHydrogens,
    maxIterations: opts.maxIterations,
    seed: opts.seed ?? 1,
  });
  const best = ranked[0]?.conformer;
  if (!best) {
    return conformerToMolblock3D(
      embed3D(mol, { includeHydrogens, maxIterations: opts.maxIterations }),
    );
  }
  return conformerToMolblock3D(best);
}

export function generate3DConformerResults(
  mol: Molecule,
  opts: EngineGenerateConformersOptions = {},
): Conformer3DResult[] {
  const ranked = generateConformers(mol, {
    count: opts.count,
    maxResults: opts.maxResults,
    includeHydrogens: opts.includeHydrogens ?? true,
    maxIterations: opts.iterations,
    seed: opts.seed,
  });
  return ranked.map(r => ({ molblock: conformerToMolblock3D(r.conformer), energy: r.energy }));
}

export function refine3DRegionFacade(
  mol: Molecule,
  opts: EngineRefineOpts,
): EngineRefineResult {
  return refine3DRegionImpl(mol, opts);
}
