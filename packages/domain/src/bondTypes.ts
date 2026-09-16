/**
 * Bond chemistry / query kinds used by drawing tools, molfile I/O, and render.
 *
 * V2000 bond types: 1 single, 2 double, 3 triple, 4 aromatic,
 * 5 single-or-double, 6 single-or-aromatic, 7 double-or-aromatic, 8 any,
 * 9 dative (vendor extension). Stereo: 1 up, 3 cis/trans, 4 either, 6 down.
 */
import type { Bond } from './types';

export const BOND_STEREO = ['wedge', 'dash', 'wavy', 'either', 'cis_trans'] as const;
export type BondStereo = (typeof BOND_STEREO)[number];

export const BOND_QUERY_TYPES = [
  'any',
  'single_double',
  'single_aromatic',
  'double_aromatic',
] as const;
export type BondQueryType = (typeof BOND_QUERY_TYPES)[number];

export const MOLFILE_BOND_TYPE = {
  SINGLE: 1,
  DOUBLE: 2,
  TRIPLE: 3,
  AROMATIC: 4,
  SINGLE_OR_DOUBLE: 5,
  SINGLE_OR_AROMATIC: 6,
  DOUBLE_OR_AROMATIC: 7,
  ANY: 8,
  DATIVE: 9,
} as const;

/** Dative, H-bond, and query bonds do not consume covalent valency. */
export function bondSkipsCovalentValence(
  b: Pick<Bond, 'dative' | 'dotted' | 'queryType'>,
): boolean {
  return Boolean(b.dative || b.dotted || b.queryType);
}

/** Explicit covalent order contribution (aromatic counts as 1, like MDL type 4). */
export function covalentBondOrderContribution(b: Bond): number {
  if (bondSkipsCovalentValence(b)) return 0;
  return b.aromatic ? 1 : b.order;
}

export function molfileBondOrder(
  b: Pick<Bond, 'order' | 'aromatic' | 'queryType' | 'dative'>,
  dativeAsType9 = false,
): number {
  if (b.queryType === 'single_double') return MOLFILE_BOND_TYPE.SINGLE_OR_DOUBLE;
  if (b.queryType === 'single_aromatic') return MOLFILE_BOND_TYPE.SINGLE_OR_AROMATIC;
  if (b.queryType === 'double_aromatic') return MOLFILE_BOND_TYPE.DOUBLE_OR_AROMATIC;
  if (b.queryType === 'any') return MOLFILE_BOND_TYPE.ANY;
  if (b.aromatic) return MOLFILE_BOND_TYPE.AROMATIC;
  if (b.dative && dativeAsType9) return MOLFILE_BOND_TYPE.DATIVE;
  return b.order;
}

export function molfileBondStereoCode(b: Pick<Bond, 'stereo'>): number {
  if (b.stereo === 'wedge') return 1;
  if (b.stereo === 'cis_trans') return 3;
  if (b.stereo === 'wavy' || b.stereo === 'either') return 4;
  if (b.stereo === 'dash') return 6;
  return 0;
}

export function parseMolfileBondType(order: number): {
  order: number;
  aromatic?: boolean;
  dative?: boolean;
  queryType?: BondQueryType;
} {
  if (order === MOLFILE_BOND_TYPE.AROMATIC) return { order: 1, aromatic: true };
  if (order === MOLFILE_BOND_TYPE.SINGLE_OR_DOUBLE) return { order: 1, queryType: 'single_double' };
  if (order === MOLFILE_BOND_TYPE.SINGLE_OR_AROMATIC) {
    return { order: 1, queryType: 'single_aromatic' };
  }
  if (order === MOLFILE_BOND_TYPE.DOUBLE_OR_AROMATIC) {
    return { order: 1, queryType: 'double_aromatic' };
  }
  if (order === MOLFILE_BOND_TYPE.ANY) return { order: 1, queryType: 'any' };
  if (order === MOLFILE_BOND_TYPE.DATIVE) return { order: 1, dative: true };
  const clamped = Number.isFinite(order) && order >= 1 && order <= 3 ? order : 1;
  return { order: clamped };
}

export function parseMolfileBondStereo(
  stereoCode: number,
  order: number,
  aromatic?: boolean,
): BondStereo | undefined {
  if (aromatic) return undefined;
  if (stereoCode === 1) return 'wedge';
  if (stereoCode === 6) return 'dash';
  if (stereoCode === 3) return order === 2 ? 'cis_trans' : 'wavy';
  if (stereoCode === 4 || stereoCode === 9) return 'wavy';
  return undefined;
}
