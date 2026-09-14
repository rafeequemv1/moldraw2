/**
 * Phase A native 3D embedder (rule-based + light relaxation).
 *
 * Pipeline:
 *   1. Kekulize, perceive rings + hybridization.
 *   2. Seed coordinates from the native 2D layout (xy in Å), then perturb into
 *      the z dimension to break planarity so sp³ centers can pucker.
 *   3. Relax with a compact force field: bond-length springs, 1–3 angle springs
 *      (toward the hybridization ideal angle), sp² planarity, and non-bonded
 *      repulsion. This lifts the flat seed into a chemically reasonable 3D
 *      conformer (tetrahedral centers, zig-zag chains, puckered rings).
 *   4. Optionally add explicit hydrogens, placed into the most open directions
 *      per VSEPR, then a short final relax.
 *
 * This is intentionally a "good enough" conformer for visualization / export /
 * seeding. Phase B (UFF) then minimizes with a real force field. When the
 * lifted depiction lands a cage / bridged polycycle in a strained basin, the
 * heavy skeleton is re-embedded by distance geometry (`distanceGeometry.ts`)
 * and the lowest-energy conformer wins.
 */
import type { Atom, Bond, Molecule } from '@moldraw/domain';
import { buildGraph, type MoleculeGraph } from '@moldraw/engine';
import { kekulize, perceiveAromaticity } from '@moldraw/engine';
import { implicitHydrogensForEmbedding } from '@moldraw/engine';
import { perceiveRings } from '@moldraw/engine';
import { targetBondLengthA } from '@moldraw/core';
import { IDEAL_ANGLE, perceiveHybridization, type Hybridization } from './hybridization';
import { placeHydrogensVsepr } from './placeHydrogens';
import { add, cross, distance, dot, normalize, scale, sub, v, length, type Vec3 } from './vec';
import { buildUffTopology, setStereoTerms } from './forcefield/uff';
import { coordinationGeometryFor, isUffMetal } from './forcefield/uffParams';
import { minimizeUff } from './forcefield/minimize';
import { tryIndigo2DSeed } from './indigoSeed';
import { perceiveStereo, type StereoConstraints } from './stereo';
import { enforceStereoConstraints } from './verifyStereo3D';
import { unthreadSeed } from './unthread';
import {
  DG_MAX_ATOMS,
  embedDistanceGeometry,
  heavyAtomStrain,
  isStrainedConformer,
} from './distanceGeometry';
import { snapCoordinationPolyhedra } from './coordinationSeed';

export interface Atom3D {
  id: string;
  element: string;
  charge: number;
  isotope?: number;
  pos: Vec3;
}

export interface Conformer {
  atoms: Atom3D[];
  bonds: Bond[];
}

export interface Embed3DOptions {
  includeHydrogens?: boolean;
  /** Phase-A preconditioner relaxation iterations (default 400). */
  iterations?: number;
  /**
   * Final energy minimization. 'uff' (default) runs a real UFF force-field
   * minimization for chemically accurate geometry; 'none' keeps only the fast
   * Phase-A relaxation.
   */
  forceField?: 'uff' | 'none';
  /** Max UFF minimizer iterations (default 500). */
  maxIterations?: number;
  /**
   * Starting 3D coordinates (Å, right-handed) by atom id. Seeded atoms start
   * here instead of the lifted 2D depiction so a re-minimization stays close
   * to (and oriented like) an existing conformer / canvas perspective pose.
   */
  seed3D?: ReadonlyMap<string, Vec3>;
}

/** Overlay `seed3D` onto a depiction-derived seed. Returns how many atoms were seeded. */
export const applySeed3D = (
  pos: Map<string, Vec3>,
  seed3D: ReadonlyMap<string, Vec3> | undefined,
  ids: Iterable<string>,
): number => {
  if (!seed3D || seed3D.size === 0) return 0;
  let count = 0;
  for (const id of ids) {
    const s = seed3D.get(id);
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.z)) continue;
    pos.set(id, { x: s.x, y: s.y, z: s.z });
    count += 1;
  }
  return count;
};

const bondTarget = (a: Atom, b: Atom, bond: Bond): number => {
  if (bond.aromatic) return targetBondLengthA(a.element, b.element, 'aromatic');
  const order = (bond.order === 2 ? 2 : bond.order === 3 ? 3 : 1) as 1 | 2 | 3;
  return targetBondLengthA(a.element, b.element, order);
};

