/**
 * Coordination-polyhedron preconditioner for metal centres.
 *
 * A lifted 2D depiction puts every ligand of a metal complex in (roughly) one
 * plane, and the UFF angle terms for metals are deliberately soft, multi-well
 * functions (90°/120°/180° for trigonal bipyramids, 90°/180° for octahedra…).
 * Gradient descent from a planar seed frequently stalls between wells, giving
 * "almost" polyhedra (77°, 112°, 129°…). Snapping each donor onto the ideal
 * polyhedron *before* minimization — rotated to match the seed as closely as
 * possible so chelate rings and the user's drawing orientation survive — puts
 * the minimizer directly into the right basin.
 *
 * For every metal centre with 2–8 heavy donors:
 *   1. pick the ideal polyhedron from the coordination number / element
 *      (`coordinationGeometryFor`): linear, trigonal planar, tetrahedral or
 *      square planar, trigonal bipyramid, octahedron, pentagonal bipyramid,
 *      square antiprism;
 *   2. find the rotation + vertex assignment that best matches the current
 *      donor directions (rotation sampling + greedy assignment + Kabsch refine);
 *   3. move each donor to `metal + R·v · r0(M–D)`, and translate the rest of
 *      its ligand (atoms reachable without crossing a metal) by the mean donor
 *      displacement so chelates and bridging ligands keep their internal shape.
 */
import type { Molecule } from '@moldraw/domain';
import type { MoleculeGraph } from '@moldraw/engine';
import { kabschRotation, targetBondLengthA } from '@moldraw/core';
import { coordinationGeometryFor, isUffMetal } from './forcefield/uffParams';
import { add, distance, normalize, scale, sub, v, type Vec3 } from './vec';

/** Unit vertex directions of the ideal coordination polyhedra. */
const polyhedronVertices = (cn: number, squarePlanar: boolean): Vec3[] => {
  const s = Math.SQRT1_2;
  switch (cn) {
    case 2:
      return [v(1, 0, 0), v(-1, 0, 0)];
    case 3:
      return [0, 1, 2].map(i => v(Math.cos((2 * Math.PI * i) / 3), Math.sin((2 * Math.PI * i) / 3), 0));
    case 4:
      return squarePlanar
        ? [v(1, 0, 0), v(0, 1, 0), v(-1, 0, 0), v(0, -1, 0)]
        : [v(1, 1, 1), v(1, -1, -1), v(-1, 1, -1), v(-1, -1, 1)].map(normalize);
    case 5:
      return [
        v(0, 0, 1),
        v(0, 0, -1),
        ...[0, 1, 2].map(i => v(Math.cos((2 * Math.PI * i) / 3), Math.sin((2 * Math.PI * i) / 3), 0)),
      ];
    case 6:
      return [v(1, 0, 0), v(-1, 0, 0), v(0, 1, 0), v(0, -1, 0), v(0, 0, 1), v(0, 0, -1)];
    case 7:
      return [
        v(0, 0, 1),
        v(0, 0, -1),
        ...[0, 1, 2, 3, 4].map(i => v(Math.cos((2 * Math.PI * i) / 5), Math.sin((2 * Math.PI * i) / 5), 0)),
      ];
    case 8: {
      // Square antiprism: two squares offset by 45°, tilted ±z.
      const out: Vec3[] = [];
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI * i) / 2;
        out.push(normalize(v(Math.cos(a), Math.sin(a), s)));
        out.push(normalize(v(Math.cos(a + Math.PI / 4), Math.sin(a + Math.PI / 4), -s)));
      }
      return out;
    }
    default:
      return [];
  }
};

type Mat3 = number[][];
const applyMat = (R: Mat3, p: Vec3): Vec3 =>
  v(
    R[0][0] * p.x + R[0][1] * p.y + R[0][2] * p.z,
    R[1][0] * p.x + R[1][1] * p.y + R[1][2] * p.z,
    R[2][0] * p.x + R[2][1] * p.y + R[2][2] * p.z,
  );

