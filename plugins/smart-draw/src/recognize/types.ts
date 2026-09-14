export type Point = { x: number; y: number };
export type Stroke = { points: Point[] };

export type CandidateType = 'bond' | 'ring' | 'atom' | 'charge' | 'stereo' | 'aromatic';

export interface RecognitionCandidate {
  type: CandidateType;
  confidence: number;
  geometry: unknown;
}

export interface SketchAtom {
  tempId: string;
  x: number;
  y: number;
  element: string;
  /** Functional-group / multi-letter label (Me, OH, COOH, …). */
  alias?: string;
  charge?: number;
  confidence: number;
  snappedTo?: string;
}

export interface SketchBond {
  fromTempId: string;
  toTempId: string;
  order: 1 | 2 | 3;
  stereo?: 'wedge' | 'dash' | 'wavy';
  aromatic?: boolean;
  confidence: number;
}

export interface SketchGraph {
  atoms: SketchAtom[];
  bonds: SketchBond[];
  rejectedStrokes: Stroke[];
  confidence: number;
  candidates: RecognitionCandidate[];
}

export interface ExistingAtom {
  id: string;
  x: number;
  y: number;
  element: string;
}

export interface RecognizeInput {
  strokes: Stroke[];
  bondLengthPx: number;
  molecule: { atoms: ExistingAtom[] };
}

export const GLYPH_ACCEPT: Record<string, number> = {
  N: 0.9,
  O: 0.85,
  S: 0.88,
  F: 0.88,
  P: 0.88,
  H: 0.88,
  I: 0.9,
  Cl: 0.88,
  Br: 0.88,
  B: 0.9,
  R: 0.9,
  K: 0.9,
  A: 0.9,
  E: 0.9,
  T: 0.9,
  M: 0.9,
  L: 0.9,
  D: 0.9,
  G: 0.9,
  X: 0.9,
  C: 0.94,
  '+': 0.9,
  '-': 0.9,
};

export const CLUSTER_FRAC = 0.28;
export const SNAP_EXISTING_FRAC = 0.35;
