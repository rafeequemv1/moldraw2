/**
 * Coordination-compound 3D regression:
 *  - square-planar [PtCl4]²⁻ and octahedral [Fe(CN)6] from flat 2D seeds
 *  - dative NH₃ ligands keep 3 H through the molblock (type 9) round-trip
 *  - re-minimizing from a 3D seed keeps the conformer's frame
 *  - pose helpers: bond-geometry depth for atoms drawn in perspective mode and
 *    rigid re-alignment onto a reference pose
 *  - trigonal-bipyramidal Fe(CO)5 (coordination-polyhedron preconditioner)
 *  - cage skeletons (cubane, bicyclo[2.2.2]octane, …) via the distance-
 *    geometry rescue of collapsed depiction seeds.
 *
 * Run: npm run test:3d
 */
import type { Molecule } from '@moldraw/domain';
import { engine } from '@moldraw/engine';
import {
  alignPositionsToReference,
  joinAtomsIntoPerspectivePose,
} from '../../../core/src/molecule/perspective3D';
import { embed3D, type Conformer } from '../embed';

const DEG = 180 / Math.PI;
let failures = 0;
const check = (cond: boolean, msg: string): void => {
  if (cond) {
    console.log(`  ok   ${msg}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${msg}`);
  }
};

const angleDeg = (
  a: { x: number; y: number; z: number },
  c: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number => {
  const ux = a.x - c.x, uy = a.y - c.y, uz = a.z - c.z;
  const vx = b.x - c.x, vy = b.y - c.y, vz = b.z - c.z;
  const cos =
    (ux * vx + uy * vy + uz * vz) /
    ((Math.hypot(ux, uy, uz) || 1) * (Math.hypot(vx, vy, vz) || 1));
  return Math.acos(Math.max(-1, Math.min(1, cos))) * DEG;
};

/** Metal centre + n ligand donors on a flat 2D star (40 px bonds). */
const star = (
  metal: string,
  ligand: string,
  n: number,
  opts: { dative?: boolean; charge?: number; tail?: { element: string; order: number } } = {},
): Molecule => {
  const atoms: Molecule['atoms'] = [{ id: 'M', element: metal, x: 0, y: 0, charge: opts.charge ?? 0 }];
  const bonds: Molecule['bonds'] = [];
  for (let i = 0; i < n; i++) {
    const ang = (2 * Math.PI * i) / n;
    const id = `L${i}`;
    atoms.push({ id, element: ligand, x: 40 * Math.cos(ang), y: 40 * Math.sin(ang), charge: 0 });
    bonds.push({
      id: `b${i}`,
      fromAtomId: id,
      toAtomId: 'M',
      order: 1,
      ...(opts.dative ? { dative: true } : {}),
    });
    if (opts.tail) {
      const tid = `T${i}`;
      atoms.push({
        id: tid,
        element: opts.tail.element,
        x: 80 * Math.cos(ang),
        y: 80 * Math.sin(ang),
        charge: 0,
      });
      bonds.push({ id: `t${i}`, fromAtomId: id, toAtomId: tid, order: opts.tail.order });
    }
  }
  return { atoms, bonds };
};

const posOf = (conf: Conformer, id: string) => conf.atoms.find(a => a.id === id)!.pos;

const ligandAngles = (conf: Conformer, ids: string[]): number[] => {
  const out: number[] = [];
  const m = posOf(conf, 'M');
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      out.push(angleDeg(posOf(conf, ids[i]!), m, posOf(conf, ids[j]!)));
    }
  }
  return out;
};

const nearAny = (v: number, targets: number[], tol: number): boolean =>
  targets.some(t => Math.abs(v - t) <= tol);

