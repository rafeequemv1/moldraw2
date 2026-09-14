import type { Molecule } from '@moldraw/domain';

export interface NewmanHint {
  label: string;
  angleRad: number;
  atomId: string;
}

export interface NewmanProjectionData {
  frontAtomId: string;
  backAtomId: string;
  frontElement: string;
  backElement: string;
  frontHints: NewmanHint[];
  backHints: NewmanHint[];
  cipParityHint?: string;
}

export interface NewmanToolProps {
  molecule: Molecule;
  bondId: string;
  bondIndex?: number;
  cipStereoTags?: unknown;
  molblock3D?: string;
  atomIndexTo2DId?: Record<number, string>;
  onClose: () => void;
}

export interface FischerRow {
  atomId: string;
  centerLabel: string;
  leftLabel: string;
  rightLabel: string;
}

export interface FischerProjectionData {
  chainAtomIds: string[];
  topLabel: string;
  bottomLabel: string;
  rows: FischerRow[];
}

export interface FischerProjectionResult {
  data: FischerProjectionData | null;
  error?: string;
}

export interface FischerToolProps {
  molecule: Molecule;
  chainAtomIds: string[];
  onClose: () => void;
}

export interface ChairBoatToolProps {
  molecule: Molecule;
  ringAtomIds: string[];
  onClose: () => void;
}

export interface EZAnalyzerToolProps {
  molecule: Molecule;
  bondId: string;
  onClose: () => void;
}