/** Rotation matrix from a unit quaternion. */
const quatToMat = (w: number, x: number, y: number, z: number): Mat3 => [
  [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
];

/** Deterministic pseudo-random unit quaternions (Shoemake), plus identity. */
const sampleRotations = (count: number): Mat3[] => {
  const out: Mat3[] = [quatToMat(1, 0, 0, 0)];
  let seed = 12345;
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    const u1 = rnd();
    const u2 = rnd() * 2 * Math.PI;
    const u3 = rnd() * 2 * Math.PI;
    const a = Math.sqrt(1 - u1);
    const b = Math.sqrt(u1);
    out.push(quatToMat(a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)));
  }
  return out;
};

/** Greedy one-to-one assignment of donors to rotated vertices (max total dot). */
const assignGreedy = (dirs: Vec3[], verts: Vec3[]): { perm: number[]; score: number } => {
  const n = dirs.length;
  const pairs: { i: number; j: number; d: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < verts.length; j++) {
      const d = dirs[i].x * verts[j].x + dirs[i].y * verts[j].y + dirs[i].z * verts[j].z;
      pairs.push({ i, j, d });
    }
  }
  pairs.sort((a, b) => b.d - a.d);
  const perm = new Array<number>(n).fill(-1);
  const usedV = new Set<number>();
  let score = 0;
  let assigned = 0;
  for (const p of pairs) {
    if (perm[p.i] !== -1 || usedV.has(p.j)) continue;
    perm[p.i] = p.j;
    usedV.add(p.j);
    score += p.d;
    assigned += 1;
    if (assigned === n) break;
  }
  return { perm, score };
};

/**
 * Best rotation of the ideal polyhedron onto the observed donor directions.
 * Returns the rotated vertex for each donor (same order as `dirs`).
 */
const fitPolyhedron = (dirs: Vec3[], verts: Vec3[]): Vec3[] => {
  const n = dirs.length;
  if (n === 2) {
    // Linear: put the two donors on the axis through the first donor.
    const axis = normalize(sub(dirs[0], dirs[1]));
    return [axis, scale(axis, -1)];
  }
  let best: { perm: number[]; R: Mat3; score: number } | null = null;
  for (const R of sampleRotations(n <= 4 ? 48 : 96)) {
    const rot = verts.map(vv => applyMat(R, vv));
    const { perm, score } = assignGreedy(dirs, rot);
    if (!best || score > best.score) best = { perm, R, score };
  }
  if (!best) return dirs;
  // Kabsch refine: rotate the assigned ideal vertices onto the donor directions
  // (both sets are centred at the metal, i.e. the origin).
  let R = best.R;
  let perm = best.perm;
  for (let round = 0; round < 3; round++) {
    const from = perm.map(j => verts[j]);
    const refined = kabschRotation(from, dirs);
    if (!refined) break;
    R = refined;
    const rot = verts.map(vv => applyMat(R, vv));
    const next = assignGreedy(dirs, rot);
    if (next.score <= best.score + 1e-9) {
      perm = best.perm;
      break;
    }
    best = { perm: next.perm, R, score: next.score };
    perm = next.perm;
  }
  return perm.map(j => applyMat(R, verts[j]));
};

/**
 * Snap every metal centre's donors onto its ideal coordination polyhedron
 * (in place on `pos`). Returns the number of metal centres adjusted.
 */