/** Deterministic small perturbation so relaxation escapes the flat seed. */
const seedZ = (index: number): number => {
  const s = Math.sin(index * 12.9898) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 0.6;
};

interface AngleConstraint {
  i: string;
  j: string;
  target: number;
  /** Only enforce as a lower bound (coordination centres). */
  minOnly?: boolean;
}

interface RelaxContext {
  ids: string[];
  pos: Map<string, Vec3>;
  bonds: Bond[];
  bondTargets: Map<string, number>;
  angleConstraints: AngleConstraint[];
  neighbors: Map<string, string[]>;
  hyb: Map<string, Hybridization>;
  bondedPairs: Set<string>;
  /** When set, re-project aromatic rings onto their plane during relaxation. */
  aromaticPlanarize?: { mol: Molecule; g: MoleculeGraph };
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Project aromatic ring atoms onto their best-fit plane (Newell's method). */
const flattenAromaticRings = (pos: Map<string, Vec3>, mol: Molecule, g: MoleculeGraph): void => {
  const rings = perceiveRings(mol);
  for (const ring of rings) {
    const aromatic = ring.bondIds.some(bid => g.bondById.get(bid)?.aromatic);
    if (!aromatic) continue;
    const ids = ring.atomIds.filter(id => g.atomById.get(id)?.element !== 'H');
    if (ids.length < 3) continue;

    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i < ids.length; i++) {
      const p0 = pos.get(ids[i])!;
      const p1 = pos.get(ids[(i + 1) % ids.length])!;
      nx += (p0.y - p1.y) * (p0.z + p1.z);
      ny += (p0.z - p1.z) * (p0.x + p1.x);
      nz += (p0.x - p1.x) * (p0.y + p1.y);
    }
    const normal = normalize(v(nx, ny, nz));
    if (length(normal) < 1e-6) continue;

    const cen = ids.reduce((s, id) => add(s, pos.get(id)!), v(0, 0, 0));
    const center = scale(cen, 1 / ids.length);
    for (const id of ids) {
      const p = pos.get(id)!;
      const rel = sub(p, center);
      pos.set(id, sub(p, scale(normal, dot(rel, normal))));
    }
  }
};

const relax = (ctx: RelaxContext, iterations: number): void => {
  const { ids, pos, bonds, bondTargets, angleConstraints, neighbors, hyb, bondedPairs } = ctx;
  const doRepulsion = ids.length <= 600;

  for (let iter = 0; iter < iterations; iter++) {
    const disp = new Map<string, Vec3>();
    for (const id of ids) disp.set(id, v(0, 0, 0));

    // Bond length springs.
    for (const b of bonds) {
      const pa = pos.get(b.fromAtomId);
      const pb = pos.get(b.toAtomId);
      if (!pa || !pb) continue;
      const target = bondTargets.get(b.id) ?? 1.5;
      const d = distance(pa, pb) || 1e-6;
      const diff = (d - target) / d;
      const f = scale(sub(pb, pa), diff * 0.4);
      disp.set(b.fromAtomId, add(disp.get(b.fromAtomId)!, f));
      disp.set(b.toAtomId, add(disp.get(b.toAtomId)!, scale(f, -1)));
    }

    // 1–3 angle springs (as target distance between the two neighbors).
    for (const c of angleConstraints) {
      const pi = pos.get(c.i);
      const pj = pos.get(c.j);
      if (!pi || !pj) continue;
      const d = distance(pi, pj) || 1e-6;
      // Coordination centres: only push ligands apart to the smallest allowed
      // L–M–L angle (cis 90°, trans pairs may stay at 180°).
      if (c.minOnly && d >= c.target) continue;
      const diff = (d - c.target) / d;
      const f = scale(sub(pj, pi), diff * 0.2);
      disp.set(c.i, add(disp.get(c.i)!, f));
      disp.set(c.j, add(disp.get(c.j)!, scale(f, -1)));
    }

    // sp² planarity: pull the center onto the plane of its three neighbors.
    for (const id of ids) {
      if (hyb.get(id) !== 'sp2') continue;
      const ns = neighbors.get(id) ?? [];
      if (ns.length !== 3) continue;
      const p = pos.get(id)!;
      const a = pos.get(ns[0])!;
      const b = pos.get(ns[1])!;
      const cc = pos.get(ns[2])!;
      const nrm = normalize(cross(sub(b, a), sub(cc, a)));
      const signed = dot(sub(p, a), nrm);
      const f = scale(nrm, -signed * 0.5);
      disp.set(id, add(disp.get(id)!, f));
    }

    // Non-bonded repulsion (skip bonded pairs).
    if (doRepulsion) {
      for (let a = 0; a < ids.length; a++) {
        for (let b = a + 1; b < ids.length; b++) {
          if (bondedPairs.has(pairKey(ids[a], ids[b]))) continue;
          const pa = pos.get(ids[a])!;
          const pb = pos.get(ids[b])!;
          const d = distance(pa, pb);
          const minD = 2.4;
          if (d < minD && d > 1e-4) {
            const push = (minD - d) / d;
            const f = scale(sub(pa, pb), push * 0.25);
            disp.set(ids[a], add(disp.get(ids[a])!, f));
            disp.set(ids[b], add(disp.get(ids[b])!, scale(f, -1)));
          }
        }
      }
    }

    const damping = 0.9 * (1 - iter / iterations) + 0.1;
    for (const id of ids) {
      const d = disp.get(id)!;
      const mag = length(d);
      const cap = 0.4;
      const s = mag > cap ? cap / mag : 1;
      pos.set(id, add(pos.get(id)!, scale(d, s * damping)));
    }

    if (ctx.aromaticPlanarize && iter % 10 === 0) {
      flattenAromaticRings(pos, ctx.aromaticPlanarize.mol, ctx.aromaticPlanarize.g);
    }
  }
};

const buildAngleConstraints = (
  mol: Molecule,
  neighbors: Map<string, string[]>,
  hyb: Map<string, Hybridization>,
  atomById: Map<string, Atom>,
  bondByPair: (a: string, b: string) => Bond | undefined,
): AngleConstraint[] => {
  const out: AngleConstraint[] = [];
  for (const center of mol.atoms) {
    const ns = neighbors.get(center.id) ?? [];
    if (ns.length < 2) continue;
    // Metal centres: smallest L–M–L angle of the coordination polyhedron as a
    // lower bound (UFF then shapes the exact octahedron / square plane / TBP).
    const metal = isUffMetal(center.element);
    const theta = metal
      ? minCoordinationAngleRad(center.element, ns.length, center.charge ?? 0)
      : IDEAL_ANGLE[hyb.get(center.id) ?? 'sp3'];
    for (let a = 0; a < ns.length; a++) {
      for (let b = a + 1; b < ns.length; b++) {
        const ba = bondByPair(center.id, ns[a]);
        const bb = bondByPair(center.id, ns[b]);
        const na = atomById.get(ns[a]);
        const nb = atomById.get(ns[b]);
        if (!ba || !bb || !na || !nb) continue;
        const l1 = bondTarget(center, na, ba);
        const l2 = bondTarget(center, nb, bb);
        const target = Math.sqrt(l1 * l1 + l2 * l2 - 2 * l1 * l2 * Math.cos(theta));
        out.push({ i: ns[a], j: ns[b], target, ...(metal ? { minOnly: true } : {}) });
      }
    }
  }
  return out;
};

/** Smallest ideal L–M–L angle (radians) for a coordination centre. */
const minCoordinationAngleRad = (element: string, cn: number, charge: number): number => {
  const geom = coordinationGeometryFor(element, cn, charge);
  const deg =
    geom.kind === 'linear'
      ? 180
      : geom.kind === 'harmonic'
        ? geom.theta0
        : geom.kind === 'periodic4'
          ? 90
          : Math.min(...geom.thetas);
  return (deg * Math.PI) / 180;
};

/** Drop terminal explicit H atoms so 3D embedding adds a full implicit set. */
const stripTerminalHydrogens = (mol: Molecule): Molecule => {
  const keep = new Set(
    mol.atoms
      .filter(a => {
        if (a.element !== 'H') return true;
        const bonds = mol.bonds.filter(b => b.fromAtomId === a.id || b.toAtomId === a.id);
        return bonds.length !== 1 || bonds[0].order !== 1 || bonds[0].stereo;
      })
      .map(a => a.id),
  );
  return {
    ...mol,
    atoms: mol.atoms.filter(a => keep.has(a.id)),
    bonds: mol.bonds.filter(b => keep.has(b.fromAtomId) && keep.has(b.toAtomId)),
  };
};

const syncPosFromAtoms = (pos: Map<string, Vec3>, atoms: Atom3D[]): void => {
  for (const a of atoms) pos.set(a.id, { ...a.pos });
};

const heavyAtomsOnly = (mol: Molecule): Molecule['atoms'] =>
  mol.atoms.filter(a => a.element !== 'H');

/**
 * Bake a stereocenter's handedness into the seed by choosing out-of-plane z for
 * its three reference neighbors so the scalar triple product takes the desired
 * sign. Brute-forces the 8 sign patterns and keeps the strongest match.
 */
const seedChiralityZ = (
  pos: Map<string, Vec3>,
  con: { center: string; n1: string; n2: string; n3: string; sign: number },
): void => {
  const c = pos.get(con.center);
  const p1 = pos.get(con.n1);
  const p2 = pos.get(con.n2);
  const p3 = pos.get(con.n3);
  if (!c || !p1 || !p2 || !p3) return;
  const delta = 0.8;
  const tripleSign = (z1: number, z2: number, z3: number): number => {
    const a = sub({ x: p1.x, y: p1.y, z: c.z + z1 }, c);
    const b = sub({ x: p2.x, y: p2.y, z: c.z + z2 }, c);
    const d = sub({ x: p3.x, y: p3.y, z: c.z + z3 }, c);
    return dot(a, cross(b, d));
  };
  let best: { z: [number, number, number]; mag: number } | null = null;
  for (const z1 of [delta, -delta]) {
    for (const z2 of [delta, -delta]) {
      for (const z3 of [delta, -delta]) {
        const vol = tripleSign(z1, z2, z3);
        if (Math.sign(vol) !== con.sign) continue;
        const mag = Math.abs(vol);
        if (!best || mag > best.mag) best = { z: [z1, z2, z3], mag };
      }
    }
  }
  if (!best) return;
  pos.set(con.n1, { x: p1.x, y: p1.y, z: c.z + best.z[0] });
  pos.set(con.n2, { x: p2.x, y: p2.y, z: c.z + best.z[1] });
  pos.set(con.n3, { x: p3.x, y: p3.y, z: c.z + best.z[2] });
};

const dihedralCos = (pi: Vec3, pj: Vec3, pk: Vec3, pl: Vec3): number => {
  const b1 = sub(pj, pi);
  const b2 = sub(pk, pj);
  const b3 = sub(pl, pk);
  const n1 = cross(b1, b2);
  const n2 = cross(b2, b3);
  const denom = length(n1) * length(n2);
  if (denom < 1e-9) return 1;
  return Math.max(-1, Math.min(1, dot(n1, n2) / denom));
};

/**
 * Set a double bond's E/Z by rotating the k-side substituents 180° about the
 * j–k axis when the current i–j=k–l dihedral is on the wrong side. Decision and
 * geometry are fully 3D so it matches what the restraint measures.
 */
const seedCisTrans = (
  pos: Map<string, Vec3>,
  con: { i: string; j: string; k: string; l: string; desiredCos: number },
  adjacency: Map<string, string[]>,
): void => {
  const pj = pos.get(con.j);
  const pk = pos.get(con.k);
  const pi = pos.get(con.i);
  const pl = pos.get(con.l);
  if (!pj || !pk || !pi || !pl) return;
  const cos = dihedralCos(pi, pj, pk, pl);
  if (Math.sign(cos) === Math.sign(con.desiredCos)) return;

  // k-side component (reachable from k without passing through j).
  const comp = new Set<string>([con.k]);
  const stack = [con.k];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const nb of adjacency.get(cur) ?? []) {
      if (nb === con.j || comp.has(nb)) continue;
      comp.add(nb);
      stack.push(nb);
    }
  }
  // 180° rotation about the unit axis u through pj: R = 2 u uᵀ − I.
  const u = normalize(sub(pk, pj));
  for (const id of comp) {
    if (id === con.k) continue; // on the axis
    const p = pos.get(id);
    if (!p) continue;
    const rel = sub(p, pj);
    const proj = 2 * dot(rel, u);
    pos.set(id, add(pj, sub(scale(u, proj), rel)));
  }
};

