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
 * Values are the standard UFF set: the organic main group plus the common
 * coordination metals / heavier main-group elements (one representative UFF
 * type per element — e.g. `Fe6+2`, `Pt4+2`, `Zn3+2`). Metal centres do not
 * use `theta0` directly: `coordinationGeometryFor` picks the angle model from
 * the actual coordination number (see `uff.ts`). Unknown atoms fall back to a
 * carbon-like type so minimization never crashes.
 */
import type { Molecule } from '@moldraw/domain';
import { isCoordinationMetal } from '@moldraw/domain';
import { buildGraph, type MoleculeGraph } from '@moldraw/engine';
import { perceiveHybridization, type Hybridization } from '../hybridization';
import { normalizeElementSymbol } from '@moldraw/engine';

export interface UffType {
  r1: number;
  theta0: number; // degrees
  x: number;
  D: number;
  Zstar: number;
  chi: number;
  Vsp3: number;
  Usp2: number;
  /** Coordination metal: angle terms come from the coordination number. */
  metal?: boolean;
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

/** Metal type: same columns, torsion barriers zero, flagged for CN-based angles. */
const M = (r1: number, theta0: number, x: number, D: number, Zstar: number, chi: number): UffType => ({
  r1,
  theta0,
  x,
  D,
  Zstar,
  chi,
  Vsp3: 0,
  Usp2: 0,
  metal: true,
});

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

  // ── heavier main group (UFF sp³ / hypervalent types) ─────────────────────
  Ge3: T(1.197, 109.47, 4.295, 0.379, 2.789, 4.051, 0.701, 1.25),
  As3: T(1.211, 92.1, 4.23, 0.309, 2.864, 5.188, 1.5, 1.5),
  Se3: T(1.19, 90.6, 4.205, 0.291, 2.541, 6.428, 0.335, 0.335),
  Sn3: T(1.398, 109.47, 4.392, 0.567, 2.961, 3.987, 0.199, 1.25),
  Sb3: T(1.407, 91.6, 4.42, 0.449, 2.728, 4.899, 1.1, 1.1),
  Te3: T(1.386, 90.25, 4.47, 0.398, 2.731, 5.816, 0.3, 0.3),
  Pb3: T(1.459, 109.47, 4.297, 0.663, 2.846, 3.9, 0.1, 1.25),
  Bi3: T(1.512, 90, 4.39, 0.518, 2.507, 4.69, 1.0, 1.0),

  // ── coordination metals (Rappé et al. 1992; one representative oxidation
  //    state per element). theta0 is only a hint — see coordinationGeometryFor.
  Li: M(1.336, 180, 2.451, 0.025, 1.026, 3.006),
  Na: M(1.539, 180, 2.983, 0.03, 1.081, 2.843),
  K_: M(1.953, 180, 3.812, 0.035, 1.165, 2.421),
  Rb: M(2.26, 180, 4.114, 0.04, 1.041, 2.331),
  Cs: M(2.57, 180, 4.517, 0.045, 0.997, 2.183),
  Be3: M(1.074, 109.47, 2.745, 0.085, 1.4, 4.877),
  Mg3: M(1.421, 109.47, 3.021, 0.111, 1.787, 3.951),
  Ca6: M(1.761, 90, 3.399, 0.238, 2.141, 3.231),
  Sr6: M(2.052, 90, 3.641, 0.235, 2.449, 3.024),
  Ba6: M(2.277, 90, 3.703, 0.364, 2.727, 2.814),
  Al3: M(1.244, 109.47, 4.499, 0.505, 1.792, 4.06),
  Ga3: M(1.26, 109.47, 4.383, 0.415, 2.961, 3.641),
  In3: M(1.459, 109.47, 4.463, 0.599, 2.07, 3.506),
  Tl3: M(1.518, 120, 4.347, 0.68, 2.07, 3.2),
  Sc3: M(1.513, 109.47, 3.295, 0.019, 2.595, 3.395),
  Ti6: M(1.412, 90, 3.175, 0.017, 2.659, 3.47),
  V_3: M(1.402, 109.47, 3.144, 0.016, 2.679, 3.65),
  Cr6: M(1.345, 90, 3.023, 0.015, 2.463, 3.415),
  Mn6: M(1.382, 90, 2.961, 0.013, 2.43, 3.325),
  Fe6: M(1.335, 90, 2.912, 0.013, 2.43, 3.76),
  Co6: M(1.241, 90, 2.872, 0.014, 2.43, 4.105),
  Ni4: M(1.164, 90, 2.834, 0.015, 2.43, 4.465),
  Cu3: M(1.302, 109.47, 3.495, 0.005, 1.756, 4.2),
  Zn3: M(1.193, 109.47, 2.763, 0.124, 1.308, 5.106),
  Y_3: M(1.698, 109.47, 3.345, 0.072, 2.618, 3.345),
  Zr3: M(1.564, 109.47, 3.124, 0.069, 2.667, 3.4),
  Nb3: M(1.473, 109.47, 3.165, 0.059, 2.648, 3.55),
  Mo6: M(1.467, 90, 3.052, 0.056, 3.4, 3.465),
  Tc6: M(1.322, 90, 2.998, 0.048, 3.4, 3.29),
  Ru6: M(1.478, 90, 2.963, 0.056, 3.4, 3.575),
  Rh6: M(1.332, 90, 2.929, 0.053, 3.5, 3.975),
  Pd4: M(1.338, 90, 2.899, 0.048, 3.21, 4.32),
  Ag1: M(1.386, 180, 3.148, 0.036, 1.956, 4.436),
  Cd3: M(1.403, 109.47, 2.848, 0.228, 1.65, 5.034),
  La3: M(1.943, 109.47, 3.522, 0.017, 2.846, 2.8355),
  Ce6: M(1.841, 90, 3.556, 0.013, 2.774, 2.774),
  Hf3: M(1.611, 109.47, 3.141, 0.072, 3.921, 3.7),
  Ta3: M(1.511, 109.47, 3.17, 0.081, 4.075, 5.1),
  W_6: M(1.392, 90, 3.069, 0.067, 3.7, 4.63),
  Re6: M(1.372, 90, 2.954, 0.066, 3.7, 3.96),
  Os6: M(1.372, 90, 3.12, 0.037, 3.7, 5.14),
  Ir6: M(1.371, 90, 2.83, 0.073, 3.731, 5.0),
  Pt4: M(1.364, 90, 2.754, 0.08, 3.382, 4.5),
  Au4: M(1.262, 90, 3.293, 0.039, 2.625, 4.894),
  Hg1: M(1.34, 180, 2.705, 0.385, 1.749, 6.27),
  U_6: M(1.684, 90, 3.395, 0.022, 3.9, 3.9),
});

