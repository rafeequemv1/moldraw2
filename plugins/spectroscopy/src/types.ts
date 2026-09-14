export type SpectroscopyKind = 'nmr' | 'mass' | 'uv';

export type SpectroscopyPeak = {
  x: number;
  y: number;
  label?: string;
};

export type SpectroscopyPrediction = {
  kind: SpectroscopyKind;
  title: string;
  formula: string;
  molecularWeight: number;
  xLabel: string;
  yLabel: string;
  peaks: SpectroscopyPeak[];
  table: string[][];
  notes: string[];
  disclaimer: string;
};