export const embed3D = (input: Molecule, opts: Embed3DOptions = {}): Conformer => {
  // Perceive aromatic rings on drawn/Kekulé structures, then strip any terminal
  // explicit H so we always add a full implicit set for 3D.
  const mol = perceiveAromaticity(kekulize(stripTerminalHydrogens(input)));
  if (mol.atoms.length === 0) return { atoms: [], bonds: [] };

  const heavyIds = heavyAtomsOnly(mol).map(a => a.id);

  // Perceive stereochemistry from the original 2D depiction (wedge/dash + drawn
  // coords) before layout so the 3D minimizer can honor the drawn chirality.
  const stereo = perceiveStereo(input);

  const g = buildGraph(mol);
  const hyb = perceiveHybridization(mol, g);

  // Seed positions. When the input carries a real 2D depiction (drawn / from a
  // molblock), seed from it — this preserves double-bond (E/Z) geometry that a
  // fresh layout would randomize, and lets wedge/dash bonds set out-of-plane z
  // so the correct enantiomer is baked in before minimization (gradient descent
  // can't cross the inversion barrier on its own). Otherwise (e.g. SMILES with
  // no coordinates) fall back to the native 2D layout.
  const molAtomById = new Map(mol.atoms.map(a => [a.id, a]));
  let bondSum = 0;
  let bondCount = 0;
  for (const b of mol.bonds) {
    const a1 = molAtomById.get(b.fromAtomId);
    const a2 = molAtomById.get(b.toAtomId);
    if (a1 && a2) {
      bondSum += Math.hypot(a1.x - a2.x, a1.y - a2.y);
      bondCount += 1;
    }
  }
  const avgBond2D = bondCount > 0 ? bondSum / bondCount : 0;
  const hasDepiction = avgBond2D > 1e-6;

  const pos = new Map<string, Vec3>();
  const isAromaticAtom = (id: string): boolean =>
    mol.bonds.some(
      b => b.aromatic && (b.fromAtomId === id || b.toAtomId === id),
    );
  if (hasDepiction) {
    // Scale to ~1.5 Å bonds and flip y back to a right-handed (paper) frame.
    const factor = 1.5 / avgBond2D;
    mol.atoms.forEach((a, i) => {
      const planar = isAromaticAtom(a.id) || hyb.get(a.id) === 'sp2';
      const z = planar ? 0 : seedZ(i);
      pos.set(a.id, v(a.x * factor, -a.y * factor, z));
    });
    // Bake wedge/dash out-of-plane displacement (narrow end = fromAtomId).
    const OUT = 0.9;
    for (const b of mol.bonds) {
      if (!b.stereo || (b.stereo !== 'wedge' && b.stereo !== 'dash')) continue;
      const center = pos.get(b.fromAtomId);
      const nb = pos.get(b.toAtomId);
      if (!center || !nb) continue;
      pos.set(b.toAtomId, { x: nb.x, y: nb.y, z: center.z + (b.stereo === 'wedge' ? OUT : -OUT) });
    }
  } else {
    const seeded = tryIndigo2DSeed(mol);
    if (seeded) {
      const seededById = new Map(seeded.atoms.map(a => [a.id, a]));
      mol.atoms.forEach((a, i) => {
        const s = seededById.get(a.id);
        if (!s) return;
        const planar = isAromaticAtom(a.id) || hyb.get(a.id) === 'sp2';
        const z = planar ? 0 : seedZ(i);
        pos.set(a.id, v(s.x, s.y, z));
      });
    } else {
      mol.atoms.forEach((a, i) => {
        const planar = isAromaticAtom(a.id) || hyb.get(a.id) === 'sp2';
        pos.set(a.id, v((i % 8) * 1.5, Math.floor(i / 8) * 1.5, planar ? 0 : seedZ(i)));
      });
    }
  }

  // Existing 3D geometry wins over the lifted depiction (re-clean in place).
  const seededCount = applySeed3D(pos, opts.seed3D, mol.atoms.map(a => a.id));
  const seededFrom3D = seededCount > 0;

  const neighbors = new Map<string, string[]>();
  for (const a of mol.atoms) neighbors.set(a.id, g.nodes.get(a.id)?.neighbors ?? []);
  const atomById = new Map(mol.atoms.map(a => [a.id, a]));
  const bondByPair = (a: string, b: string): Bond | undefined => {
    const id = g.bondByPair.get(a < b ? `${a}|${b}` : `${b}|${a}`);
    return id ? g.bondById.get(id) : undefined;
  };

  const bondTargets = new Map<string, number>();
  for (const b of mol.bonds) {
    const a1 = atomById.get(b.fromAtomId);
    const a2 = atomById.get(b.toAtomId);
    if (a1 && a2) bondTargets.set(b.id, bondTarget(a1, a2, b));
  }

  const bondedPairs = new Set<string>();
  for (const b of mol.bonds) bondedPairs.add(pairKey(b.fromAtomId, b.toAtomId));

  const angleConstraints = buildAngleConstraints(mol, neighbors, hyb, atomById, bondByPair);

  // No drawn geometry (e.g. SMILES): bake perceived stereochemistry into the
  // seed. Gradient descent can't cross a stereocenter inversion barrier or flip
  // a double bond, so the correct handedness / E-Z must be present up front; the
  // restraints then hold it through minimization.
  if (
    !hasDepiction &&
    !seededFrom3D &&
    (stereo.chirals.length > 0 || stereo.cisTrans.length > 0)
  ) {
    const adjacency = new Map<string, string[]>();
    for (const a of mol.atoms) adjacency.set(a.id, []);
    for (const b of mol.bonds) {
      adjacency.get(b.fromAtomId)?.push(b.toAtomId);
      adjacency.get(b.toAtomId)?.push(b.fromAtomId);
    }
    for (const con of stereo.chirals) seedChiralityZ(pos, con);
    for (const con of stereo.cisTrans) seedCisTrans(pos, con, adjacency);
  }

  const hasAromaticBonds = mol.bonds.some(b => b.aromatic);
  if (hasAromaticBonds) flattenAromaticRings(pos, mol, g);

  // Separate interlocked / overlapping ring systems before relaxation — local
  // forces can never un-thread a ring, so it must be fixed in the seed.
  unthreadSeed(pos, mol, g);

  // Metal centres: arrange donors on the ideal coordination polyhedron (rotated
  // to match the seed) so ligands start around the metal rather than in a
  // plane. Repeated after relaxation so UFF starts inside the right basin.
  const hasMetals = mol.atoms.some(a => isUffMetal(a.element));
  if (hasMetals) snapCoordinationPolyhedra(pos, mol, g, bondTargets);

  relax(
    {
      ids: heavyIds,
      pos,
      bonds: mol.bonds,
      bondTargets,
      angleConstraints,
      neighbors,
      hyb,
      bondedPairs,
      ...(hasAromaticBonds ? { aromaticPlanarize: { mol, g } } : {}),
    },
    // A real 3D seed only needs a short preconditioning pass (new atoms settle);
    // a long Phase-A relax would drift away from the conformer we were given.
    seededFrom3D ? Math.min(opts.iterations ?? 400, 80) : opts.iterations ?? 400,
  );
  if (hasMetals) snapCoordinationPolyhedra(pos, mol, g, bondTargets);

  // Phase-A relax has no E/Z torsion terms — restore double-bond geometry after
  // the flat seed lifts into 3D (needed for forceField:'none' previews too).
  if (stereo.cisTrans.length > 0) {
    const adjacency = new Map<string, string[]>();
    for (const a of mol.atoms) adjacency.set(a.id, []);
    for (const b of mol.bonds) {
      adjacency.get(b.fromAtomId)?.push(b.toAtomId);
      adjacency.get(b.toAtomId)?.push(b.fromAtomId);
    }
    for (const con of stereo.cisTrans) seedCisTrans(pos, con, adjacency);
  }

  flattenAromaticRings(pos, mol, g);

  // Build the full conformer (heavy atoms + VSEPR-placed hydrogens) from a
  // heavy-atom position map. Factored so the DG fallback can rebuild it.
  const implicitH = opts.includeHydrogens ? implicitHydrogensForEmbedding(mol, g) : null;
  const buildConformer = (heavyPos: Map<string, Vec3>): { atoms: Atom3D[]; bonds: Bond[] } => {
    const heavy: Atom3D[] = heavyAtomsOnly(mol).map(a => ({
      id: a.id,
      element: a.element,
      charge: a.charge ?? 0,
      isotope: a.isotope,
      pos: { ...heavyPos.get(a.id)! },
    }));
    if (!implicitH) return { atoms: heavy, bonds: mol.bonds };
    const hAtoms: Atom3D[] = [];
    const hBonds: Bond[] = [];
    let hCounter = 0;
    for (const a of heavyAtomsOnly(mol)) {
      const n = implicitH.get(a.id) ?? 0;
      if (n <= 0) continue;
      const center = heavyPos.get(a.id)!;
      const nbrPositions = (neighbors.get(a.id) ?? [])
        .filter(nid => atomById.get(nid)?.element !== 'H')
        .map(nid => heavyPos.get(nid)!);
      const hs = placeHydrogensVsepr(center, nbrPositions, n, a.element, hyb.get(a.id) ?? 'sp3');
      for (const hp of hs) {
        hCounter += 1;
        const hid = `${a.id}_H${hCounter}`;
        hAtoms.push({ id: hid, element: 'H', charge: 0, pos: hp });
        hBonds.push({ id: `hb_${hCounter}`, fromAtomId: a.id, toAtomId: hid, order: 1 });
      }
    }
    return { atoms: [...heavy, ...hAtoms], bonds: [...mol.bonds, ...hBonds] };
  };

  let { atoms: allAtoms, bonds: allBonds } = buildConformer(pos);

  // Final geometry: real UFF force-field minimization (default), starting from
  // the Phase-A seed. Falls back to the seed if disabled.
  if ((opts.forceField ?? 'uff') === 'uff') {
    const maxIterations = opts.maxIterations ?? 500;
    const energy = minimizeConformer(allAtoms, allBonds, maxIterations, stereo);

    // Cage / bridged-polycycle rescue. A lifted depiction can seed an
    // "inside-out" cage that UFF relaxes into a strained local minimum (bonds
    // off by >12 %, or non-bonded heavy atoms overlapping). Re-embed the heavy
    // skeleton from graph distance bounds (distance geometry), which ignores
    // the depiction, and keep whichever conformer minimizes lower.
    if (
      heavyIds.length >= 4 &&
      heavyIds.length <= DG_MAX_ATOMS &&
      isStrainedConformer(heavyAtomStrain(allAtoms, allBonds, bondTargets))
    ) {
      let best = { atoms: allAtoms, bonds: allBonds, energy };
      for (let attempt = 1; attempt <= 4; attempt++) {
        const dg = embedDistanceGeometry({ mol, g, hyb, bondTargets, ids: heavyIds }, attempt);
        if (!dg) break;
        const dgPos = new Map(pos);
        for (const [id, p] of dg) dgPos.set(id, p);
        // Short Phase-A pass to settle angles / sp² planarity on the coarse
        // DG skeleton before the force field takes over.
        relax(
          { ids: heavyIds, pos: dgPos, bonds: mol.bonds, bondTargets, angleConstraints, neighbors, hyb, bondedPairs },
          60,
        );
        if (hasMetals) snapCoordinationPolyhedra(dgPos, mol, g, bondTargets);
        if (hasAromaticBonds) flattenAromaticRings(dgPos, mol, g);
        const cand = buildConformer(dgPos);
        const candEnergy = minimizeConformer(cand.atoms, cand.bonds, maxIterations, stereo);
        if (candEnergy < best.energy) best = { ...cand, energy: candEnergy };
        if (!isStrainedConformer(heavyAtomStrain(cand.atoms, cand.bonds, bondTargets))) break;
      }
      allAtoms = best.atoms;
      allBonds = best.bonds;
    }

    syncPosFromAtoms(pos, allAtoms);
    flattenAromaticRings(pos, mol, g);
    for (const a of allAtoms) {
      const p = pos.get(a.id);
      if (p) a.pos = p;
    }
  }

  return { atoms: allAtoms, bonds: allBonds };
};

