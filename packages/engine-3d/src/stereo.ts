/**
 * Stereochemistry perception from a 2D depiction (wedge/dash bonds + drawn
 * coordinates). Produces layout-independent constraints that the 3D minimizer
 * enforces so conformers match the drawn chirality and double-bond geometry.
 *
 * Constraints reference atoms by id (stable across re-layout) and are converted
 * to index-based force-field terms at minimization time.
 *
 * Conventions:
 *   - Molecule coordinates are stored screen-space (y-down). We flip y back to
 *     paper space (y-up) so a solid wedge means "+z toward the viewer" in a
 *     right-handed frame — this makes the perceived handedness the *absolute*
 *     handedness the chemist drew.
 *   - Tetrahedral parity is the sign of the scalar triple product of three
 *     neighbor vectors about the center; the 3D term enforces the same sign
 *     with the same neighbor ordering.
 *   - Double-bond geometry is cis (reference substituents on the same side →
 *     dihedral ≈ 0) or trans (opposite → dihedral ≈ 180).
 */
import type { Molecule } from '@moldraw/domain';
import { buildGraph, type MoleculeGraph } from '@moldraw/engine';

export interface ChiralConstraint {
  center: string;
  n1: string;
  n2: string;
  n3: string;
  /** Desired sign of triple((n1-c),(n2-c),(n3-c)). */
  sign: number;
}

export interface CisTransConstraint {
  i: string;
  j: string;
  k: string;
  l: string;
  /** +1 for cis (dihedral 0), -1 for trans (dihedral 180). */
  desiredCos: number;
}

export interface StereoConstraints {
  chirals: ChiralConstraint[];
  cisTrans: CisTransConstraint[];
}

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

export const perceiveStereo = (
  mol: Molecule,
  g: MoleculeGraph = buildGraph(mol),
): StereoConstraints => {
  const atomById = new Map(mol.atoms.map(a => [a.id, a]));
  const chirals = perceiveTetrahedral(mol, g, atomById);
  const cisTrans = perceiveDoubleBonds(mol, g, atomById);

  // Model-level stereo (e.g. from SMILES @/@@ and /,\) is layout-independent and
  // takes precedence — it fills in what a depiction can't express.
  const model = perceiveFromModel(mol, g);
  const chiralCenters = new Set(chirals.map(c => c.center));
  for (const c of model.chirals) if (!chiralCenters.has(c.center)) chirals.push(c);
  const dbKey = (j: string, k: string): string => (j < k ? `${j}|${k}` : `${k}|${j}`);
  const seenDb = new Set(cisTrans.map(t => dbKey(t.j, t.k)));
  for (const t of model.cisTrans) if (!seenDb.has(dbKey(t.j, t.k))) cisTrans.push(t);

  return { chirals, cisTrans };
};

/** Read stereo from model fields (`atom.chiralParity`, `bond.cisTransRef`). */
const perceiveFromModel = (mol: Molecule, g: MoleculeGraph): StereoConstraints => {
  const chirals: ChiralConstraint[] = [];
  for (const a of mol.atoms) {
    if (a.chiralParity === undefined || a.chiralParity === 0) continue;
    // Parity is defined over the three lowest-id *heavy* neighbours (see
    // `@moldraw/engine` `chem/stereoDepiction.ts`) so it survives H stripping.
    const neighbors = [...(g.nodes.get(a.id)?.neighbors ?? [])]
      .filter(id => {
        const el = g.atomById.get(id)?.element;
        return el !== 'H' && el !== 'D' && el !== 'T';
      })
      .sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    if (neighbors.length < 3) continue;
    chirals.push({
      center: a.id,
      n1: neighbors[0],
      n2: neighbors[1],
      n3: neighbors[2],
      sign: Math.sign(a.chiralParity),
    });
  }

  const cisTrans: CisTransConstraint[] = [];
  for (const b of mol.bonds) {
    if (!b.cisTransRef) continue;
    cisTrans.push({
      i: b.cisTransRef.ref1,
      j: b.fromAtomId,
      k: b.toAtomId,
      l: b.cisTransRef.ref2,
      desiredCos: b.cisTransRef.sameSide ? 1 : -1,
    });
  }
  return { chirals, cisTrans };
};

