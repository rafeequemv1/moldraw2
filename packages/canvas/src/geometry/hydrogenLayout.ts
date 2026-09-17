/**
 * Layout for implicit hydrogen stubs and "Hₙ" suffixes around an atom.
 * Stub / explicit-H atoms sit perpendicular to the chain; carbon labels stay
 * linear (CH₂, H₂C).
 */
import type { Atom, Molecule } from '@moldraw/domain';
import { isIsolatedWaterOxygen } from '@moldraw/domain';
import { angle0To2Pi } from './angles';
import type { Point } from './polygons';

const DEFAULT_BOND_LENGTH_PX = 45;
/** Pad past half the H glyph so the stub stroke does not graze the letter. */
const IMPLICIT_H_GLYPH_PAD_PX = 5;
/** Fallback half-width of “H” at the default 20px element font. */
const DEFAULT_H_GLYPH_HALF_PX = 7;

/** Distance from carbon to implicit-H label center — same as explicit H placement. */
export function implicitHydrogenLabelDist(bondLengthPx: number): number {
  const bl =
    Number.isFinite(bondLengthPx) && bondLengthPx > 0 ? bondLengthPx : DEFAULT_BOND_LENGTH_PX;
  return Math.max(12, Math.min(120, bl));
}

/** C–H stub ends before the H glyph, matching heteroatom trim on explicit H. */
export function implicitHydrogenBondEnd(
  labelDist: number,
  hGlyphHalfWidthPx: number = DEFAULT_H_GLYPH_HALF_PX,
): number {
  const half = Number.isFinite(hGlyphHalfWidthPx)
    ? Math.max(0, hGlyphHalfWidthPx)
    : DEFAULT_H_GLYPH_HALF_PX;
  return Math.max(0, labelDist - half - IMPLICIT_H_GLYPH_PAD_PX);
}

/** Default-bond-length fallback; prefer `implicitHydrogenLabelDist(bondLengthPx)`. */
export const IMPLICIT_H_LABEL_DIST = implicitHydrogenLabelDist(DEFAULT_BOND_LENGTH_PX);
/** Default-bond-length fallback; prefer `implicitHydrogenBondEnd(...)`. */
export const IMPLICIT_H_BOND_END = implicitHydrogenBondEnd(IMPLICIT_H_LABEL_DIST);

/**
 * Decide whether an "Hₙ" suffix belongs to the left of a heteroatom symbol.
 * We sum the x-components of all neighbor directions; if neighbors lean right,
 * the free side is left.
 */
/**
 * Neighbour atoms per atom id, built once per molecule revision. Every labelled
 * atom asks for its neighbours on every frame; without this index a document
 * with thousands of heteroatoms rescans every bond per label (O(atoms × bonds)).
 */
const neighborIndexByMolecule = new WeakMap<Molecule, Map<string, Atom[]>>();

const neighborsOf = (atom: Atom, mol: Molecule): Atom[] => {
  let idx = neighborIndexByMolecule.get(mol);
  if (!idx) {
    const atomById = new Map<string, Atom>();
    for (const a of mol.atoms) atomById.set(a.id, a);
    idx = new Map<string, Atom[]>();
    for (const b of mol.bonds) {
      const from = atomById.get(b.fromAtomId);
      const to = atomById.get(b.toAtomId);
      if (!from || !to) continue;
      let f = idx.get(from.id);
      if (!f) idx.set(from.id, (f = []));
      f.push(to);
      let t = idx.get(to.id);
      if (!t) idx.set(to.id, (t = []));
      t.push(from);
    }
    neighborIndexByMolecule.set(mol, idx);
  }
  return idx.get(atom.id) ?? [];
};

export const hGoesLeft = (atom: Atom, mol: Molecule): boolean => {
  const nbrs = neighborsOf(atom, mol);
  let sumX = 0;
  let heavy = 0;
  for (const n of nbrs) {
    // Explicit H must not flip CH₃ / OH when folding hydrogens (deterministic
    // from heavy-atom positions: neighbor to the right → tail on the left).
    if (n.element === 'H') continue;
    sumX += n.x - atom.x;
    heavy += 1;
  }
  if (heavy === 0) return false;
  return sumX > 0;
};