/** Rotate the k-side component 180° about the j–k axis to fix E/Z on raw coords. */
const enforceCisTransCoords = (
  coords: Float64Array,
  con: { i: number; j: number; k: number; l: number; desiredCos: number },
  adjacency: Map<number, number[]>,
): void => {
  const get = (idx: number): Vec3 => ({ x: coords[idx * 3], y: coords[idx * 3 + 1], z: coords[idx * 3 + 2] });
  const cos = dihedralCos(get(con.i), get(con.j), get(con.k), get(con.l));
  if (Math.sign(cos) === Math.sign(con.desiredCos)) return;

  const comp = new Set<number>([con.k]);
  const stack = [con.k];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const nb of adjacency.get(cur) ?? []) {
      if (nb === con.j || comp.has(nb)) continue;
      comp.add(nb);
      stack.push(nb);
    }
  }
  const pj = get(con.j);
  const u = normalize(sub(get(con.k), pj));
  for (const idx of comp) {
    if (idx === con.k) continue;
    const p = get(idx);
    const rel = sub(p, pj);
    const proj = 2 * dot(rel, u);
    const np = add(pj, sub(scale(u, proj), rel));
    coords[idx * 3] = np.x;
    coords[idx * 3 + 1] = np.y;
    coords[idx * 3 + 2] = np.z;
  }
};