const perceiveTetrahedral = (
  mol: Molecule,
  g: MoleculeGraph,
  atomById: Map<string, Molecule['atoms'][number]>,
): ChiralConstraint[] => {
  const out: ChiralConstraint[] = [];

  for (const center of mol.atoms) {
    const node = g.nodes.get(center.id);
    if (!node) continue;
    const neighbors = node.neighbors;
    if (neighbors.length < 3 || neighbors.length > 4) continue;

    // Per-neighbor out-of-plane z from a wedge/dash bond whose narrow end
    // (fromAtomId) is this center.
    const zOf = new Map<string, number>();
    let hasStereoBond = false;
    for (const bid of node.bonds) {
      const b = g.bondById.get(bid);
      if (!b || !b.stereo) continue;
      if (b.fromAtomId !== center.id && b.toAtomId !== center.id) continue;
      const narrowIsCenter = b.fromAtomId === center.id;
      const other = narrowIsCenter ? b.toAtomId : b.fromAtomId;
      if (!neighbors.includes(other)) continue;
      const sign = b.stereo === 'wedge' ? 1 : b.stereo === 'dash' ? -1 : 0;
      if (!sign) continue;
      // Flipping the bond swaps which end is narrow. The substituent's z
      // must invert with that flip, or the 3D center comes out backwards.
      zOf.set(other, narrowIsCenter ? sign : -sign);
      hasStereoBond = true;
    }
    if (!hasStereoBond) continue;

    // Order neighbors: those carrying a stereo bond first (so the chosen 3 are
    // non-coplanar), then by id for determinism.
    const ordered = [...neighbors].sort((a, b) => {
      const za = zOf.has(a) ? 0 : 1;
      const zb = zOf.has(b) ? 0 : 1;
      if (za !== zb) return za - zb;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    const chosen = ordered.slice(0, 3);
    if (chosen.length < 3) continue;

    const c: P3 = { x: center.x, y: -center.y, z: 0 };
    const zScale = 0.5;
    const p = (id: string): P3 => {
      const a = atomById.get(id)!;
      const dx = a.x - center.x;
      const dy = -(a.y - center.y);
      const len2d = Math.hypot(dx, dy) || 1;
      const z = (zOf.get(id) ?? 0) * len2d * zScale;
      return { x: a.x, y: -a.y, z };
    };
    const p1 = p(chosen[0]);
    const p2 = p(chosen[1]);
    const p3 = p(chosen[2]);
    const vol = dot3(sub3(p1, c), cross3(sub3(p2, c), sub3(p3, c)));
    if (Math.abs(vol) < 1e-6) continue; // ambiguous (chosen neighbors coplanar)

    out.push({
      center: center.id,
      n1: chosen[0],
      n2: chosen[1],
      n3: chosen[2],
      sign: Math.sign(vol),
    });
  }

  return out;
};

/** True when j and k remain connected after removing their direct bond (ring). */
const inRing = (g: MoleculeGraph, j: string, k: string): boolean => {
  const seen = new Set<string>([j]);
  const stack = [j];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const nb of g.nodes.get(cur)?.neighbors ?? []) {
      if (cur === j && nb === k) continue; // skip the direct j-k bond once
      if (cur === k && nb === j) continue;
      if (seen.has(nb)) continue;
      if (nb === k) return true;
      seen.add(nb);
      stack.push(nb);
    }
  }
  return false;
};

const cross2d = (ux: number, uy: number, vx: number, vy: number): number => ux * vy - uy * vx;

const perceiveDoubleBonds = (
  mol: Molecule,
  g: MoleculeGraph,
  atomById: Map<string, Molecule['atoms'][number]>,
): CisTransConstraint[] => {
  const out: CisTransConstraint[] = [];

  for (const b of mol.bonds) {
    if (b.order !== 2 || b.aromatic) continue;
    const j = b.fromAtomId;
    const k = b.toAtomId;
    if (inRing(g, j, k)) continue; // ring geometry is fixed by the ring itself

    const jn = (g.nodes.get(j)?.neighbors ?? []).filter(n => n !== k);
    const kn = (g.nodes.get(k)?.neighbors ?? []).filter(n => n !== j);
    if (jn.length === 0 || kn.length === 0) continue;

    // Reference substituent on each end: prefer a heavy atom, deterministic.
    const pickRef = (ids: string[]): string =>
      [...ids].sort((a, x) => {
        const ha = atomById.get(a)!.element === 'H' ? 1 : 0;
        const hx = atomById.get(x)!.element === 'H' ? 1 : 0;
        if (ha !== hx) return ha - hx;
        return a < x ? -1 : a > x ? 1 : 0;
      })[0];
    const i = pickRef(jn);
    const l = pickRef(kn);

    const aj = atomById.get(j)!;
    const ak = atomById.get(k)!;
    const ai = atomById.get(i)!;
    const al = atomById.get(l)!;
    // Paper space (y flipped) — though same/opposite side is reflection-invariant.
    const axx = ak.x - aj.x;
    const axy = -(ak.y - aj.y);
    const sideI = Math.sign(cross2d(axx, axy, ai.x - aj.x, -(ai.y - aj.y)));
    const sideL = Math.sign(cross2d(axx, axy, al.x - aj.x, -(al.y - aj.y)));
    if (sideI === 0 || sideL === 0) continue; // collinear / undefined

    out.push({ i, j, k, l, desiredCos: sideI === sideL ? 1 : -1 });
  }

  return out;
};
