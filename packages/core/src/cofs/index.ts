/**
 * Programmatic COF frameworks — dedicated folder so new presets register here
 * without growing App.tsx or the template molblock library.
 */
export {
  COF_PACK_DEFAULT,
  COF_PACK_MAX,
  COF_PACK_MIN,
  COF_LAYERS_DEFAULT,
  COF_LAYERS_MAX,
  COF_LAYERS_MIN,
  type CofBuildOptions,
  type CofBuildResult,
  type CofBuilder,
  type CofDimensionality,
  type CofPresetInfo,
  type CofStackingSpec,
  type CofTopologyId,
  type GenerateCofOptions,
  type GenerateCofResult,
} from './types';
export { listCofPresets, getCofBuilder, cofNodeSpacing, cofStackingForPreset, COF_PROGRAMMATIC_PRESETS, COF_PRESET_INFO_BY_ID } from './registry';
export { generateCofInMolecule, cofLatticeForAtomIds, cofStackAtomIds } from './generate';
export { cofPreviewMolblock } from './preview';
export { buildHoneycombLattice, honeycombPoreOffsets } from './topologies/hexagonalHoneycomb';
export { buildSquareLattice, squarePoreOffsets } from './topologies/squareGrid';
export { buildCof1, cof1NodeSpacing } from './presets/cof1';
export { buildCof5, cof5NodeSpacing } from './presets/cof5';
export {
  COF_LAYER_VIEW_RAD,
  layeredInstanceSites,
  layeredPackSites,
  type CofNetworkPacker,
} from './packing3d';
