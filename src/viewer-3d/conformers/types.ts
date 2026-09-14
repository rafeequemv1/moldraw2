/**
 * Types for the OpenChemLib ConformerGenerator gallery (3D viewer).
 */

export type ConformerStrategy =
  | 'adaptive_random'
  | 'likely_random'
  | 'likely_systematic'
  | 'pure_random';

export interface GenerateOclConformersOptions {
  /** Max distinct collision-free conformers to return (default 12, hard cap 24). */
  maxConformers?: number;
  /** RNG seed for reproducible sampling (default 1). */
  seed?: number;
  /** Torsion sampling strategy (default adaptive_random). */
  strategy?: ConformerStrategy;
  /** Abort if heavy-atom count exceeds this (default 80). */
  maxHeavyAtoms?: number;
  /** Soft cap on torsion sets tried (default 8000). */
  maxTorsionSets?: number;
  /** Optional progress callback (0–1). */
  onProgress?: (fraction: number, message: string) => void;
  /** AbortSignal to cancel a long run. */
  signal?: AbortSignal;
}

export interface OclConformerPose {
  /** 1-based display index. */
  index: number;
  /** V2000 molblock with 3D coordinates (explicit H included). */
  molblock: string;
  /** Atom count in the pose (includes H). */
  atomCount: number;
}

export interface OclConformerResult {
  poses: OclConformerPose[];
  /** Potential conformer count reported by OCL before capping. */
  potentialCount: number;
  /** Heavy atoms in the input (H stripped for the limit check). */
  heavyAtomCount: number;
  strategy: ConformerStrategy;
  source: 'openchemlib';
}

export type OclConformerErrorCode =
  | 'empty'
  | 'too_large'
  | 'parse_failed'
  | 'init_failed'
  | 'no_conformers'
  | 'cancelled'
  | 'resources'
  | 'unknown';

export class OclConformerError extends Error {
  readonly code: OclConformerErrorCode;
  constructor(code: OclConformerErrorCode, message: string) {
    super(message);
    this.name = 'OclConformerError';
    this.code = code;
  }
}
