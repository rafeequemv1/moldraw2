/**
 * UFF force-field + minimization checks. Run with:
 *   npx tsx src/engine/__tests__/sanityUff.ts
 */
import { engine } from '../index';
import { generate3DMolblock, generate3DConformerResults } from '@moldraw/engine-3d';
import { embed3D } from '@moldraw/engine-3d/embed';
import { buildUffTopology } from '@moldraw/engine-3d/forcefield/uff';
import { minimizeUff } from '@moldraw/engine-3d/forcefield/minimize';
import { uffEnergyAndGradient } from '@moldraw/engine-3d/forcefield/uff';

let passed = 0;
let failed = 0;
const check = (name: string, cond: boolean, detail?: unknown): void => {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : '');
  }
};

type P = { x: number; y: number; z: number };
const dist = (a: { pos: P }, b: { pos: P }): number =>
  Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z);
const angleDeg = (a: { pos: P }, b: { pos: P }, c: { pos: P }): number => {
  const u = { x: a.pos.x - b.pos.x, y: a.pos.y - b.pos.y, z: a.pos.z - b.pos.z };
  const v = { x: c.pos.x - b.pos.x, y: c.pos.y - b.pos.y, z: c.pos.z - b.pos.z };
  const d = (u.x * v.x + u.y * v.y + u.z * v.z) /
    (Math.hypot(u.x, u.y, u.z) * Math.hypot(v.x, v.y, v.z));
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
};

console.log('UFF force field\n');

// Energy must not increase after minimization from a Phase-A-only seed.
{
  const mol = engine.parseSmiles('CCO');
  const seed = embed3D(mol, { includeHydrogens: true, forceField: 'none' });
  const pseudo = {
    atoms: seed.atoms.map(a => ({ id: a.id, element: a.element, x: 0, y: 0, charge: a.charge })),
    bonds: seed.bonds,
  };
  const topo = buildUffTopology(pseudo);
  const coords = new Float64Array(seed.atoms.length * 3);
  seed.atoms.forEach((a, i) => {
    coords[i * 3] = a.pos.x;
    coords[i * 3 + 1] = a.pos.y;
    coords[i * 3 + 2] = a.pos.z;
  });
  const before = uffEnergyAndGradient(topo, coords, null);
  const res = minimizeUff(topo, coords, { maxIterations: 500 });
  check('ethanol: UFF energy decreases', res.energy < before, { before, after: res.energy });
  check('ethanol: minimizer produced finite energy', Number.isFinite(res.energy));
}

// Analytical gradient vs numerical (bond+angle+vdW+torsion) on ethanol.
{
  const mol = engine.parseSmiles('CCO');
  const seed = embed3D(mol, { includeHydrogens: true, forceField: 'none' });
  const pseudo = {
    atoms: seed.atoms.map(a => ({ id: a.id, element: a.element, x: 0, y: 0, charge: a.charge })),
    bonds: seed.bonds,
  };
  const topo = buildUffTopology(pseudo);
  const coords = new Float64Array(seed.atoms.length * 3);
  seed.atoms.forEach((a, i) => {
    coords[i * 3] = a.pos.x + 0.05 * i;
    coords[i * 3 + 1] = a.pos.y;
    coords[i * 3 + 2] = a.pos.z;
  });
  const grad = new Float64Array(coords.length);
  uffEnergyAndGradient(topo, coords, grad);
  const h = 1e-5;
  let maxErr = 0;
  for (let k = 0; k < coords.length; k++) {
    const orig = coords[k];
    coords[k] = orig + h;
    const ep = uffEnergyAndGradient(topo, coords, null);
    coords[k] = orig - h;
    const em = uffEnergyAndGradient(topo, coords, null);
    coords[k] = orig;
    const num = (ep - em) / (2 * h);
    maxErr = Math.max(maxErr, Math.abs(num - grad[k]));
  }
  check('ethanol: analytical gradient matches numerical', maxErr < 1e-2, { maxErr });
}

// Methane: H–C–H ≈ 109.5°.
{
  const conf = embed3D(engine.parseSmiles('C'), { includeHydrogens: true });
  const c = conf.atoms.find(a => a.element === 'C')!;
  const hs = conf.atoms.filter(a => a.element === 'H');
  const angles: number[] = [];
  for (let i = 0; i < hs.length; i++)
    for (let j = i + 1; j < hs.length; j++) angles.push(angleDeg(hs[i], c, hs[j]));
  const avg = angles.reduce((s, a) => s + a, 0) / angles.length;
  check('methane: H–C–H ≈ 109.5°', Math.abs(avg - 109.5) < 6, avg);
}

// Water: H–O–H ≈ 104.5° (UFF O_3 = 104.51°).
{
  const conf = embed3D(engine.parseSmiles('O'), { includeHydrogens: true });
  const o = conf.atoms.find(a => a.element === 'O')!;
  const hs = conf.atoms.filter(a => a.element === 'H');
  check('water: 2 H present', hs.length === 2, hs.length);
  if (hs.length === 2) {
    const ang = angleDeg(hs[0], o, hs[1]);
    check('water: H–O–H ≈ 104.5°', Math.abs(ang - 104.5) < 8, ang);
  }
}

// Benzene: planar + C–C ≈ 1.39 Å, C–C–C ≈ 120°.
{
  const conf = embed3D(engine.parseSmiles('c1ccccc1'), { includeHydrogens: true });
  const carbons = conf.atoms.filter(a => a.element === 'C');
  const zs = carbons.map(a => a.pos.z);
  const zSpread = Math.max(...zs) - Math.min(...zs);
  check('benzene: ring planar after UFF', zSpread < 0.3, zSpread);
  const ccBonds = conf.bonds.filter(b => {
    const a1 = conf.atoms.find(a => a.id === b.fromAtomId)!;
    const a2 = conf.atoms.find(a => a.id === b.toAtomId)!;
    return a1.element === 'C' && a2.element === 'C';
  });
  const lens = ccBonds.map(b => {
    const a1 = conf.atoms.find(a => a.id === b.fromAtomId)!;
    const a2 = conf.atoms.find(a => a.id === b.toAtomId)!;
    return dist(a1, a2);
  });
  const avg = lens.reduce((s, l) => s + l, 0) / lens.length;
  check('benzene: aromatic C–C ≈ 1.4 Å', Math.abs(avg - 1.4) < 0.15, avg);
}

// Cyclohexane: puckers (chair) — non-planar after UFF.
{
  const conf = embed3D(engine.parseSmiles('C1CCCCC1'), { includeHydrogens: false });
  const zs = conf.atoms.map(a => a.pos.z);
  const zSpread = Math.max(...zs) - Math.min(...zs);
  check('cyclohexane: puckers (chair, non-planar)', zSpread > 0.3, zSpread);
}

// No NaN anywhere + reasonable timing on a bigger molecule.
{
  const t0 = Date.now();
  const mb = generate3DMolblock(engine.parseSmiles('C1CCC2CCCCC2C1'), { includeHydrogens: true });
  const dt = Date.now() - t0;
  check('decalin: 3D w/o NaN', !mb.includes('NaN'));
  check('decalin: completes < 4s', dt < 4000, dt);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
