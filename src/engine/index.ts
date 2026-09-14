/**
 * Native molecule engine — public entry point ("local brain").
 *
 * Usage:
 *   import { engine } from '@/engine';
 *   const mol = engine.parseSmiles('c1ccccc1');
 *   const clean = engine.generate2D(mol);
 *   const smiles = engine.toSmiles(clean);
 *
 * To plug in RDKit as an optional accelerator later:
 *   const engine = createEngine({ accelerator: rdkitAdapter, overrides: { generate2D: 'accelerator' } });
 */
export type {
  MoleculeEngine,
  MoleculeProperties,
  Ring,
  ToMolblockOptions,
  ToSmilesOptions,
  Generate2DOptions,
  Generate3DOptions,
  GenerateConformersOptions,
  Conformer3DResult,
  Refine3DRegionOptions,
  Refine3DRegionResult,
} from './types';
export { MOLBLOCK_SCALE } from './types';

export { NativeEngine, nativeEngine } from './nativeEngine';
export {
  CompositeEngine,
  type CreateEngineOptions,
  type EngineAccelerator,
} from './compositeEngine';

// Individual capabilities (for tree-shaking / targeted use).
export { parseMolblockV2000, moleculeToMolblockV2000 } from './io/molblockV2000';
export { parseSmilesToMolecule } from './smiles/parse';
export { moleculeToSmiles } from './smiles/write';
export { perceiveRings, ringAtomIds } from './chem/rings';
export { kekulize, perceiveAromaticity } from './chem/aromaticity';
export { implicitHForAtom, implicitHydrogensForMolecule } from './chem/valence';
export { moleculeProperties, elementCounts, formatFormula } from './chem/properties';
export { generate2D, correctLayoutInPlace, stripTerminalHydrogensForLayout } from './layout/generate2d';
export { cleanupStructure, cleanupStructureWithStatus } from './layout/cleanupStructure';
export { certifyLayout, type CertifyLayoutResult, type LayoutStatus } from './layout/certifyLayout';
export { minimize2D } from './layout/minimize2D';
export { repairCrossings, findCrossings } from './layout/repairCrossings';
export { refine2DEnergy } from './layout/refine2dEnergy';
export { untangleByReflection } from './layout/untangleByReflection';
export {
  fusedRingFingerprint,
  orderRingsForScaffold,
  preferredCoreRingSize,
} from './layout/scaffoldTemplates';
export {
  isAcceptableLayout,
  measureLayoutQuality,
  layoutScore,
  passesHardGate,
  passesSoftGate,
  isChemDrawReady,
} from './layout/layoutQuality';
export { layoutComponentSkeleton } from './layout/skeletonLayout';
export { classifySkeleton } from './layout/skeletonClassify';
export { measureSkeletonAngles, optimizeSkeletonAngles, uniformizeBondLengths } from './layout/optimizeSkeleton';
export {
  normalizeBondLengthsInPlace,
  hasReasonableExistingLayout,
} from './layout/refineInPlace';

import { nativeEngine } from './nativeEngine';
import { CompositeEngine, type CreateEngineOptions } from './compositeEngine';
import type { MoleculeEngine } from './types';

/** Factory: returns the native engine, or a composite if an accelerator is given. */
export const createEngine = (opts: CreateEngineOptions = {}): MoleculeEngine => {
  if (!opts.accelerator) return nativeEngine;
  return new CompositeEngine(opts);
};

/** Default shared engine instance (native, offline). */
export const engine: MoleculeEngine = nativeEngine;
