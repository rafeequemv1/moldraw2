/**
 * UFF (Universal Force Field, Rappé et al. 1992) parameters and atom typing.
 *
 * We assign a UFF atom type from element + perceived hybridization, then expose
 * the per-type constants needed by the energy terms:
 *   - `r1`   valence bond radius (Å) — natural bond length
 *   - `theta0` equilibrium valence angle (degrees)
 *   - `x`    van der Waals distance (Å)
 *   - `D`    van der Waals well depth (kcal/mol)
 *   - `Zstar` effective charge (bond/angle force constants)
 *   - `chi`  GMP electronegativity (bond electronegativity correction)
 *   - `Vsp3` sp³ torsional barrier (kcal/mol)
 *   - `Usp2` sp² torsional constant (kcal/mol)
 *
 * Values are the standard UFF main-group set. This is a pragmatic subset
 * covering organic chemistry; unknown atoms fall back to a carbon-like type so
 * minimization never crashes.
 */
import type { Molecule } from '@moldraw/domain';
import { buildGraph, type MoleculeGraph } from '@moldraw/engine/graph';
import { perceiveHybridization, type Hybridization } from '../hybridization';
import { normalizeElementSymbol } from '@moldraw/engine/data/periodicTable';

export interface UffType {
  r1: number;
  theta0: number; // degrees
  x: number;
  D: number;
  Zstar: number;
  chi: number;
  Vsp3: number;
  Usp2: number;
}

// r1, theta0, x, D, Zstar, chi, Vsp3, Usp2
const T = (
  r1: number,
  theta0: number,
  x: number,
  D: number,
  Zstar: number,
  chi: number,
  Vsp3 = 0,
  Usp2 = 2.0,
): UffType => ({ r1, theta0, x, D, Zstar, chi, Vsp3, Usp2 });

export const UFF_TYPES: Readonly<Record<string, UffType>> = Object.freeze({
  H_: T(0.354, 180, 2.886, 0.044, 0.712, 4.528, 0, 0),
  B_3: T(0.838, 109.47, 4.083, 0.18, 1.755, 5.11, 0, 2.0),
  B_2: T(0.828, 120, 4.083, 0.18, 1.755, 5.11, 0, 2.0),
  C_3: T(0.757, 109.47, 3.851, 0.105, 1.912, 5.343, 2.119, 2.0),
  C_R: T(0.729, 120, 3.851, 0.105, 1.912, 5.343, 0, 2.0),
  C_2: T(0.732, 120, 3.851, 0.105, 1.912, 5.343, 0, 2.0),
  C_1: T(0.706, 180, 3.851, 0.105, 1.912, 5.343, 0, 2.0),
  N_3: T(0.7, 106.7, 3.66, 0.069, 2.544, 6.899, 0.45, 2.0),
  N_R: T(0.699, 120, 3.66, 0.069, 2.544, 6.899, 0, 2.0),
  N_2: T(0.685, 111.2, 3.66, 0.069, 2.544, 6.899, 0, 2.0),
  N_1: T(0.656, 180, 3.66, 0.069, 2.544, 6.899, 0, 2.0),
  O_3: T(0.658, 104.51, 3.5, 0.06, 2.3, 8.741, 0.018, 2.0),
  O_R: T(0.68, 110, 3.5, 0.06, 2.3, 8.741, 0, 2.0),
  O_2: T(0.634, 120, 3.5, 0.06, 2.3, 8.741, 0, 2.0),
  F_: T(0.668, 180, 3.364, 0.05, 1.735, 10.874, 0, 0),
  Si3: T(1.117, 109.47, 4.295, 0.402, 2.323, 4.168, 1.225, 1.25),
  P_3: T(1.101, 93.8, 4.147, 0.305, 2.863, 5.463, 2.4, 2.4),
  S_3: T(1.064, 92.1, 4.035, 0.274, 2.703, 6.928, 0.484, 0.484),
  Cl: T(1.044, 180, 3.947, 0.227, 2.348, 8.564, 0, 0),
  Br: T(1.192, 180, 4.189, 0.251, 2.519, 7.79, 0, 0),
  I: T(1.382, 180, 4.5, 0.339, 2.65, 6.822, 0, 0),
});

/** Assign UFF atom-type keys for every atom in the molecule. */
export const assignUffTypes = (
  mol: Molecule,
  g: MoleculeGraph = buildGraph(mol),
  hyb: Map<string, Hybridization> = perceiveHybridization(mol, g),
): Map<string, string> => {
  const out = new Map<string, string>();
  for (const a of mol.atoms) {
    const el = normalizeElementSymbol(a.element);
    const h = hyb.get(a.id) ?? 'sp3';
    out.set(a.id, uffTypeFor(el, h));
  }
  return out;
};

const uffTypeFor = (el: string, h: Hybridization): string => {
  switch (el) {
    case 'H':
      return 'H_';
    case 'B':
      return h === 'sp3' ? 'B_3' : 'B_2';
    case 'C':
      return h === 'sp' ? 'C_1' : h === 'sp2' ? 'C_2' : 'C_3';
    case 'N':
      return h === 'sp' ? 'N_1' : h === 'sp2' ? 'N_2' : 'N_3';
    case 'O':
      return h === 'sp' ? 'O_2' : h === 'sp2' ? 'O_2' : 'O_3';
    case 'F':
      return 'F_';
    case 'Si':
      return 'Si3';
    case 'P':
      return 'P_3';
    case 'S':
      return 'S_3';
    case 'Cl':
      return 'Cl';
    case 'Br':
      return 'Br';
    case 'I':
      return 'I';
    default:
      return 'C_3'; // safe carbon-like fallback for exotic atoms
  }
};

export const uffParamsFor = (typeKey: string): UffType => UFF_TYPES[typeKey] ?? UFF_TYPES.C_3;

const LAMBDA = 0.1332; // UFF bond-order correction coefficient

/** UFF natural bond length r0 (Å) between two atom types at bond order `bo`. */
export const uffBondLength = (a: UffType, b: UffType, bo: number): number => {
  const ri = a.r1;
  const rj = b.r1;
  const rBO = -LAMBDA * (ri + rj) * Math.log(bo);
  const denom = a.chi * ri + b.chi * rj;
  const rEN = denom > 0 ? (ri * rj * (Math.sqrt(a.chi) - Math.sqrt(b.chi)) ** 2) / denom : 0;
  return ri + rj + rBO - rEN;
};

/** UFF bond force constant (kcal/mol/Å²). */
export const uffBondForceConstant = (a: UffType, b: UffType, r0: number): number =>
  (664.12 * a.Zstar * b.Zstar) / (r0 * r0 * r0);
