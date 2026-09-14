/**
 * Standard atomic data tables for visualization and bond-length estimation.
 *
 *  - `VDW_RADII_A`: van der Waals radii in Ångström (Bondi 1964 + Mantina 2009).
 *    Used for space-filling and ball-and-stick atom spheres.
 *  - `COVALENT_RADII_A`: single-bond covalent radii in Å (Cordero 2008).
 *    Sums of two covalent radii ≈ a single bond length, so these drive the
 *    bond-length correction pass.
 *
 * Lookup is by element symbol ("C", "Cl", ...). Unknown elements fall back to
 * a generic radius so visualization always succeeds; this only affects exotic
 * elements that aren't part of organic chemistry.
 *
 * The host application is React-free at this layer — these tables are pure
 * data and can be imported from the worker, the canvas renderer, or any
 * future MCP/AI tool without pulling React into the bundle.
 */

const DEFAULT_VDW_A = 1.5;
const DEFAULT_COVALENT_A = 0.75;

export const VDW_RADII_A: Readonly<Record<string, number>> = Object.freeze({
  H: 1.20,
  D: 1.20,
  He: 1.40,
  Li: 1.82,
  Be: 1.53,
  B: 1.92,
  C: 1.70,
  N: 1.55,
  O: 1.52,
  F: 1.47,
  Ne: 1.54,
  Na: 2.27,
  Mg: 1.73,
  Al: 1.84,
  Si: 2.10,
  P: 1.80,
  S: 1.80,
  Cl: 1.75,
  Ar: 1.88,
  K: 2.75,
  Ca: 2.31,
  Br: 1.85,
  Kr: 2.02,
  Rb: 3.03,
  Sr: 2.49,
  I: 1.98,
  Xe: 2.16,
  Cs: 3.43,
  Ba: 2.68,
  Fe: 1.94,
  Cu: 1.40,
  Zn: 1.39,
  Ag: 1.72,
  Au: 1.66,
});

export const COVALENT_RADII_A: Readonly<Record<string, number>> = Object.freeze({
  H: 0.31,
  D: 0.31,
  He: 0.28,
  Li: 1.28,
  Be: 0.96,
  B: 0.84,
  C: 0.76,
  N: 0.71,
  O: 0.66,
  F: 0.57,
  Ne: 0.58,
  Na: 1.66,
  Mg: 1.41,
  Al: 1.21,
  Si: 1.11,
  P: 1.07,
  S: 1.05,
  Cl: 1.02,
  Ar: 1.06,
  K: 2.03,
  Ca: 1.76,
  Br: 1.20,
  Kr: 1.16,
  Rb: 2.20,
  Sr: 1.95,
  I: 1.39,
  Xe: 1.40,
  Cs: 2.44,
  Ba: 2.15,
  Fe: 1.32,
  Cu: 1.32,
  Zn: 1.22,
  Ag: 1.45,
  Au: 1.36,
});

const normElem = (element: string): string => {
  const e = (element || '').trim();
  if (!e) return '';
  // Allow lowercase / multi-letter inputs by capitalizing first letter only.
  return e.charAt(0).toUpperCase() + e.slice(1).toLowerCase();
};

export const vdwRadius = (element: string): number => {
  return VDW_RADII_A[normElem(element)] ?? DEFAULT_VDW_A;
};

export const covalentRadius = (element: string): number => {
  return COVALENT_RADII_A[normElem(element)] ?? DEFAULT_COVALENT_A;
};

/**
 * Bond-order multiplier on (covalent radius sum). Single bonds are the radius
 * sum directly; π contraction shortens double / triple bonds by ~13% / 22%
 * and aromatic bonds by ~8%, matching typical experimental ratios.
 *
 * Examples (sanity-check against textbook values):
 *   C–C single  ≈ 0.76 + 0.76          = 1.52 Å (exp ≈ 1.54)
 *   C=C double  ≈ 1.52 × 0.87          = 1.32 Å (exp ≈ 1.34)
 *   C≡C triple  ≈ 1.52 × 0.78          = 1.19 Å (exp ≈ 1.20)
 *   C–H         ≈ 0.76 + 0.31          = 1.07 Å (exp ≈ 1.09)
 *   C–Cl        ≈ 0.76 + 1.02          = 1.78 Å (exp ≈ 1.78)
 *   C aromatic  ≈ 1.52 × 0.92          = 1.40 Å (benzene ≈ 1.40)
 */
const BOND_ORDER_FACTOR: Readonly<Record<string, number>> = Object.freeze({
  '1': 1.0,
  '2': 0.87,
  '3': 0.78,
  ar: 0.92,
});

export type BondOrderForLength = 1 | 2 | 3 | 'aromatic';

export const targetBondLengthA = (
  elementA: string,
  elementB: string,
  order: BondOrderForLength,
): number => {
  const key = order === 'aromatic' ? 'ar' : String(order);
  const factor = BOND_ORDER_FACTOR[key] ?? 1.0;
  return (covalentRadius(elementA) + covalentRadius(elementB)) * factor;
};
