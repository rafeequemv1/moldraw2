/** Protein representation modes supported by 3Dmol. */
export type ProteinRepresentation =
  | 'cartoon'
  | 'ribbon'
  | 'stick'
  | 'sphere'
  | 'line'
  | 'cross'
  | 'ballstick';

/** Built-in 3Dmol color schemes for proteins. */
export type ProteinColorScheme =
  | 'chain'
  | 'amino'
  | 'shapely'
  | 'nucleic'
  | 'hydrophobicity'
  | 'bfactor'
  | 'spectrum'
  | 'whiteCarbon'
  | 'greenCarbon'
  | 'cyanCarbon'
  | 'magentaCarbon'
  | 'yellowCarbon'
  | 'ss';

export type ProteinSurfaceKind = 'VDW' | 'SAS' | 'SES' | 'MS';

export interface ProteinSurfaceSettings {
  enabled: boolean;
  kind: ProteinSurfaceKind;
  opacity: number;
  color: string;
}

export interface ProteinStyleSettings {
  representation: ProteinRepresentation;
  colorScheme: ProteinColorScheme;
  customColor?: string;
  opacity: number;
  surface: ProteinSurfaceSettings;
}

export interface ProteinResidue {
  chain: string;
  resi: number;
  resn: string;
  oneLetter: string;
}

export interface ProteinChain {
  id: string;
  residues: ProteinResidue[];
  sequence: string;
}

export interface ResidueSelection {
  chain: string;
  resi: number;
}

/** A styled residue region — multiple can coexist on one structure. */
export interface StyledRegion {
  id: string;
  residues: ResidueSelection[];
  style: ProteinStyleSettings;
}

export const DEFAULT_GLOBAL_STYLE: ProteinStyleSettings = {
  representation: 'cartoon',
  colorScheme: 'chain',
  opacity: 1,
  surface: { enabled: false, kind: 'SAS', opacity: 0.5, color: '#94a3b8' },
};

export const DEFAULT_SELECTION_STYLE: ProteinStyleSettings = {
  representation: 'stick',
  colorScheme: 'spectrum',
  opacity: 1,
  surface: { enabled: false, kind: 'SAS', opacity: 0.6, color: '#3b82f6' },
};

/** Three-letter to one-letter amino acid map. */
export const AA3_TO_1: Record<string, string> = {
  ALA: 'A',
  ARG: 'R',
  ASN: 'N',
  ASP: 'D',
  CYS: 'C',
  GLN: 'Q',
  GLU: 'E',
  GLY: 'G',
  HIS: 'H',
  ILE: 'I',
  LEU: 'L',
  LYS: 'K',
  MET: 'M',
  PHE: 'F',
  PRO: 'P',
  SER: 'S',
  THR: 'T',
  TRP: 'W',
  TYR: 'Y',
  VAL: 'V',
  SEC: 'U',
  PYL: 'O',
  ASX: 'B',
  GLX: 'Z',
  UNK: 'X',
};
