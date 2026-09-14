import type { Atom, Bond, Molecule } from '@moldraw/domain';
import type { CofDimensionality, CofStackingSpec, CofTopologyId } from './packing3d/types';

export type { CofDimensionality, CofStackingSpec, CofTopologyId };

export type CofPresetInfo = {
  id: string;
  label: string;
  name: string;
  summary: string;
  topology: CofTopologyId;
  /** `layered` = 2D sheet + D-slider stack. `network3d` = future true 3D nets. */
  dimensionality: CofDimensionality;
  stacking?: CofStackingSpec;
  conditions?: string;
};

export type CofBuildOptions = {
  cols: number;
  rows: number;
  /** Stacked layers along c (1 = single sheet). */
  layers?: number;
  /** Canvas C–C / B–O length in px. */
  bondLength: number;
  cx: number;
  cy: number;
};

export type CofBuildResult = {
  atoms: Atom[];
  bonds: Bond[];
  atomIds: string[];
};

export type CofBuilder = (options: CofBuildOptions) => CofBuildResult;

export type GenerateCofOptions = CofBuildOptions & {
  presetId: string;
  replaceAtomIds?: string[];
  latticeId?: string;
  /**
   * @deprecated No-op. Growth is incremental with deterministic ids, so the
   * live preview and the committed lattice are the same molecule.
   */
  instancePack?: boolean;
};

export type GenerateCofResult = {
  molecule: Molecule;
  newAtomIds: string[];
  allAtomIds: string[];
  latticeId: string;
};

export const COF_PACK_MIN = 1;
export const COF_PACK_MAX = 12;
export const COF_PACK_DEFAULT = 1;
export const COF_LAYERS_MIN = 1;
export const COF_LAYERS_MAX = 6;
export const COF_LAYERS_DEFAULT = 1;
