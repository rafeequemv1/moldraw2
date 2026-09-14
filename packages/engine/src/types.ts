/**
 * Native molecule engine — public types.
 *
 * The engine is the "local brain": pure-TypeScript cheminformatics that runs
 * offline with no RDKit WASM on the critical path. RDKit (when present) becomes
 * an optional accelerator behind this same interface.
 *
 * Coordinates follow the app's `Molecule` convention: canvas pixels, Y-down.
 * Molblock I/O converts to/from Ångström (÷/× `MOLBLOCK_SCALE`) with Y flipped.
 */
import type { Molecule } from '@moldraw/domain';

/** A perceived ring: ordered atom ids forming a simple cycle + its bond ids. */
export interface Ring {
  atomIds: string[];
  bondIds: string[];
  size: number;
  aromatic: boolean;
}

/** Empirical/derived molecular properties. */
export interface MoleculeProperties {
  /** Hill-order formula string, e.g. "C6H6". */
  formula: string;
  /** Hill-order element list (for structured rendering). */
  formulaOrder: string[];
  /** Element → count (including implicit H). */
  counts: Record<string, number>;
  /** Average molecular weight (standard atomic weights). */
  mw: number;
  /** Monoisotopic exact mass. */
  exactMass: number;
  /** Net formal charge. */
  charge: number;
}

export interface ToMolblockOptions {
  version?: 'V2000' | 'V3000';
  /** Program/title header line. */
  title?: string;
  /**
   * Write dative / coordination bonds as V2000 bond type 9 so they survive a
   * round-trip through the engine (metal–ligand identity, donor H count).
   * Default false — classic V2000 readers may reject type 9.
   */
  dativeAsType9?: boolean;
}

export interface ToSmilesOptions {
  /** Produce a canonical (stable) atom ordering. Default true. */
  canonical?: boolean;
}

export interface Generate2DOptions {
  /** Target bond length in canvas px (default 40, matching MOLBLOCK_SCALE). */
  bondLengthPx?: number;
  /** When true, anchor layout on existing atom positions (cleanup). Default false. */
  preserveOrientation?: boolean;
  /**
   * Skip Stage-2 spring refine inside generate2D. Cleanup uses this so it can
   * decide polish budget itself (avoids double refine on polycyclics).
   */
  skipEnergyRefine?: boolean;
}

export interface Generate3DOptions {
  /** Add explicit hydrogen atoms to the conformer. Default true. */
  includeHydrogens?: boolean;
  /** Phase-A relaxation iterations (default 400). Lower for fast previews. */
  iterations?: number;
  /** Final minimizer: 'uff' (default) or 'none' for a quick preview. */
  forceField?: 'uff' | 'none';
  /** Max UFF minimizer iterations when forceField is 'uff' (default 500). */
  maxIterations?: number;
  /**
   * Rotatable-bond samples for conformer search (default 8). Use 1 to skip
   * torsional sampling (faster but may miss the lowest-energy rotamer).
   */
  count?: number;
  /** RNG seed when count > 1 (default 1). */
  seed?: number;
  /**
   * Starting 3D coordinates (Å, right-handed / y-up) by atom id. Atoms present
   * here are seeded from these positions instead of the flat 2D depiction, so a
   * re-minimization stays close to (and oriented like) an existing conformer —
   * e.g. re-running 3D Clean Up on a canvas Structure Perspective pose.
   */
  seed3D?: ReadonlyMap<string, { x: number; y: number; z: number }>;
}

export interface Refine3DRegionOptions {
  dirtyAtomIds: string[];
  bondBuffer?: number;
  includeHydrogens?: boolean;
  maxIterations?: number;
  previousMolblock3D?: string;
}

export interface Refine3DRegionResult {
  molblock: string;
  energy?: number;
  movableCount: number;
  atomCount: number;
  source: 'native-3d-region' | 'native-3d';
}

export interface GenerateConformersOptions extends Generate3DOptions {
  /** Number of torsional samples to try (default 10). */
  count?: number;
  /** Max distinct conformers to return (default = count). */
  maxResults?: number;
  /** Deterministic RNG seed (default 1). */
  seed?: number;
}

/** A ranked conformer: 3D molblock (V2000, Å) plus its UFF energy (kcal/mol). */
export interface Conformer3DResult {
  molblock: string;
  energy: number;
}

/**
 * The stable engine contract. Callers depend on this, never on RDKit directly.
 * All methods are pure: molecule in, new molecule/value out.
 */
export interface MoleculeEngine {
  readonly name: string;

  // ── parsing ──────────────────────────────────────────────────────────────
  parseMolblock(text: string): Molecule;
  parseSmiles(smiles: string): Molecule;

  // ── writing ──────────────────────────────────────────────────────────────
  toMolblock(mol: Molecule, opts?: ToMolblockOptions): string;
  toSmiles(mol: Molecule, opts?: ToSmilesOptions): string;

  // ── chemistry ──────────────────────────────────────────────────────────────
  /** Smallest Set of Smallest Rings. */
  perceiveRings(mol: Molecule): Ring[];
  /** Set `aromatic` on bonds/rings that satisfy a Hückel-style check. */
  perceiveAromaticity(mol: Molecule): Molecule;
  /** Convert aromatic-flagged bonds into an explicit Kekulé (alternating) form. */
  kekulize(mol: Molecule): Molecule;
  /** Implicit hydrogen count per atom id (does not add H atoms). */
  implicitHydrogens(mol: Molecule): Map<string, number>;

  // ── layout ──────────────────────────────────────────────────────────────
  /** Generate clean 2D coordinates (canvas px). */
  generate2D(mol: Molecule, opts?: Generate2DOptions): Molecule;

  /**
   * Generate a 3D conformer natively (no RDKit / no network) and return a
   * V2000 molblock with x/y/z in Ångström — ready for the 3D viewer / export.
   */
  generate3D(mol: Molecule, opts?: Generate3DOptions): string;

  /**
   * Local 3D refine: minimize only dirty∪buffer atoms, freeze the rest.
   * Used for instant updates after small edits.
   */
  refine3DRegion(mol: Molecule, opts: Refine3DRegionOptions): Refine3DRegionResult;

  /**
   * Generate several distinct low-energy 3D conformers (torsional sampling +
   * UFF ranking), sorted lowest energy first. `generate3D` returns the best of
   * these; use this when you need alternatives.
   */
  generate3DConformers(mol: Molecule, opts?: GenerateConformersOptions): Conformer3DResult[];

  // ── analysis ──────────────────────────────────────────────────────────────
  properties(mol: Molecule): MoleculeProperties;
}

/** px-per-Ångström used by molblock I/O and default layout. */
export const MOLBLOCK_SCALE = 40;
