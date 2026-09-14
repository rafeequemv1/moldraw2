/**
 * Preserve stereochemistry during coordinate merge (cleanup / layout).
 */
import type { Molecule } from '@moldraw/domain';
import { buildGraph } from '../graph';

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

/** Sign of scalar triple product at a chiral center (from wedges + coords). */
const chiralSign = (mol: Molecule, centerId: string, g: ReturnType<typeof buildGraph>): number => {
  const node = g.nodes.get(centerId);
  if (!node) return 0;
  const heavy = node.neighbors.filter(nb => {
    const el = mol.atoms.find(a => a.id === nb)?.element ?? '';
    return el !== 'H' && el !== 'D';
  });
  if (heavy.length < 3) return 0;
  const c = mol.atoms.find(a => a.id === centerId)!;
  const cp = screenToPaper(c.x, c.y);
  const pts = heavy.slice(0, 3).map(id => {
    const a = mol.atoms.find(x => x.id === id)!;
    return sub3(screenToPaper(a.x, a.y), cp);
  });
  for (const bid of node.bonds) {
    const b = g.bondById.get(bid);
    if (!b) continue;
    const other = b.fromAtomId === centerId ? b.toAtomId : b.fromAtomId;
    const idx = heavy.indexOf(other);
    if (idx < 0 || idx > 2) continue;
    if (b.stereo === 'wedge') pts[idx]!.z = 1;
    if (b.stereo === 'dash') pts[idx]!.z = -1;
  }
  return dot3(pts[0]!, cross3(pts[1]!, pts[2]!));
};

const hasStereoBonds = (mol: Molecule): boolean =>
  mol.bonds.some(b => b.stereo === 'wedge' || b.stereo === 'dash' || b.stereo === 'wavy');

/** Mirror all heavy-atom x coords about centroid (fixes inverted chirality). */
export const mirrorMoleculeX = (mol: Molecule): Molecule => {
  const heavy = mol.atoms.filter(a => a.element !== 'H' && a.element !== 'D');
  if (heavy.length === 0) return mol;
  const cx = heavy.reduce((s, a) => s + a.x, 0) / heavy.length;
  return {
    ...mol,
    atoms: mol.atoms.map(a => ({ ...a, x: 2 * cx - a.x })),
  };
};

/**
 * If layout inverted any chiral center, mirror the laid molecule to restore parity.
 */
export const preserveStereoOnMerge = (original: Molecule, laid: Molecule): Molecule => {
  if (!hasStereoBonds(original)) return laid;
  const g0 = buildGraph(original);
  const g1 = buildGraph(laid);
  const centers = original.atoms.filter(a => {
    const nbs = g0.nodes.get(a.id)?.neighbors ?? [];
    const heavy = nbs.filter(nb => {
      const el = original.atoms.find(x => x.id === nb)?.element ?? '';
      return el !== 'H' && el !== 'D';
    });
    return heavy.length >= 3;
  });

  let inverted = 0;
  let matched = 0;
  for (const c of centers) {
    const laidAtom = laid.atoms.find(a => a.id === c.id);
    if (!laidAtom) continue;
    const s0 = chiralSign(original, c.id, g0);
    const s1 = chiralSign(laid, laidAtom.id, g1);
    if (s0 === 0 || s1 === 0) continue;
    matched++;
    if (s0 * s1 < 0) inverted++;
  }
  if (matched > 0 && inverted > matched / 2) {
    return mirrorMoleculeX(laid);
  }
  return laid;
};
