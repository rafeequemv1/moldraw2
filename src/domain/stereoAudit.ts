import type { Molecule } from './types';

/** True when wedge/hash counts look conflicting for this coordination number. */
const stereoDepictsConflict = (wedges: number, dashes: number, coordination: number): boolean => {
  // Octahedral / TBP drawings commonly use two wedges + two hashes from the center.
  if (coordination >= 5) return wedges > 2 || dashes > 2;
  return wedges > 1 || dashes > 1 || wedges + dashes > 2;
};

/**
 * Atoms that deserve an on-canvas stereochemistry warning (amber halo).
 * Heuristics: conflicting wedge/hash directions from one center, or a
 * tetrahedral-like carbon with four distinct neighbors but no wedge/dash drawn.
 */
export function analyzeStereoIssues(mol: Molecule): ReadonlySet<string> {
  const warned = new Set<string>();

  for (const atom of mol.atoms) {
    const incident = mol.bonds.filter(b => b.fromAtomId === atom.id || b.toAtomId === atom.id);

    const wedgesFrom = incident.filter(b => b.stereo === 'wedge' && b.fromAtomId === atom.id);
    const dashesFrom = incident.filter(b => b.stereo === 'dash' && b.fromAtomId === atom.id);

    if (stereoDepictsConflict(wedgesFrom.length, dashesFrom.length, incident.length)) {
      warned.add(atom.id);
      continue;
    }

    const singleCount = incident.filter(b => b.order === 1).length;
    const hasStereoBond = incident.some(b => b.stereo === 'wedge' || b.stereo === 'dash');
    if (
      atom.element === 'C' &&
      incident.length === 4 &&
      singleCount === 4 &&
      !hasStereoBond
    ) {
      const nbrs = incident.map(b => (b.fromAtomId === atom.id ? b.toAtomId : b.fromAtomId));
      const els = nbrs.map(id => mol.atoms.find(a => a.id === id)?.element ?? '?');
      if (new Set(els).size === 4) {
        warned.add(atom.id);
      }
    }
  }

  return warned;
}
