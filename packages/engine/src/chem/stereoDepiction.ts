/**
 * Tetrahedral / double-bond stereo shared by the SMILES parser, the SMILES
 * writer and the 2D depiction layer.
 *
 * One parity convention everywhere:
 *   `atom.chiralParity` = sign of the scalar triple product of the vectors from
 *   the centre to its three lowest-id **heavy** (non-H) neighbours, in a
 *   right-handed frame. Hydrogens (explicit or implicit) never take part in the
 *   triple, so the value survives `stripTerminalHydrogensForLayout`.
 *
 * Depiction convention (matches `engine-3d/stereo.ts` and `chem/cip.ts`):
 *   canvas coordinates are y-down; we flip to paper space (y-up) and a solid
 *   wedge whose narrow end is the centre means the neighbour points toward the
 *   viewer (+z).
 */
import type { Bond, Molecule } from '@moldraw/domain';
import { buildGraph, type MoleculeGraph } from '../graph';
import { perceiveRings } from './rings';

export type Vec3 = [number, number, number];

/** Ideal tetrahedron; index 0 = viewer apex, 1..3 arranged anticlockwise seen from the apex. */
export const TETRA: Vec3[] = [
  [0, 0, 1],
  [0.942809, 0, -0.333333],
  [-0.471405, 0.816497, -0.333333],
  [-0.471405, -0.816497, -0.333333],
];

export const triple = (a: Vec3, b: Vec3, c: Vec3): number =>
  a[0] * (b[1] * c[2] - b[2] * c[1]) +
  a[1] * (b[2] * c[0] - b[0] * c[2]) +
  a[2] * (b[0] * c[1] - b[1] * c[0]);

export const isHydrogenElement = (el: string | undefined): boolean =>
  el === 'H' || el === 'D' || el === 'T';

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Three lowest-id heavy neighbours of `centerId`, or null when fewer than three. */
export const heavyNeighborTriple = (g: MoleculeGraph, centerId: string): string[] | null => {
  const node = g.nodes.get(centerId);
  if (!node) return null;
  const heavy = node.neighbors
    .filter(id => !isHydrogenElement(g.atomById.get(id)?.element))
    .sort(byId);
  return heavy.length >= 3 ? heavy.slice(0, 3) : null;
};

/**
 * Parity implied by a SMILES `@` / `@@` tag given the textual neighbour order
 * (4 entries; may include an implicit-H / lone-pair placeholder that is not in
 * `heavyTriple`). Returns 0 when the order does not contain the heavy triple.
 */
export const parityFromSmilesOrder = (
  textualOrder: readonly string[],
  tag: '@' | '@@',
  heavyTriple: readonly string[],
): number => {
  if (textualOrder.length !== 4) return 0;
  const vec = new Map<string, Vec3>();
  vec.set(textualOrder[0], TETRA[0]);
  vec.set(textualOrder[1], TETRA[1]);
  if (tag === '@') {
    vec.set(textualOrder[2], TETRA[2]);
    vec.set(textualOrder[3], TETRA[3]);
  } else {
    vec.set(textualOrder[2], TETRA[3]);
    vec.set(textualOrder[3], TETRA[2]);
  }
  const v = heavyTriple.map(id => vec.get(id));
  if (v.some(x => !x)) return 0;
  return Math.sign(triple(v[0]!, v[1]!, v[2]!));
};

/** Pick the SMILES tag that reproduces `parity` for a given textual order. */
export const smilesTagForParity = (
  textualOrder: readonly string[],
  parity: number,
  heavyTriple: readonly string[],
): '@' | '@@' | null => {
  const at = parityFromSmilesOrder(textualOrder, '@', heavyTriple);
  if (at === 0 || parity === 0) return null;
  return at === Math.sign(parity) ? '@' : '@@';
};

interface StereoOverride {
  bondId: string;
  stereo: 'wedge' | 'dash';
}

/**
 * Parity read from the 2D depiction (coordinates + wedge/dash bonds whose
 * narrow end is the centre). 0 when the centre carries no stereo bond or the
 * geometry is degenerate. `override` lets callers evaluate a hypothetical bond.
 */