/**
 * Carbon formula labels: interior chain atoms stay -CHₙ- (H on the right).
 * Terminals still flip to HₙC- when the chain continues to the right.
 */
export const carbonLabelHGoesLeft = (atom: Atom, mol: Molecule): boolean => {
  if (atom.element !== 'C') return hGoesLeft(atom, mol);
  let heavy = 0;
  for (const n of neighborsOf(atom, mol)) {
    if (n.element !== 'H') heavy += 1;
  }
  if (heavy >= 2) return false;
  return hGoesLeft(atom, mol);
};

const unit = (a: number): Point => ({ x: Math.cos(a), y: Math.sin(a) });

const moreVerticalFirst = (a: number, b: number): number =>
  Math.abs(Math.sin(b)) - Math.abs(Math.sin(a));

/**
 * Unit vectors from `atom` toward implicit-H stub positions. Algorithm:
 * - 0 neighbors: spread evenly starting at the top.
 * - 1 neighbor: perpendicular to that bond (above/below a chain), then opposite.
 * - 2+ neighbors: one H per angular gap (largest first), extras in the largest gap.
 */
export const getHydrogenStubDirections = (
  atom: Atom,
  mol: Molecule,
  count: number,
): Point[] => {
  if (count <= 0) return [];

  const neighborAngles: number[] = [];
  for (const n of neighborsOf(atom, mol)) {
    neighborAngles.push(Math.atan2(n.y - atom.y, n.x - atom.x));
  }

  if (neighborAngles.length === 0) {
    // Isolated water: textbook V (≈120°), not a linear H–O–H / H₂O formula.
    if (atom.element === 'O' && count === 2) {
      return [unit(Math.PI / 6), unit((5 * Math.PI) / 6)];
    }
    return Array.from({ length: count }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
      return unit(a);
    });
  }

  if (neighborAngles.length === 1) {
    const axis = neighborAngles[0];
    if (atom.element === 'O' && count === 1 && isIsolatedWaterOxygen(atom, mol)) {
      const c1 = axis + (2 * Math.PI) / 3;
      const c2 = axis - (2 * Math.PI) / 3;
      return [unit(Math.sin(c1) >= Math.sin(c2) ? c1 : c2)];
    }
    const pA = axis + Math.PI / 2;
    const pB = axis - Math.PI / 2;
    const perps = [pA, pB].sort(moreVerticalFirst);
    const angles =
      count === 1 ? [perps[0]] : count === 2 ? [pA, pB] : [...perps, axis + Math.PI];
    return angles.slice(0, count).map(unit);
  }

  const A = neighborAngles.map(angle0To2Pi).sort((x, y) => x - y);
  type Gap = { start: number; end: number; size: number };
  const gaps: Gap[] = [];
  for (let i = 0; i < A.length; i++) {
    const start = A[i];
    const end = i + 1 < A.length ? A[i + 1] : A[0] + 2 * Math.PI;
    gaps.push({ start, end, size: end - start });
  }
  gaps.sort((g, h) => h.size - g.size);

  if (count === 1) {
    const best = gaps[0];
    const t = best.start + best.size / 2;
    return [unit(t)];
  }

  const dirs: Point[] = [];
  for (let i = 0; i < Math.min(count, gaps.length); i++) {
    const g = gaps[i];
    dirs.push(unit(g.start + g.size / 2));
  }
  if (dirs.length < count) {
    const best = gaps[0];
    const margin = Math.min(best.size * 0.12, 0.35);
    const usable = Math.max(best.size - 2 * margin, best.size * 0.5);
    const lo = best.start + margin;
    const extra = count - dirs.length;
    for (let i = 0; i < extra; i++) {
      dirs.push(unit(lo + (usable * (i + 1)) / (extra + 1)));
    }
  }
  return dirs.slice(0, count);
};
