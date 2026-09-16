/**
 * Periodic table data for the native engine: atomic number, standard atomic
 * weight, monoisotopic mass, and SMILES organic-subset normal valences.
 *
 * Pure data — safe to import anywhere (worker, MCP/Node, canvas). No React.
 */

export interface ElementInfo {
  z: number;
  symbol: string;
  /** Standard atomic weight (average). */
  mass: number;
  /** Mass of the most abundant isotope (for exact mass). */
  exactMass: number;
}

/**
 * Element table. Covers common organic + main-group elements. Extend as needed.
 * Exact masses are the principal (most-abundant) isotope.
 */
export const ELEMENTS: Readonly<Record<string, ElementInfo>> = Object.freeze({
  H: { z: 1, symbol: 'H', mass: 1.008, exactMass: 1.007825 },
  He: { z: 2, symbol: 'He', mass: 4.0026, exactMass: 4.002603 },
  Li: { z: 3, symbol: 'Li', mass: 6.94, exactMass: 7.016004 },
  Be: { z: 4, symbol: 'Be', mass: 9.0122, exactMass: 9.012182 },
  B: { z: 5, symbol: 'B', mass: 10.811, exactMass: 11.009305 },
  C: { z: 6, symbol: 'C', mass: 12.011, exactMass: 12.0 },
  N: { z: 7, symbol: 'N', mass: 14.007, exactMass: 14.003074 },
  O: { z: 8, symbol: 'O', mass: 15.999, exactMass: 15.994915 },
  F: { z: 9, symbol: 'F', mass: 18.998, exactMass: 18.998403 },
  Ne: { z: 10, symbol: 'Ne', mass: 20.18, exactMass: 19.99244 },
  Na: { z: 11, symbol: 'Na', mass: 22.99, exactMass: 22.989769 },
  Mg: { z: 12, symbol: 'Mg', mass: 24.305, exactMass: 23.985042 },
  Al: { z: 13, symbol: 'Al', mass: 26.982, exactMass: 26.981538 },
  Si: { z: 14, symbol: 'Si', mass: 28.086, exactMass: 27.976927 },
  P: { z: 15, symbol: 'P', mass: 30.974, exactMass: 30.973762 },
  S: { z: 16, symbol: 'S', mass: 32.06, exactMass: 31.972071 },
  Cl: { z: 17, symbol: 'Cl', mass: 35.45, exactMass: 34.968853 },
  Ar: { z: 18, symbol: 'Ar', mass: 39.948, exactMass: 39.962383 },
  K: { z: 19, symbol: 'K', mass: 39.098, exactMass: 38.963707 },
  Ca: { z: 20, symbol: 'Ca', mass: 40.078, exactMass: 39.962591 },
  Ti: { z: 22, symbol: 'Ti', mass: 47.867, exactMass: 47.947946 },
  V: { z: 23, symbol: 'V', mass: 50.942, exactMass: 50.943959 },
  Cr: { z: 24, symbol: 'Cr', mass: 51.996, exactMass: 51.940507 },
  Mn: { z: 25, symbol: 'Mn', mass: 54.938, exactMass: 54.938045 },
  Fe: { z: 26, symbol: 'Fe', mass: 55.845, exactMass: 55.934942 },
  Co: { z: 27, symbol: 'Co', mass: 58.933, exactMass: 58.933195 },
  Ni: { z: 28, symbol: 'Ni', mass: 58.693, exactMass: 57.935342 },
  Cu: { z: 29, symbol: 'Cu', mass: 63.546, exactMass: 62.929601 },
  Zn: { z: 30, symbol: 'Zn', mass: 65.38, exactMass: 63.929147 },
  Se: { z: 34, symbol: 'Se', mass: 78.971, exactMass: 79.916522 },
  Br: { z: 35, symbol: 'Br', mass: 79.904, exactMass: 78.918338 },
  Mo: { z: 42, symbol: 'Mo', mass: 95.95, exactMass: 97.905408 },
  Ru: { z: 44, symbol: 'Ru', mass: 101.07, exactMass: 101.904349 },
  Rh: { z: 45, symbol: 'Rh', mass: 102.906, exactMass: 102.905504 },
  Pd: { z: 46, symbol: 'Pd', mass: 106.42, exactMass: 105.903486 },
  Ag: { z: 47, symbol: 'Ag', mass: 107.868, exactMass: 106.905097 },
  Cd: { z: 48, symbol: 'Cd', mass: 112.414, exactMass: 113.903358 },
  I: { z: 53, symbol: 'I', mass: 126.904, exactMass: 126.904473 },
  W: { z: 74, symbol: 'W', mass: 183.84, exactMass: 183.950931 },
  Os: { z: 76, symbol: 'Os', mass: 190.23, exactMass: 191.96148 },
  Ir: { z: 77, symbol: 'Ir', mass: 192.217, exactMass: 192.962926 },
  Pt: { z: 78, symbol: 'Pt', mass: 195.084, exactMass: 194.964791 },
  Au: { z: 79, symbol: 'Au', mass: 196.967, exactMass: 196.966569 },
  Hg: { z: 80, symbol: 'Hg', mass: 200.592, exactMass: 201.970643 },
});

const Z_TO_SYMBOL: Record<number, string> = (() => {
  const m: Record<number, string> = {};
  for (const info of Object.values(ELEMENTS)) m[info.z] = info.symbol;
  return m;
})();

/** Normalize an input symbol to "Xx" casing (e.g. "cl" → "Cl"). */
export const normalizeElementSymbol = (raw: string): string => {
  const e = (raw || '').trim();
  if (!e) return '';
  return e.charAt(0).toUpperCase() + e.slice(1).toLowerCase();
};

export const elementInfo = (symbol: string): ElementInfo | undefined =>
  ELEMENTS[normalizeElementSymbol(symbol)];

export const atomicNumber = (symbol: string): number =>
  elementInfo(symbol)?.z ?? 0;

export const symbolForAtomicNumber = (z: number): string => Z_TO_SYMBOL[z] ?? '';

export const standardWeight = (symbol: string): number =>
  elementInfo(symbol)?.mass ?? 0;

export const monoisotopicMass = (symbol: string): number =>
  elementInfo(symbol)?.exactMass ?? 0;

/**
 * SMILES organic subset — atoms that may appear outside brackets.
 * (B, C, N, O, P, S, F, Cl, Br, I + aromatic forms.)
 */
export const ORGANIC_SUBSET = new Set(['B', 'C', 'N', 'O', 'P', 'S', 'F', 'Cl', 'Br', 'I']);

/**
 * Normal valence tiers used to compute implicit hydrogens. The smallest tier
 * that is ≥ the summed explicit bond order determines the H count.
 */
export const NORMAL_VALENCES: Readonly<Record<string, number[]>> = Object.freeze({
  H: [1],
  B: [3, 4],
  C: [4],
  N: [3],
  O: [2],
  F: [1],
  Si: [4],
  P: [3, 5],
  S: [2, 4, 6],
  Cl: [1],
  Br: [1],
  I: [1],
  Se: [2, 4, 6],
});

/**
 * Elements whose bonding capacity increases with positive charge (right side:
 * N, O, P, S, Se, halogens). C / Si lose capacity with |charge|. Boron is
 * handled separately in chargeAdjustedValences (B− → 4, B+ → 2).
 */
export const CHARGE_ADDS_VALENCE = new Set(['N', 'O', 'P', 'S', 'Se', 'F', 'Cl', 'Br', 'I']);