export const parityFromDepiction = (
  g: MoleculeGraph,
  centerId: string,
  override?: StereoOverride,
): number => {
  const node = g.nodes.get(centerId);
  const center = g.atomById.get(centerId);
  if (!node || !center) return 0;
  const heavy = heavyNeighborTriple(g, centerId);
  if (!heavy) return 0;

  const zOf = new Map<string, number>();
  for (let k = 0; k < node.bonds.length; k++) {
    const bid = node.bonds[k];
    const b = g.bondById.get(bid);
    if (!b) continue;
    const stereo = override && override.bondId === bid ? override.stereo : b.stereo;
    if (stereo !== 'wedge' && stereo !== 'dash') continue;
    // Narrow end must be this centre (or the override, which we define as centre-narrow).
    if (!(override && override.bondId === bid) && b.fromAtomId !== centerId) continue;
    const other = b.fromAtomId === centerId ? b.toAtomId : b.fromAtomId;
    if (isHydrogenElement(g.atomById.get(other)?.element)) continue;
    zOf.set(other, stereo === 'wedge' ? 1 : -1);
  }
  if (zOf.size === 0) return 0;

  // Plain neighbours lie in the drawing plane (z = 0); the implicit H / 4th
  // substituent points the opposite way to the wedge. Only when the triple
  // consists solely of plain neighbours (the stereo bond is on the excluded
  // 4th heavy neighbour) do we tilt them away from the stereo bond.
  const vecsWith = (plainZ: number): Vec3[] =>
    heavy.map((id): Vec3 => {
      const a = g.atomById.get(id)!;
      const dx = a.x - center.x;
      const dy = -(a.y - center.y);
      const len = Math.hypot(dx, dy) || 1;
      const z = (zOf.get(id) ?? plainZ) * len * 0.5;
      return [dx, dy, z];
    });
  let vecs = vecsWith(0);
  let vol = triple(vecs[0], vecs[1], vecs[2]);
  if (Math.abs(vol) < 1e-6 && heavy.every(id => !zOf.has(id))) {
    const stereoSum = [...zOf.values()].reduce((s, z) => s + z, 0);
    vecs = vecsWith(-stereoSum / 3);
    vol = triple(vecs[0], vecs[1], vecs[2]);
  }
  return Math.abs(vol) < 1e-6 ? 0 : Math.sign(vol);
};

/** Effective parity: model field first, else depiction. */
export const effectiveParity = (g: MoleculeGraph, centerId: string): number => {
  const model = g.atomById.get(centerId)?.chiralParity;
  if (model !== undefined && model !== 0) return Math.sign(model);
  return parityFromDepiction(g, centerId);
};

const ringBondIds = (mol: Molecule): Set<string> => {
  const out = new Set<string>();
  for (const r of perceiveRings(mol)) for (const id of r.bondIds) out.add(id);
  return out;
};

/**
 * Add wedge/dash bonds so the 2D depiction shows every `chiralParity`.
 * Centres that already carry a stereo bond are left alone. Bond endpoints are
 * swapped when needed so the narrow end sits on the centre.
 */
export const applyStereoWedgesFromParity = (mol: Molecule): Molecule => {
  const centers = mol.atoms.filter(a => a.chiralParity !== undefined && a.chiralParity !== 0);
  if (centers.length === 0) return mol;
  const g = buildGraph(mol);
  const ringBonds = ringBondIds(mol);
  const bondPatch = new Map<string, Bond>();

  for (const center of centers) {
    const node = g.nodes.get(center.id);
    if (!node) continue;
    if (parityFromDepiction(g, center.id) !== 0) continue; // already depicted
    const want = Math.sign(center.chiralParity!);

    const candidates = node.bonds
      .map((bid, k) => ({ bid, other: node.neighbors[k] }))
      .filter(c => !isHydrogenElement(g.atomById.get(c.other)?.element))
      .filter(c => !bondPatch.has(c.bid) && !g.bondById.get(c.bid)?.stereo)
      .sort((p, q) => {
        const ringP = ringBonds.has(p.bid) ? 1 : 0;
        const ringQ = ringBonds.has(q.bid) ? 1 : 0;
        if (ringP !== ringQ) return ringP - ringQ;
        const degP = g.nodes.get(p.other)?.neighbors.length ?? 0;
        const degQ = g.nodes.get(q.other)?.neighbors.length ?? 0;
        if (degP !== degQ) return degP - degQ;
        return byId(p.other, q.other);
      });

    let chosen: StereoOverride | null = null;
    outer: for (const c of candidates) {
      for (const stereo of ['wedge', 'dash'] as const) {
        const got = parityFromDepiction(g, center.id, { bondId: c.bid, stereo });
        if (got === want) {
          chosen = { bondId: c.bid, stereo };
          break outer;
        }
      }
    }
    if (!chosen) continue;
    const b = g.bondById.get(chosen.bondId)!;
    const patched: Bond =
      b.fromAtomId === center.id
        ? { ...b, stereo: chosen.stereo }
        : { ...b, fromAtomId: b.toAtomId, toAtomId: b.fromAtomId, stereo: chosen.stereo };
    bondPatch.set(b.id, patched);
    g.bondById.set(b.id, patched);
  }
  if (bondPatch.size === 0) return mol;
  return { ...mol, bonds: mol.bonds.map(b => bondPatch.get(b.id) ?? b) };
};

const cross2 = (ux: number, uy: number, vx: number, vy: number): number => ux * vy - uy * vx;

/** Side (+1/−1/0) of point p relative to the directed line a→b (paper or screen — invariant for same/opposite tests). */
const sideOf = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  p: { x: number; y: number },
): number => Math.sign(cross2(b.x - a.x, b.y - a.y, p.x - a.x, p.y - a.y));

/** Atoms reachable from `start` without traversing `blockedBondId`. */
const reachableWithout = (g: MoleculeGraph, start: string, blockedBondId: string): Set<string> => {
  const seen = new Set<string>([start]);
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop()!;
    const node = g.nodes.get(cur);
    if (!node) continue;
    for (let k = 0; k < node.neighbors.length; k++) {
      if (node.bonds[k] === blockedBondId) continue;
      const nb = node.neighbors[k];
      if (!seen.has(nb)) {
        seen.add(nb);
        stack.push(nb);
      }
    }
  }
  return seen;
};