// ── 1. square-planar [PtCl4]²⁻ ───────────────────────────────────────────────
console.log('square-planar PtCl4');
{
  const conf = embed3D(star('Pt', 'Cl', 4, { charge: -2 }), {
    includeHydrogens: false,
    maxIterations: 400,
  });
  const ids = ['L0', 'L1', 'L2', 'L3'];
  const angles = ligandAngles(conf, ids);
  const trans = angles.filter(a => a > 160).length;
  check(
    angles.every(a => nearAny(a, [90, 180], 12)),
    `Cl–Pt–Cl angles ≈ 90°/180° (${angles.map(a => a.toFixed(0)).join(', ')})`,
  );
  check(trans === 2, `two trans pairs (${trans})`);
}

// ── 2. octahedral [Fe(CN)6] ─────────────────────────────────────────────────
console.log('octahedral Fe(CN)6');
{
  const mol = star('Fe', 'C', 6, { tail: { element: 'N', order: 3 } });
  const conf = embed3D(mol, { includeHydrogens: false, maxIterations: 600 });
  const ids = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];
  const angles = ligandAngles(conf, ids);
  const trans = angles.filter(a => a > 160).length;
  check(
    angles.every(a => nearAny(a, [90, 180], 15)),
    `C–Fe–C angles ≈ 90°/180° (${angles.map(a => a.toFixed(0)).join(', ')})`,
  );
  check(trans === 3, `three trans pairs (${trans})`);
  const feC = ids.map(id => {
    const p = posOf(conf, id);
    const m = posOf(conf, 'M');
    return Math.hypot(p.x - m.x, p.y - m.y, p.z - m.z);
  });
  check(
    feC.every(d => d > 1.6 && d < 2.4),
    `Fe–C bond lengths plausible (${feC.map(d => d.toFixed(2)).join(', ')} Å)`,
  );
}

// ── 3. tetrahedral [Zn(NH3)4]²⁺ with dative bonds ───────────────────────────
console.log('tetrahedral Zn(NH3)4 — dative ligands keep their hydrogens');
{
  const mol = star('Zn', 'N', 4, { dative: true, charge: 2 });
  const mb = engine.toMolblock(mol, { dativeAsType9: true });
  const back = engine.parseMolblock(mb);
  check(back.bonds.every(b => b.dative === true && b.order === 1), 'type-9 molblock round-trips dative bonds');
  const plain = engine.parseMolblock(engine.toMolblock(mol));
  check(plain.bonds.every(b => !b.dative), 'default writer keeps classic V2000 (no type 9)');

  const conf = embed3D(back, { includeHydrogens: true, maxIterations: 300 });
  const hCount = conf.atoms.filter(a => a.element === 'H').length;
  check(hCount === 12, `four NH₃ donors carry 12 H (${hCount})`);
  const nIds = back.atoms.filter(a => a.element === 'N').map(a => a.id);
  const zn = back.atoms.find(a => a.element === 'Zn')!;
  const m = conf.atoms.find(a => a.id === zn.id)!.pos;
  const angles: number[] = [];
  for (let i = 0; i < nIds.length; i++) {
    for (let j = i + 1; j < nIds.length; j++) {
      angles.push(
        angleDeg(
          conf.atoms.find(a => a.id === nIds[i])!.pos,
          m,
          conf.atoms.find(a => a.id === nIds[j])!.pos,
        ),
      );
    }
  }
  check(
    angles.every(a => Math.abs(a - 109.47) < 14),
    `N–Zn–N ≈ 109.5° (${angles.map(a => a.toFixed(0)).join(', ')})`,
  );
}

