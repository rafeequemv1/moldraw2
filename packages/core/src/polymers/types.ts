import type { Atom, Bond, Molecule, SruBracket } from '@moldraw/domain';

export type PolymerPresetInfo = {
  id: string;
  label: string;
  name: string;
  summary: string;
  /** ChemDraw-style repeat formula shown as a hint. */
  formula?: string;
};

export type PolymerBuildOptions = {
  bondLength: number;
  cx: number;
  cy: number;
};

export type PolymerBuildResult = {
  atoms: Atom[];
  bonds: Bond[];
  atomIds: string[];
  /** Default SRU subscript (`n`). */
  subscript?: string;
};

export type PolymerBuilder = (options: PolymerBuildOptions) => PolymerBuildResult;

export type GeneratePolymerOptions = PolymerBuildOptions & {
  presetId: string;
  replaceAtomIds?: string[];
};

export type GeneratePolymerResult = {
  molecule: Molecule;
  newAtomIds: string[];
  allAtomIds: string[];
  sruBracketId?: string;
};

export type { SruBracket };
