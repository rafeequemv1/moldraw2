/**
 * Native CIP R/S and E/Z from 2D depiction (wedges + double-bond geometry).
 * Output matches engine-2d CipStereoTags shape for canvas labels.
 */
import type { Molecule } from '@moldraw/domain';
import { buildGraph } from '../graph';
import { moleculeToMolblockV2000 } from '../io/molblockV2000';
import { perceiveCisTransFromDepiction } from './stereoDepiction';

export interface CipAtomTag {
  atomIndex: number;
  cip: string;
}

export interface CipBondTag {
  bondIndex: number;
  cip: string;
}

export interface CipStereoTags {
  atomStereoTags: CipAtomTag[];
  bondStereoTags: CipBondTag[];
}

const ATOMIC_NUM: Record<string, number> = {
  H: 1,
  C: 6,
  N: 7,
  O: 8,
  F: 9,
  P: 15,
  S: 16,
  Cl: 17,
  Br: 35,
  I: 53,
  Si: 14,
  B: 5,
};

const priority = (el: string): number => ATOMIC_NUM[el] ?? 0;

interface P3 {
  x: number;
 y: number;
  z: number;
}

const sub3 = (a: P3, b: P3): P3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross3 = (a: P3, b: P3): P3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const dot3 = (a: P3, b: P3): number => a.x * b.x + a.y * b.y + a.z * b.z;

const screenToPaper = (x: number, y: number): P3 => ({ x, y: -y, z: 0 });

/** Rank neighbors by atomic number (simplified CIP — no full sequence rules). */
const rankNeighbors = (
  mol: Molecule,
  _centerId: string,
  neighborIds: string[],
): string[] =>
  [...neighborIds].sort((a, b) => {
    const ea = mol.atoms.find(x => x.id === a)?.element ?? '';
    const eb = mol.atoms.find(x => x.id === b)?.element ?? '';
    return priority(eb) - priority(ea);
  });

const chiralLabel = (
  mol: Molecule,
  centerId: string,
  g: ReturnType<typeof buildGraph>,
): 'R' | 'S' | null => {
  const node = g.nodes.get(centerId);
  if (!node) return null;
  const heavy = node.neighbors.filter(nb => {
    const el = mol.atoms.find(a => a.id === nb)?.element ?? '';
    return el !== 'H' && el !== 'D';
  });
  if (heavy.length < 3) return null;

  const ranked = rankNeighbors(mol, centerId, heavy);
  const top3 = ranked.slice(0, 3);
  if (top3.length < 3) return null;

  const c = mol.atoms.find(a => a.id === centerId)!;
  const cp = screenToPaper(c.x, c.y);
  const vecs = top3.map(id => {
    const a = mol.atoms.find(x => x.id === id)!;
    const ap = screenToPaper(a.x, a.y);
    return sub3(ap, cp);
  });

  // Wedge/dash (narrow end at the centre): +z for wedged neighbour, −z for dashed.
  // Plain neighbours tilt the opposite way so a single wedge on the lowest
  // priority substituent (or on the 4th, unranked one) still defines the centre.
  const zOf = new Map<string, number>();
  for (const bid of node.bonds) {
    const b = g.bondById.get(bid);
    if (!b || (b.stereo !== 'wedge' && b.stereo !== 'dash')) continue;
    if (b.fromAtomId !== centerId) continue;
    zOf.set(b.toAtomId, b.stereo === 'wedge' ? 1 : -1);
  }
  if (zOf.size === 0) return null;
  const applyZ = (plainZ: number): void => {
    top3.forEach((id, idx) => {
      const v = vecs[idx]!;
      const len = Math.hypot(v.x, v.y) || 1;
      v.z = (zOf.get(id) ?? plainZ) * len * 0.5;
    });
  };
  applyZ(0);
  let triple = dot3(vecs[0]!, cross3(vecs[1]!, vecs[2]!));
  if (Math.abs(triple) < 1e-6 && top3.every(id => !zOf.has(id))) {
    // Stereo bond sits on the lowest-priority (excluded) substituent: tilt the
    // ranked three away from it.
    const stereoSum = [...zOf.values()].reduce((s, z) => s + z, 0);
    applyZ(-stereoSum / 3);
    triple = dot3(vecs[0]!, cross3(vecs[1]!, vecs[2]!));
  }
  if (Math.abs(triple) < 1e-6) return null;
  return triple > 0 ? 'R' : 'S';
};

/**
 * E/Z for a stereogenic, non-ring double bond. Uses the highest-priority
 * (atomic number) substituent on each end; same side → Z, opposite → E.
 */
const doubleBondLabel = (
  mol: Molecule,
  bondIndex: number,
  g: ReturnType<typeof buildGraph>,
  stereogenic: ReadonlySet<string>,
): 'E' | 'Z' | null => {
  const b = mol.bonds[bondIndex];
  if (!b || b.order !== 2 || !stereogenic.has(b.id)) return null;
  const a1 = mol.atoms.find(a => a.id === b.fromAtomId);
  const a2 = mol.atoms.find(a => a.id === b.toAtomId);
  if (!a1 || !a2) return null;

  const heavySubs = (center: string, other: string): string[] =>
    rankNeighbors(
      mol,
      center,
      (g.nodes.get(center)?.neighbors ?? []).filter(
        nb => nb !== other && mol.atoms.find(a => a.id === nb)?.element !== 'H',
      ),
    );
  const subs1 = heavySubs(a1.id, a2.id);
  const subs2 = heavySubs(a2.id, a1.id);
  if (subs1.length === 0 || subs2.length === 0) return null;

  const s1 = mol.atoms.find(a => a.id === subs1[0]!)!;
  const s2 = mol.atoms.find(a => a.id === subs2[0]!)!;

  const side = (p: { x: number; y: number }): number =>
    Math.sign((a2.x - a1.x) * (p.y - a1.y) - (a2.y - a1.y) * (p.x - a1.x));
  const side1 = side(s1);
  const side2 = side(s2);
  if (side1 === 0 || side2 === 0) return null;
  return side1 === side2 ? 'Z' : 'E';
};

/**
 * Calculate CIP tags from 2D coords + wedge bonds.
 * Atom/bond indices match molblock write order.
 */
export const calculateCip = (mol: Molecule): CipStereoTags => {
  if (mol.atoms.length === 0) return { atomStereoTags: [], bondStereoTags: [] };
  void moleculeToMolblockV2000(mol); // ensure stable ordering convention
  const g = buildGraph(mol);
  const atomStereoTags: CipAtomTag[] = [];
  const bondStereoTags: CipBondTag[] = [];

  mol.atoms.forEach((a, atomIndex) => {
    if (a.element === 'H' || a.element === 'D') return;
    const label = chiralLabel(mol, a.id, g);
    if (label) atomStereoTags.push({ atomIndex, cip: label });
  });

  const stereogenic = new Set(perceiveCisTransFromDepiction(mol, g).keys());
  mol.bonds.forEach((b, bondIndex) => {
    if (b.order !== 2) return;
    const label = doubleBondLabel(mol, bondIndex, g, stereogenic);
    if (label) bondStereoTags.push({ bondIndex, cip: label });
  });

  return { atomStereoTags, bondStereoTags };
};