// ── 4. seed3D keeps the frame of an existing conformer ──────────────────────
console.log('seed3D re-minimization keeps the conformer frame');
{
  const mol = star('Fe', 'C', 6, { tail: { element: 'N', order: 3 } });
  const first = embed3D(mol, { includeHydrogens: false, maxIterations: 600 });
  // Rotate the conformer by 70° about x — a re-embed from the 2D seed would not
  // reproduce this frame, a seeded one must stay close to it.
  const c = Math.cos(1.2), s = Math.sin(1.2);
  const seed = new Map(
    first.atoms.map(a => [
      a.id,
      { x: a.pos.x, y: c * a.pos.y - s * a.pos.z, z: s * a.pos.y + c * a.pos.z },
    ]),
  );
  const second = embed3D(mol, { includeHydrogens: false, maxIterations: 200, seed3D: seed });
  let rmsd = 0;
  for (const a of second.atoms) {
    const p = seed.get(a.id)!;
    rmsd += (a.pos.x - p.x) ** 2 + (a.pos.y - p.y) ** 2 + (a.pos.z - p.z) ** 2;
  }
  rmsd = Math.sqrt(rmsd / second.atoms.length);
  check(rmsd < 0.35, `RMSD to seed frame ${rmsd.toFixed(3)} Å < 0.35`);
}

// ── 5. drawing in perspective mode: depth from bond geometry ────────────────
console.log('joinAtomsIntoPerspectivePose — foreshortened bond leaves the view plane');
{
  const mol: Molecule = {
    atoms: [
      { id: 'A', element: 'C', x: 0, y: 0, charge: 0 },
      { id: 'B', element: 'C', x: 40, y: 0, charge: 0 },
      { id: 'C', element: 'N', x: 0, y: 20, charge: 0 }, // drawn 20 px away → points at viewer
      { id: 'D', element: 'O', x: -40, y: 0, charge: 0 }, // full length → in plane
    ],
    bonds: [
      { id: 'ab', fromAtomId: 'A', toAtomId: 'B', order: 1 },
      { id: 'ac', fromAtomId: 'A', toAtomId: 'C', order: 1 },
      { id: 'ad', fromAtomId: 'A', toAtomId: 'D', order: 1 },
    ],
    perspective3D: {
      positions: { A: { x: 0, y: 0, z: 0 }, B: { x: 40, y: 0, z: 0 } },
    },
  };
  const joined = joinAtomsIntoPerspectivePose(mol, ['C', 'D']);
  const pC = joined.perspective3D!.positions.C!;
  const pD = joined.perspective3D!.positions.D!;
  const lenAC = Math.hypot(pC.x, pC.y, pC.z);
  check(Math.abs(lenAC - 40) < 1e-6, `A–C keeps the pose bond length (${lenAC.toFixed(2)} px)`);
  check(Math.abs(Math.abs(pC.z) - Math.sqrt(40 * 40 - 20 * 20)) < 1e-6, `C lifted out of plane (z=${pC.z.toFixed(1)})`);
  check(Math.abs(pD.z) < 1e-9, `full-length bond stays in plane (z=${pD.z})`);
}

// ── 6. alignPositionsToReference undoes a rigid rotation ─────────────────────
console.log('alignPositionsToReference');
{
  const ref = {
    a: { x: 0, y: 0, z: 0 },
    b: { x: 40, y: 0, z: 0 },
    c: { x: 0, y: 40, z: 0 },
    d: { x: 0, y: 0, z: 40 },
    e: { x: 30, y: 30, z: -20 },
  };
  const c1 = Math.cos(0.8), s1 = Math.sin(0.8);
  const c2 = Math.cos(-0.5), s2 = Math.sin(-0.5);
  const rotated: Record<string, { x: number; y: number; z: number }> = {};
  for (const [id, p] of Object.entries(ref)) {
    const y1 = c1 * p.y - s1 * p.z;
    const z1 = s1 * p.y + c1 * p.z;
    rotated[id] = { x: c2 * p.x + s2 * z1 + 12, y: y1 - 7, z: -s2 * p.x + c2 * z1 + 3 };
  }
  const aligned = alignPositionsToReference(rotated, ref);
  // Alignment is rotation about the centroid (translation is matched later by
  // the footprint step) — compare after removing centroids.
  const cen = (m: Record<string, { x: number; y: number; z: number }>) => {
    const v = Object.values(m);
    return {
      x: v.reduce((s, p) => s + p.x, 0) / v.length,
      y: v.reduce((s, p) => s + p.y, 0) / v.length,
      z: v.reduce((s, p) => s + p.z, 0) / v.length,
    };
  };
  const ca = cen(aligned);
  const cr = cen(ref);
  let rmsd = 0;
  for (const id of Object.keys(ref)) {
    const p = aligned[id]!;
    const q = ref[id as keyof typeof ref];
    rmsd += (p.x - ca.x - (q.x - cr.x)) ** 2 + (p.y - ca.y - (q.y - cr.y)) ** 2 + (p.z - ca.z - (q.z - cr.z)) ** 2;
  }
  rmsd = Math.sqrt(rmsd / 5);
  check(rmsd < 1e-6, `rigid rotation recovered (rmsd ${rmsd.toExponential(2)})`);
}

