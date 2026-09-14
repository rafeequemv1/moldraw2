/**
 * @moldraw/templates — structure / FG / amino-acid / ligand / 3D cage libraries (no React).
 */
export {
  FUNCTIONAL_GROUP_TEMPLATES,
  type FunctionalGroupTemplate,
} from './functionalGroups';
export {
  LIGAND_TEMPLATES,
  LIGAND_BY_ID,
  type LigandTemplate,
} from './ligands';
export {
  AMINO_ACID_TEMPLATES,
  AMINO_ACID_BY_CODE,
  type AminoAcidTemplate,
} from './library/aminoAcids';
export {
  STRUCTURE_3D_TEMPLATES,
  STRUCTURE_3D_BY_ID,
  type Structure3DTemplate,
} from './library/structures3d';
export { C60_FULLERENE_MOLBLOCK } from './library/c60Molblock';
export { COF1_HEX_PORE_MOLBLOCK } from './library/cof1HexMolblock';
export { C60_COORDS_3D, type Coord3 } from './library/c60Coords3d';
export {
  TEMPLATE_CATEGORIES,
  DEFAULT_TEMPLATE_CATEGORY_ID,
  type TemplateCategory,
  type TemplateCategoryId,
} from './library/categories';
export {
  searchImplementedTemplates,
  categoryHasTemplateMatch,
  type TemplateSearchHit,
} from './library/search';
export {
  COF_PRESETS,
  COF_PRESET_BY_ID,
  type CofPreset,
} from './library/cofs';
