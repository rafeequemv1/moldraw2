import type { Atom, Bond, Molecule } from '@moldraw/domain';

export type DendrimerPresetInfo = {
  id: string;
  label: string;
  name: string;
  summary: string;
};

export type DendrimerBuildOptions = {
  bondLength: number;
  cx: number;
  cy: number;
};

export type DendrimerBuildResult = {
  atoms: Atom[];
  bonds: Bond[];
  atomIds: string[];
  /**
   * When set, `generateDendrimerInMolecule` runs the dendrimer array
   * (shared core + one parent branch instanced around the core).
   */
  array?: {
    foldCount: number;
    coreAtomIds: string[];
    attachmentAtomIds?: string[];
  };
};

export type DendrimerBuilder = (options: DendrimerBuildOptions) => DendrimerBuildResult;

export type GenerateDendrimerOptions = DendrimerBuildOptions & {
  presetId: string;
  replaceAtomIds?: string[];
};

export type GenerateDendrimerResult = {
  molecule: Molecule;
  newAtomIds: string[];
  allAtomIds: string[];
};
