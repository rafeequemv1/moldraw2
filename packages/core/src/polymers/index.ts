/**
 * Programmatic polymer SRU presets — Library → Polymers.
 * Places one ChemDraw-style repeating unit with [ ]ₙ brackets.
 */
export type {
  PolymerBuildOptions,
  PolymerBuildResult,
  PolymerBuilder,
  PolymerPresetInfo,
  GeneratePolymerOptions,
  GeneratePolymerResult,
} from './types';
export {
  POLYMER_PROGRAMMATIC_PRESETS,
  POLYMER_PRESET_INFO_BY_ID,
  getPolymerBuilder,
  listPolymerPresets,
} from './registry';
export { generatePolymerInMolecule } from './generate';
export { polymerPreviewMolblock } from './preview';
