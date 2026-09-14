import type { Atom, Molecule } from '@moldraw/domain';
import type {
  FischerProjectionData,
  FischerProjectionResult,
  FischerRow,
} from '../types';

const atomLabel = (a: Atom): string => (a.alias?.trim() || a.element || 'C').toUpperCase();

const neighborsOf = (mol: Molecule, atomId: string): Atom[] => {
  const out: Atom[] = [];
  for (const b of mol.bonds) {
    if (b.fromAtomId === atomId) {
      const n = mol.atoms.find(a => a.id === b.toAtomId);
      if (n) out.push(n);
    } else if (b.toAtomId === atomId) {
      const n = mol.atoms.find(a => a.id === b.fromAtomId);
      if (n) out.push(n);
    }
  }
  return out;
};

const orderChain = (mol: Molecule, chainAtomIds: string[]): string[] | null => {
  const set = new Set(chainAtomIds);
  const degree = new Map<string, number>();
  for (const id of chainAtomIds) degree.set(id, 0);
  for (const b of mol.bonds) {
    if (set.has(b.fromAtomId) && set.has(b.toAtomId)) {
      degree.set(b.fromAtomId, (degree.get(b.fromAtomId) || 0) + 1);
      degree.set(b.toAtomId, (degree.get(b.toAtomId) || 0) + 1);
    }
  }
  const endpoints = chainAtomIds.filter(id => (degree.get(id) || 0) === 1);
  const bad = chainAtomIds.some(id => (degree.get(id) || 0) > 2 || (degree.get(id) || 0) < 1);
  if (bad || endpoints.length !== 2) return null;

  const sortedEndpoints = [...endpoints].sort((a, b) => {
    const aa = mol.atoms.find(x => x.id === a);
    const bb = mol.atoms.find(x => x.id === b);
    if (!aa || !bb) return 0;
    return aa.y - bb.y;
  });
  const start = sortedEndpoints[0];
  const path: string[] = [start];
  let prev: string | null = null;
  let cur = start;
  while (path.length < chainAtomIds.length) {
    const next = neighborsOf(mol, cur)
      .map(n => n.id)
      .find(id => set.has(id) && id !== prev && !path.includes(id));
    if (!next) return null;
    path.push(next);
    prev = cur;
    cur = next;
  }
  return path;
};

const chooseSideLabels = (
  center: Atom,
  outside: Atom[],
): { leftLabel: string; rightLabel: string } => {
  if (outside.length === 0) return { leftLabel: 'H', rightLabel: 'H' };
  if (outside.length === 1) {
    const only = outside[0];
    if (only.x < center.x) return { leftLabel: atomLabel(only), rightLabel: 'H' };
    return { leftLabel: 'H', rightLabel: atomLabel(only) };
  }
  const sorted = [...outside].sort((a, b) => (a.x - center.x) - (b.x - center.x));
  const left = sorted[0];
  const right = sorted[sorted.length - 1];
  if (!left || !right || left.id === right.id) return { leftLabel: atomLabel(outside[0]), rightLabel: 'H' };
  return { leftLabel: atomLabel(left), rightLabel: atomLabel(right) };
};

export const buildFischerProjection = (
  mol: Molecule,
  chainAtomIds: string[],
): FischerProjectionResult => {
  if (chainAtomIds.length < 2) {
    return { data: null, error: 'Select at least two carbon atoms in one chain.' };
  }
  const uniqueIds = [...new Set(chainAtomIds)];
  if (uniqueIds.length !== chainAtomIds.length) {
    return { data: null, error: 'Selection contains duplicate atoms.' };
  }
  const atoms = uniqueIds.map(id => mol.atoms.find(a => a.id === id)).filter((a): a is Atom => Boolean(a));
  if (atoms.length !== uniqueIds.length) {
    return { data: null, error: 'Some selected atoms are missing.' };
  }
  if (atoms.some(a => a.element.toUpperCase() !== 'C')) {
    return { data: null, error: 'Fischer tool currently supports carbon-chain selections only.' };
  }
  const ordered = orderChain(mol, uniqueIds);
  if (!ordered) {
    return { data: null, error: 'Selection must be one continuous non-cyclic chain.' };
  }
  if (ordered.length < 3) {
    return { data: null, error: 'Select a longer chain (3+ carbons) for a useful Fischer projection.' };
  }

  const chainSet = new Set(ordered);
  const first = mol.atoms.find(a => a.id === ordered[0]);
  const last = mol.atoms.find(a => a.id === ordered[ordered.length - 1]);
  if (!first || !last) return { data: null, error: 'Failed to build projection.' };

  const firstOutside = neighborsOf(mol, first.id).filter(n => !chainSet.has(n.id));
  const lastOutside = neighborsOf(mol, last.id).filter(n => !chainSet.has(n.id));

  const rows: FischerRow[] = ordered.slice(1, -1).map(id => {
    const center = mol.atoms.find(a => a.id === id)!;
    const outside = neighborsOf(mol, id).filter(n => !chainSet.has(n.id));
    const side = chooseSideLabels(center, outside);
    return {
      atomId: center.id,
      centerLabel: atomLabel(center),
      leftLabel: side.leftLabel,
      rightLabel: side.rightLabel,
    };
  });

  const data: FischerProjectionData = {
    chainAtomIds: ordered,
    topLabel: firstOutside[0] ? atomLabel(firstOutside[0]) : 'H',
    bottomLabel: lastOutside[0] ? atomLabel(lastOutside[0]) : 'H',
    rows,
  };
  return { data };
};
