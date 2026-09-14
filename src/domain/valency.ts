/**
 * Max bond order sum allowed on an atom for drawing / validation.
 * Matches common organic sketcher conventions.
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
  return 4;
}

/**
 * Valency ceiling for **implicit hydrogen** counts and heteroatom labels (e.g. neutral S as -SH / -S- → cap 2, not SH₅).
 * Bond drawing / max connectivity still uses {@link getMaxValencyForElement}.
 */
export function getEffectiveValencyForImplicitHydrogen(element: string, charge: number): number {
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
