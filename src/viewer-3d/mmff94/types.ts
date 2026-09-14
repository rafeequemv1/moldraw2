/**
 * Types for OpenChemLib MMFF94 energy minimization (3D viewer).
 */

export type Mmff94Table = 'MMFF94' | 'MMFF94s' | 'MMFF94s+';

export interface MinimizeMmff94Options {
  /** Parameter table (default MMFF94). */
  table?: Mmff94Table;
  /** Max optimizer iterations (default 2000). */
  maxIts?: number;
  /** Gradient tolerance (default 1e-4). */
  gradTol?: number;
  /** Energy tolerance (default 1e-6). */
  funcTol?: number;
  /** Abort if heavy-atom count exceeds this (default 180). */
  maxHeavyAtoms?: number;
  /** Progress callback (0–1). */
  onProgress?: (fraction: number, message: string) => void;
  /** AbortSignal — checked around async boundaries (minimize itself is sync). */
  signal?: AbortSignal;
}

export interface Mmff94MinimizeResult {
  /** Minimized V2000 molblock (coordinates updated in place by OCL). */
  molblock: string;
  /** Total MMFF94 energy after minimization (kcal/mol). */
  energyKcal: number;
  /** Energy before minimization (kcal/mol), when available. */
  energyBeforeKcal: number | null;
  /** Return code from ForceFieldMMFF94.minimise (0 = success). */
  status: number;
  /** Parameter table used. */
  table: Mmff94Table;
  heavyAtomCount: number;
  source: 'mmff94';
}

export type Mmff94ErrorCode =
  | 'empty'
  | 'flat'
  | 'too_large'
  | 'parse_failed'
  | 'init_failed'
  | 'minimize_failed'
  | 'cancelled'
  | 'resources'
  | 'unknown';

export class Mmff94Error extends Error {
  readonly code: Mmff94ErrorCode;
  constructor(code: Mmff94ErrorCode, message: string) {
    super(message);
    this.name = 'Mmff94Error';
    this.code = code;
  }
}
