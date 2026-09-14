/** Transition / main-group metals commonly used in coordination sketches. */
const COORDINATION_METALS = new Set([
  'Li', 'Na', 'K', 'Rb', 'Cs',
  'Be', 'Mg', 'Ca', 'Sr', 'Ba',
  'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn',
  'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd',
  'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg',
  'Al', 'Ga', 'In', 'Tl', 'Sn', 'Pb', 'Bi',
  'La', 'Ce', 'U',
]);

export function isCoordinationMetal(element: string): boolean {
  return COORDINATION_METALS.has(element);
}

/**
 * Max bond order sum allowed on an atom for drawing / validation.
 * Matches common organic sketcher conventions.
 * Coordination metals get a high ceiling so dative/ligand bonds can attach.
 */
export function getMaxValencyForElement(element: string, charge: number): number {
  const q = charge || 0;
  if (element === 'C') return Math.max(0, 4 - Math.abs(q));
  if (element === 'N') return Math.max(0, 3 + q);
  if (element === 'O') return Math.max(0, 2 + q);
  if (element === 'H') return Math.max(0, 1 - q);
  if (['F', 'Cl', 'Br', 'I'].includes(element)) return Math.max(0, 1 + q);
  if (element === 'P') return 5;
  if (element === 'S') return 6;
  if (element === 'B') return Math.max(0, 3 - Math.abs(q));
  if (element === 'Si') return 4;
  if (isCoordinationMetal(element)) return 12;
  return 4;
}

/**
 * Valency ceiling for **implicit hydrogen** counts and heteroatom labels (e.g. neutral S as -SH / -S- → cap 2, not SH₅).
 * Bond drawing / max connectivity still uses {@link getMaxValencyForElement}.
 * Coordination metals never get implicit H (Cu with 4 ligands must not read as CuH₈).
 */
export function getEffectiveValencyForImplicitHydrogen(element: string, charge: number): number {
  if (isCoordinationMetal(element)) return 0;
  const q = charge || 0;
  const phys = getMaxValencyForElement(element, charge);
  if (element === 'S' && q === 0) return Math.min(phys, 2);
  return phys;
}

const VALENCE_ELECTRONS: Record<string, number> = {
  H: 1, B: 3, C: 4, N: 5, O: 6, F: 7,
  Si: 4, P: 5, S: 6, Cl: 7, Br: 7, I: 7,
};

/**
 * Maximum Lewis-style lone pair count for an atom, given current bond-order sum.
 * This enforces electron-count consistency used by the lone-pair tool.
 */
export function getMaxLonePairsForAtom(
  element: string,
  charge: number,
  bondOrderSum: number,
): number {
  const ve = VALENCE_ELECTRONS[element] ?? 4;
  const nonBondingElectrons = ve - (charge || 0) - bondOrderSum;
  if (nonBondingElectrons <= 0) return 0;
  return Math.max(0, Math.floor(nonBondingElectrons / 2));
}

/**
 * Max |formal charge| from charge tools / typed labels (teaching sketcher limits).
 * Repeated clicks can reach +2 / +3 / −2 / −3 where chemistry allows.
 */
export function getMaxFormalChargeMagnitude(element: string): number {
  if (element === 'H') return 1;
  if (['F', 'Cl', 'Br', 'I'].includes(element)) return 1;
  if (element === 'C' || element === 'O') return 2;
  if (element === 'N') return 2;
  if (element === 'B' || element === 'P' || element === 'S' || element === 'Si') return 3;
  if (isCoordinationMetal(element)) return 4;
  return 3;
}

/** Whether applying `delta` to the atom's formal charge is allowed given current bonds. */
export function canApplyFormalChargeDelta(
  element: string,
  currentCharge: number,
  delta: number,
  bondOrderSum: number,
): boolean {
  if (!delta) return true;
  const next = currentCharge + delta;
  if (Math.abs(next) > getMaxFormalChargeMagnitude(element)) return false;
  if (bondOrderSum > getMaxValencyForElement(element, next)) return false;
  return true;
}