export const snapCoordinationPolyhedra = (
  pos: Map<string, Vec3>,
  mol: Molecule,
  g: MoleculeGraph,
  bondTargets?: Map<string, number>,
): number => {
  const targetFor = (bondId: string | undefined, a: string, b: string): number | undefined => {
    if (bondId && bondTargets?.has(bondId)) return bondTargets.get(bondId);
    const bond = bondId ? g.bondById.get(bondId) : undefined;
    const ea = g.atomById.get(a)?.element;
    const eb = g.atomById.get(b)?.element;
    if (!ea || !eb) return undefined;
    const order = (bond?.order === 2 ? 2 : bond?.order === 3 ? 3 : 1) as 1 | 2 | 3;
    return targetBondLengthA(ea, eb, order);
  };
  const metals = mol.atoms.filter(a => isUffMetal(a.element) && pos.has(a.id));
  if (metals.length === 0) return 0;
  const metalIds = new Set(metals.map(a => a.id));
  const isHeavy = (id: string): boolean => g.atomById.get(id)?.element !== 'H';

  // Ligand components: connected pieces of the graph with metals removed.
  const componentOf = new Map<string, number>();
  let componentCount = 0;
  for (const a of mol.atoms) {
    if (metalIds.has(a.id) || componentOf.has(a.id)) continue;
    const id = componentCount++;
    const stack = [a.id];
    componentOf.set(a.id, id);
    while (stack.length) {
      const cur = stack.pop()!;
      for (const nb of g.nodes.get(cur)?.neighbors ?? []) {
        if (metalIds.has(nb) || componentOf.has(nb)) continue;
        componentOf.set(nb, id);
        stack.push(nb);
      }
    }
  }

  // Desired donor displacements, accumulated per ligand component.
  const shiftSum = new Map<number, { sum: Vec3; count: number }>();
  const donorTarget = new Map<string, Vec3>();
  let adjusted = 0;

  for (const m of metals) {
    const mp = pos.get(m.id)!;
    const donors = (g.nodes.get(m.id)?.neighbors ?? []).filter(id => isHeavy(id) && pos.has(id));
    const cn = donors.length;
    if (cn < 2 || cn > 8) continue;
    const geometry = coordinationGeometryFor(m.element, cn, m.charge ?? 0);
    const squarePlanar = cn === 4 && geometry.kind === 'periodic4';
    const verts = polyhedronVertices(cn, squarePlanar);
    if (verts.length !== cn) continue;

    const dirs = donors.map(id => {
      const d = sub(pos.get(id)!, mp);
      const len = Math.hypot(d.x, d.y, d.z);
      return len > 1e-6 ? scale(d, 1 / len) : v(1, 0, 0);
    });
    const fitted = fitPolyhedron(dirs, verts);
    donors.forEach((id, i) => {
      const bondId = g.bondByPair.get(m.id < id ? `${m.id}|${id}` : `${id}|${m.id}`);
      const r0 = targetFor(bondId, m.id, id) || distance(pos.get(id)!, mp) || 2.0;
      const target = add(mp, scale(fitted[i], r0));
      donorTarget.set(id, target);
      const comp = componentOf.get(id);
      if (comp === undefined) return;
      const delta = sub(target, pos.get(id)!);
      const acc = shiftSum.get(comp) ?? { sum: v(0, 0, 0), count: 0 };
      acc.sum = add(acc.sum, delta);
      acc.count += 1;
      shiftSum.set(comp, acc);
    });
    adjusted += 1;
  }
  if (adjusted === 0) return 0;

  // Translate whole ligands by their mean donor displacement, then pin donors
  // exactly (single-donor ligands land precisely; chelates keep their shape).
  for (const a of mol.atoms) {
    const comp = componentOf.get(a.id);
    if (comp === undefined) continue;
    const acc = shiftSum.get(comp);
    if (!acc || acc.count === 0) continue;
    const p = pos.get(a.id);
    if (!p) continue;
    pos.set(a.id, add(p, scale(acc.sum, 1 / acc.count)));
  }
  for (const [id, target] of donorTarget) {
    const acc = shiftSum.get(componentOf.get(id) ?? -1);
    // Chelating / bridging ligands were translated as a block; blend the donor
    // halfway toward its ideal vertex so the ring is not torn apart.
    if (acc && acc.count > 1) {
      const p = pos.get(id)!;
      pos.set(id, scale(add(p, target), 0.5));
    } else {
      pos.set(id, target);
    }
  }
  return adjusted;
};
