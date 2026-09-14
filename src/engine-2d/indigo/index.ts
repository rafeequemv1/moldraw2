/**
 * Optional Indigo WASM accelerator — 2D layout/cleanup + CIP / convert / check /
 * aromatize / calculate / automap / drug-like properties.
 * Lives under `src/engine-2d`. Native generate2D/cleanup remain in `src/engine`.
 */
export type {
  IndigoKetcher,
  IndigoFactory,
  IndigoStringMap,
  IndigoIntVector,
  IndigoConvertFormat,
} from './types';
export {
  loadIndigo,
  isIndigoReady,
  getIndigoOrNull,
  resetIndigoLoaderForTests,
} from './loadIndigo';
export { makeIndigoOptions } from './options';
export {
  indigoLayoutMolblock,
  tryIndigoLayoutMolblock,
  type IndigoLayoutMode,
  type IndigoLayoutOptions,
} from './layout2d';
export {
  layoutMoleculeIndigo,
  layoutMoleculeIndigoSync,
  cleanupWithIndigo,
  scaleMoleculeBonds,
} from './layoutMolecule';
export {
  cleanupPreferIndigo,
  cleanupIndigoSyncOrNull,
  type CleanupPreferIndigoOptions,
  type CleanupPreferIndigoResult,
} from './cleanupPreferIndigo';
export {
  indigoConvert,
  tryIndigoConvert,
  indigoInchiToMolblock,
  indigoMolblockToInchi,
  indigoChemDrawToMolblock,
} from './convert';
export {
  indigoCalculateCip,
  tryIndigoCalculateCip,
  parseCipKetJson,
  cipTagsById,
  type CipStereoTags,
  type CipAtomTag,
  type CipBondTag,
} from './cip';
export {
  indigoCheck,
  tryIndigoCheck,
  parseIndigoCheckJson,
  DEFAULT_CHECK_TYPES,
  type StructureCheckIssue,
  type StructureCheckResult,
} from './check';
export {
  aromatizeMoleculeIndigo,
  aromatizeMoleculeIndigoSync,
  indigoAromatizeMolblock,
  mergeBondOrdersFromMolblock,
  type AromatizeMode,
} from './aromatize';
export {
  indigoCalculate,
  tryIndigoCalculate,
  parseIndigoCalculateJson,
  type IndigoCalculatedProperties,
} from './calculate';
export {
  indigoDruglikeProperties,
  tryIndigoDruglikeProperties,
  type IndigoDruglikeProperties,
} from './properties';
export {
  indigoAutomap,
  tryIndigoAutomap,
  parseAtomMapsFromRxnOrMol,
  readAtomMapFromAtomLine,
  buildRxnFromMolblocks,
  type AutomapMode,
  type AutomapResult,
} from './automap';