/**
 * Run UFF minimization in place on a conformer. Builds topology from the
 * connectivity/elements and minimizes the flat coordinate array. When stereo
 * constraints are supplied, they are enforced as extra restraints.
 */
const minimizeConformer = (
  atoms: Atom3D[],
  bonds: Bond[],
  maxIterations: number,
  stereo?: StereoConstraints,
): number => {
  if (atoms.length < 2) return 0;
  const pseudo: Molecule = {
    atoms: atoms.map(a => ({ id: a.id, element: a.element, x: 0, y: 0, charge: a.charge })),
    bonds,
  };
  const topo = buildUffTopology(pseudo);
  const coords = new Float64Array(atoms.length * 3);
  atoms.forEach((a, i) => {
    coords[i * 3] = a.pos.x;
    coords[i * 3 + 1] = a.pos.y;
    coords[i * 3 + 2] = a.pos.z;
  });
  if (stereo && (stereo.chirals.length > 0 || stereo.cisTrans.length > 0)) {
    const indexOf = new Map<string, number>();
    atoms.forEach((a, i) => indexOf.set(a.id, i));
    setStereoTerms(topo, stereo, indexOf);
    // Enforce double-bond E/Z on the real coordinates (with H, post Phase-A).
    // The sp²–sp² torsion barrier traps the minimizer, so the restraint alone
    // can't rotate a wrongly-seeded double bond across 90°; we set the correct
    // side up front and let the restraint hold it.
    const adjacency = new Map<number, number[]>();
    for (const b of bonds) {
      const f = indexOf.get(b.fromAtomId);
      const t = indexOf.get(b.toAtomId);
      if (f === undefined || t === undefined) continue;
      (adjacency.get(f) ?? adjacency.set(f, []).get(f)!).push(t);
      (adjacency.get(t) ?? adjacency.set(t, []).get(t)!).push(f);
    }
    for (const con of stereo.cisTrans) {
      const i = indexOf.get(con.i);
      const j = indexOf.get(con.j);
      const k = indexOf.get(con.k);
      const l = indexOf.get(con.l);
      if (i === undefined || j === undefined || k === undefined || l === undefined) continue;
      enforceCisTransCoords(coords, { i, j, k, l, desiredCos: con.desiredCos }, adjacency);
    }
  }
  // Deterministic symmetry-breaking jitter. Perfectly symmetric seeds (e.g. a
  // linear water or planar methane) sit on unstable equilibria where the net
  // force is zero, so the minimizer can't escape. A tiny hash-based nudge lets
  // it relax into the true minimum while staying reproducible.
  for (let i = 0; i < coords.length; i++) {
    const s = Math.sin((i + 1) * 12.9898) * 43758.5453;
    coords[i] += (s - Math.floor(s) - 0.5) * 0.06;
  }
  const result = minimizeUff(topo, coords, { maxIterations });
  atoms.forEach((a, i) => {
    a.pos = { x: coords[i * 3], y: coords[i * 3 + 1], z: coords[i * 3 + 2] };
  });
  if (stereo && (stereo.chirals.length > 0 || stereo.cisTrans.length > 0)) {
    enforceStereoConstraints({ atoms, bonds }, stereo);
  }
  return result.energy;
};