/**
 * Make the 2D depiction honour `bond.cisTransRef` by reflecting the substituent
 * subtree on the `toAtomId` side across the double-bond axis when the drawn
 * geometry disagrees. Ring double bonds are skipped.
 */
export const applyCisTransFromModel = (mol: Molecule): Molecule => {
  const marked = mol.bonds.filter(b => b.order === 2 && b.cisTransRef);
  if (marked.length === 0) return mol;
  const g = buildGraph(mol);
  const ringBonds = ringBondIds(mol);
  const pos = new Map(mol.atoms.map(a => [a.id, { x: a.x, y: a.y }]));
  let changed = false;

  for (const b of marked) {
    if (ringBonds.has(b.id)) continue;
    const ref = b.cisTransRef!;
    const j = pos.get(b.fromAtomId);
    const k = pos.get(b.toAtomId);
    const i = pos.get(ref.ref1);
    const l = pos.get(ref.ref2);
    if (!j || !k || !i || !l) continue;
    const sideI = sideOf(j, k, i);
    const sideL = sideOf(j, k, l);
    if (sideI === 0 || sideL === 0) continue;
    const drawnSame = sideI === sideL;
    if (drawnSame === ref.sameSide) continue;

    const subtree = reachableWithout(g, b.toAtomId, b.id);
    if (subtree.has(b.fromAtomId)) continue; // ring — cannot reflect independently
    // Reflect subtree across the line j→k.
    const ax = k.x - j.x;
    const ay = k.y - j.y;
    const len2 = ax * ax + ay * ay || 1;
    for (const id of subtree) {
      const p = pos.get(id)!;
      const px = p.x - j.x;
      const py = p.y - j.y;
      const t = (px * ax + py * ay) / len2;
      const fx = j.x + t * ax;
      const fy = j.y + t * ay;
      pos.set(id, { x: 2 * fx - p.x, y: 2 * fy - p.y });
    }
    changed = true;
  }
  if (!changed) return mol;
  return { ...mol, atoms: mol.atoms.map(a => ({ ...a, ...pos.get(a.id)! })) };
};

/** Cis/trans + wedges in one call — run after 2D layout of a parsed SMILES. */
export const applyModelStereoToDepiction = (mol: Molecule): Molecule =>
  applyStereoWedgesFromParity(applyCisTransFromModel(mol));

/**
 * Double-bond geometry readable from the depiction: for each non-ring double
 * bond with a heavy substituent on both ends, the chosen reference atoms and
 * whether they are drawn on the same side.
 */
export const perceiveCisTransFromDepiction = (
  mol: Molecule,
  g: MoleculeGraph = buildGraph(mol),
): Map<string, { ref1: string; ref2: string; sameSide: boolean }> => {
  const out = new Map<string, { ref1: string; ref2: string; sameSide: boolean }>();
  const ringBonds = ringBondIds(mol);
  const pickRef = (ids: string[]): string | undefined =>
    [...ids]
      .sort((a, b) => {
        const ha = isHydrogenElement(g.atomById.get(a)?.element) ? 1 : 0;
        const hb = isHydrogenElement(g.atomById.get(b)?.element) ? 1 : 0;
        if (ha !== hb) return ha - hb;
        return byId(a, b);
      })[0];
  for (const b of mol.bonds) {
    if (b.order !== 2 || b.aromatic || ringBonds.has(b.id)) continue;
    if (b.cisTransRef) {
      out.set(b.id, b.cisTransRef);
      continue;
    }
    const j = g.atomById.get(b.fromAtomId);
    const k = g.atomById.get(b.toAtomId);
    if (!j || !k) continue;
    const jn = (g.nodes.get(j.id)?.neighbors ?? []).filter(n => n !== k.id);
    const kn = (g.nodes.get(k.id)?.neighbors ?? []).filter(n => n !== j.id);
    // Not stereogenic when either end has two identical substituents (element-level check).
    const same = (ids: string[]): boolean =>
      ids.length === 2 &&
      g.atomById.get(ids[0])?.element === g.atomById.get(ids[1])?.element &&
      (g.nodes.get(ids[0])?.neighbors.length ?? 0) === 1 &&
      (g.nodes.get(ids[1])?.neighbors.length ?? 0) === 1;
    if (jn.length === 0 || kn.length === 0 || same(jn) || same(kn)) continue;
    const ref1 = pickRef(jn);
    const ref2 = pickRef(kn);
    if (!ref1 || !ref2) continue;
    const i = g.atomById.get(ref1)!;
    const l = g.atomById.get(ref2)!;
    const sideI = sideOf(j, k, i);
    const sideL = sideOf(j, k, l);
    if (sideI === 0 || sideL === 0) continue;
    out.set(b.id, { ref1, ref2, sameSide: sideI === sideL });
  }
  return out;
};