// ── 7. trigonal-bipyramidal Fe(CO)5 via the polyhedron preconditioner ────────
console.log('trigonal bipyramid Fe(CO)5');
{
  const mol = star('Fe', 'C', 5, { tail: { element: 'O', order: 3 } });
  const conf = embed3D(mol, { includeHydrogens: false, maxIterations: 600 });
  const angles = ligandAngles(conf, ['L0', 'L1', 'L2', 'L3', 'L4']);
  check(
    angles.every(a => nearAny(a, [90, 120, 180], 12)),
    `C–Fe–C angles ≈ 90°/120°/180° (${angles.map(a => a.toFixed(0)).join(', ')})`,
  );
  check(angles.filter(a => a > 165).length === 1, 'exactly one axial trans pair');
  check(angles.filter(a => Math.abs(a - 120) <= 12).length === 3, 'three equatorial 120° pairs');
}

// ── 8. cages: distance-geometry rescue of collapsed seeds ───────────────────
console.log('cage skeletons from SMILES (DG fallback)');
{
  const heavyBondLengths = (conf: Conformer): number[] => {
    const heavy = new Map(conf.atoms.filter(a => a.element !== 'H').map(a => [a.id, a.pos]));
    return conf.bonds
      .filter(b => heavy.has(b.fromAtomId) && heavy.has(b.toAtomId))
      .map(b => {
        const p = heavy.get(b.fromAtomId)!;
        const q = heavy.get(b.toAtomId)!;
        return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
      });
  };
  const minNonbonded = (conf: Conformer): number => {
    const heavy = conf.atoms.filter(a => a.element !== 'H');
    const bonded = new Set(conf.bonds.map(b => [b.fromAtomId, b.toAtomId].sort().join('|')));
    let m = Infinity;
    for (let i = 0; i < heavy.length; i++) {
      for (let j = i + 1; j < heavy.length; j++) {
        if (bonded.has([heavy[i]!.id, heavy[j]!.id].sort().join('|'))) continue;
        const p = heavy[i]!.pos;
        const q = heavy[j]!.pos;
        m = Math.min(m, Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z));
      }
    }
    return m;
  };
  const cages: [string, string][] = [
    ['cubane', 'C12C3C4C1C5C2C3C45'],
    ['bicyclo[2.2.2]octane', 'C1CC2CCC1CC2'],
    ['norbornane', 'C1CC2CCC1C2'],
    ['adamantane', 'C1C2CC3CC1CC(C2)C3'],
    ['prismane', 'C12C3C1C4C2C34'],
  ];
  for (const [name, smiles] of cages) {
    const mol = engine.generate2D(engine.parseSmiles(smiles));
    const conf = embed3D(mol, { includeHydrogens: true });
    const lens = heavyBondLengths(conf);
    const lo = Math.min(...lens);
    const hi = Math.max(...lens);
    const nb = minNonbonded(conf);
    check(
      lo > 1.4 && hi < 1.7 && nb > 1.9,
      `${name}: C–C ${lo.toFixed(2)}–${hi.toFixed(2)} Å, closest non-bonded ${nb.toFixed(2)} Å`,
    );
  }
}

if (failures > 0) {
  throw new Error(`${failures} coordination-geometry check(s) failed`);
}
console.log('\nAll coordination-geometry checks passed.');