/** Element → UFF type key for metals / heavy main group (fixed per element). */
const ELEMENT_TYPE_KEY: Readonly<Record<string, string>> = Object.freeze({
  Ge: 'Ge3', As: 'As3', Se: 'Se3', Sn: 'Sn3', Sb: 'Sb3', Te: 'Te3', Pb: 'Pb3', Bi: 'Bi3',
  Li: 'Li', Na: 'Na', K: 'K_', Rb: 'Rb', Cs: 'Cs',
  Be: 'Be3', Mg: 'Mg3', Ca: 'Ca6', Sr: 'Sr6', Ba: 'Ba6',
  Al: 'Al3', Ga: 'Ga3', In: 'In3', Tl: 'Tl3',
  Sc: 'Sc3', Ti: 'Ti6', V: 'V_3', Cr: 'Cr6', Mn: 'Mn6', Fe: 'Fe6', Co: 'Co6', Ni: 'Ni4', Cu: 'Cu3', Zn: 'Zn3',
  Y: 'Y_3', Zr: 'Zr3', Nb: 'Nb3', Mo: 'Mo6', Tc: 'Tc6', Ru: 'Ru6', Rh: 'Rh6', Pd: 'Pd4', Ag: 'Ag1', Cd: 'Cd3',
  La: 'La3', Ce: 'Ce6', Hf: 'Hf3', Ta: 'Ta3', W: 'W_6', Re: 'Re6', Os: 'Os6', Ir: 'Ir6', Pt: 'Pt4', Au: 'Au4', Hg: 'Hg1',
  U: 'U_6',
});

/**
 * d⁸-type centres that prefer square-planar over tetrahedral at CN 4
 * (Pd(II), Pt(II), Rh(I), Ir(I), Au(III), Ni(II) low-spin, Cu(II)).
 */
const SQUARE_PLANAR_CN4 = new Set(['Ni', 'Pd', 'Pt', 'Rh', 'Ir', 'Au']);

/** Angle model used for a coordination centre with the given ligand count. */
export type CoordinationGeometry =
  | { kind: 'linear' }
  | { kind: 'harmonic'; theta0: number }
  | { kind: 'periodic4' }
  | { kind: 'multiwell'; thetas: number[] };

/**
 * Coordination geometry (angle model) for a metal centre from its coordination
 * number — VSEPR-free, polyhedron-based like ChemDraw's 3D clean-up:
 *   CN 2 linear · CN 3 trigonal · CN 4 tetrahedral or square-planar (d⁸ / Cu²⁺)
 *   CN 5 trigonal-bipyramidal wells (90/120/180) · CN 6 octahedral (90/180)
 *   CN 7 pentagonal-bipyramidal wells · CN ≥ 8 square-antiprism-like wells.
 */
export const coordinationGeometryFor = (
  element: string,
  coordinationNumber: number,
  charge = 0,
): CoordinationGeometry => {
  const el = normalizeElementSymbol(element);
  switch (coordinationNumber) {
    case 0:
    case 1:
    case 2:
      return { kind: 'linear' };
    case 3:
      return { kind: 'harmonic', theta0: 120 };
    case 4:
      return SQUARE_PLANAR_CN4.has(el) || (el === 'Cu' && charge >= 2)
        ? { kind: 'periodic4' }
        : { kind: 'harmonic', theta0: 109.47 };
    case 5:
      return { kind: 'multiwell', thetas: [90, 120, 180] };
    case 6:
      return { kind: 'periodic4' };
    case 7:
      return { kind: 'multiwell', thetas: [72, 90, 144, 180] };
    default:
      // Square antiprism / dodecahedron-like: nearest-neighbour ≈ 70–75°.
      return { kind: 'multiwell', thetas: [73, 110, 143, 180] };
  }
};

/** True when the element is treated as a coordination centre by the force field. */
export const isUffMetal = (element: string): boolean =>
  isCoordinationMetal(normalizeElementSymbol(element));

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
  const fixedKey = ELEMENT_TYPE_KEY[el];
  if (fixedKey) return fixedKey;
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
