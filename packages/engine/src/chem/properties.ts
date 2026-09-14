/**
 * Molecular properties: Hill-order empirical formula, average MW, monoisotopic
 * exact mass, and net charge. Implicit hydrogens are computed on the Kekulé
 * form so aromatic atoms get correct H counts.
 */
import type { Molecule } from '@moldraw/domain';
import { buildGraph, explicitBondOrderSum } from '../graph';
import { standardWeight, monoisotopicMass, normalizeElementSymbol } from '../data/periodicTable';
import { implicitHForAtom } from './valence';
import { kekulize } from './aromaticity';
import type { MoleculeProperties } from '../types';

/** Element counts including implicit H (assumes/derives Kekulé form internally). */
export const elementCounts = (mol: Molecule): Record<string, number> => {
  const kek = kekulize(mol);
  const g = buildGraph(kek);
  const counts: Record<string, number> = {};
  let implicitH = 0;
  for (const a of kek.atoms) {
    const el = normalizeElementSymbol(a.element);
    if (!el) continue;
    counts[el] = (counts[el] || 0) + 1;
    const bondSum = explicitBondOrderSum(g, a.id);
    implicitH += implicitHForAtom(a.element, a.charge ?? 0, bondSum);
  }
  if (implicitH > 0) counts['H'] = (counts['H'] || 0) + implicitH;
  return counts;
};

/** Hill order: C, then H, then the rest alphabetically. */
export const hillOrder = (counts: Record<string, number>): string[] => {
  const elems = Object.keys(counts);
  return [
    ...['C', 'H'].filter(e => elems.includes(e)),
    ...elems.filter(e => e !== 'C' && e !== 'H').sort(),
  ];
};

export const formatFormula = (counts: Record<string, number>): string => {
  const order = hillOrder(counts);
  return order.map(el => (counts[el] > 1 ? `${el}${counts[el]}` : el)).join('');
};

export const moleculeProperties = (mol: Molecule): MoleculeProperties => {
  const counts = elementCounts(mol);
  const order = hillOrder(counts);
  let mw = 0;
  let exactMass = 0;
  for (const el of order) {
    mw += standardWeight(el) * counts[el];
    exactMass += monoisotopicMass(el) * counts[el];
  }
  const charge = mol.atoms.reduce((s, a) => s + (a.charge ?? 0), 0);
  return {
    formula: formatFormula(counts),
    formulaOrder: order,
    counts,
    mw: Math.round(mw * 1000) / 1000,
    exactMass: Math.round(exactMass * 1e6) / 1e6,
    charge,
  };
};
