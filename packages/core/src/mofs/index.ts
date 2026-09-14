/**
 * Programmatic 2D MOF frameworks — dedicated folder so new presets register
 * here without growing App.tsx or the template molblock library.
 */
export {
  MOF_PROGRAMMATIC_PRESETS,
  MOF_PRESET_INFO_BY_ID,
  getMofBuilder,
  listMofPresets,
  mofNodeSpacing,
  mofStackingForPreset,
} from './registry';
export { mofPreviewMolblock } from './preview';
export { buildCuHhtp, cuHhtpNodeSpacing } from './presets/cuHhtp';
export {
  buildMBdc,
  buildMof2,
  buildCuBdc,
  buildNiBdc,
  buildCoBdc,
  mBdcNodeSpacing,
} from './presets/mBdc';
