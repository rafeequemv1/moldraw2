export type CofGenerateParams = {
  presetId: string;
  cols: number;
  rows: number;
  layers?: number;
  bondLengthPx: number;
  cx: number;
  cy: number;
  replaceAtomIds?: string[];
  latticeId?: string;
  live?: boolean;
  commitLive?: boolean;
};

export type CofGenerateResult = {
  atomIds: string[];
  latticeId?: string;
};
