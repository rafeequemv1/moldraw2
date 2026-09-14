/**
 * Native 3D conformer sanity checks. Run with:
 *   npx tsx src/engine/__tests__/sanity3d.ts
 */
import { engine } from '../index';
import { generate3DMolblock, generate3DConformerResults } from '@moldraw/engine-3d';
import { embed3D } from '@moldraw/engine-3d/embed';

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

const dist = (a: { pos: { x: number; y: number; z: number } }, b: { pos: { x: number; y: number; z: number } }): number =>
  Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z);

console.log('Native 3D embedding\n');

// Ethane: C–C bond should be ~1.5 Å, and it should not be perfectly flat.
{
  const ethane = engine.parseSmiles('CC');
  const conf = embed3D(ethane, { includeHydrogens: true });
  const carbons = conf.atoms.filter(a => a.element === 'C');
  const hydrogens = conf.atoms.filter(a => a.element === 'H');
  check('ethane: 2 C + 6 H', carbons.length === 2 && hydrogens.length === 6, {
    c: carbons.length,
    h: hydrogens.length,
  });
  const cc = dist(carbons[0], carbons[1]);
  check('ethane: C–C ~1.5 Å', Math.abs(cc - 1.5) < 0.3, cc);
  const ch = dist(carbons[0], hydrogens.find(h => h.id.startsWith(carbons[0].id))!);
  check('ethane: C–H ~1.07 Å', Math.abs(ch - 1.07) < 0.35, ch);
}

// Methane: 4 H around 1 C, all ~equal length, tetrahedral (not collapsed).
{
  const methane = engine.parseSmiles('C');
  const conf = embed3D(methane, { includeHydrogens: true });
  check('methane: CH4 (1 C, 4 H)', conf.atoms.length === 5);
  const c = conf.atoms.find(a => a.element === 'C')!;
  const hs = conf.atoms.filter(a => a.element === 'H');
  const lens = hs.map(h => dist(c, h));
  const spread = Math.max(...lens) - Math.min(...lens);
  check('methane: 4 C–H roughly equal', spread < 0.4, { lens });
  // Tetrahedral: no two H should be on top of each other.
  let minHH = Infinity;
  for (let i = 0; i < hs.length; i++)
    for (let j = i + 1; j < hs.length; j++) minHH = Math.min(minHH, dist(hs[i], hs[j]));
  check('methane: hydrogens are separated (3D, not collapsed)', minHH > 1.2, minHH);
}

// Benzene: ring should be (near) planar — all z within a small band.
{
  const benzene = engine.parseSmiles('c1ccccc1');
  const conf = embed3D(benzene, { includeHydrogens: false });
  const zs = conf.atoms.map(a => a.pos.z);
  const zSpread = Math.max(...zs) - Math.min(...zs);
  check('benzene: ring stays ~planar', zSpread < 0.6, zSpread);
  // ring bonds ~1.4 Å
  const bondLens = conf.bonds.map(b => {
    const a1 = conf.atoms.find(a => a.id === b.fromAtomId)!;
    const a2 = conf.atoms.find(a => a.id === b.toAtomId)!;
    return dist(a1, a2);
  });
  const avg = bondLens.reduce((s, l) => s + l, 0) / bondLens.length;
  check('benzene: aromatic C–C ~1.4 Å', Math.abs(avg - 1.4) < 0.35, avg);
}

// Canvas-drawn benzene (Kekulé doubles, no aromatic flags): must not pucker like cyclohexane.
{
  const r = 40;
  const atoms = Array.from({ length: 6 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 3;
    return {
      id: `c${i}`,
      element: 'C',
      x: 200 + r * Math.cos(angle),
      y: 200 + r * Math.sin(angle),
      charge: 0,
    };
  });
  const bonds = Array.from({ length: 6 }, (_, i) => ({
    id: `b${i}`,
    fromAtomId: `c${i}`,
    toAtomId: `c${(i + 1) % 6}`,
    order: i % 2 === 0 ? 2 : 1,
  }));
  const drawn = { atoms, bonds };
  const conf = embed3D(drawn, { includeHydrogens: true, forceField: 'none' });
  const carbons = conf.atoms.filter(a => a.element === 'C');
  const hydrogens = conf.atoms.filter(a => a.element === 'H');
  check('drawn benzene: 6 C + 6 H', carbons.length === 6 && hydrogens.length === 6, {
    c: carbons.length,
    h: hydrogens.length,
  });
  const hPerC = carbons.map(c =>
    conf.bonds.filter(
      b =>
        (b.fromAtomId === c.id || b.toAtomId === c.id) &&
        conf.atoms.find(a => a.id === (b.fromAtomId === c.id ? b.toAtomId : b.fromAtomId))?.element === 'H',
    ).length,
  );
  check('drawn benzene: 1 H per carbon', hPerC.every(n => n === 1), hPerC);
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < carbons.length; i++) {
    const p0 = carbons[i].pos;
    const p1 = carbons[(i + 1) % carbons.length].pos;
    nx += (p0.y - p1.y) * (p0.z + p1.z);
    ny += (p0.z - p1.z) * (p0.x + p1.x);
    nz += (p0.x - p1.x) * (p0.y + p1.y);
  }
  const nlen = Math.hypot(nx, ny, nz) || 1;
  nx /= nlen;
  ny /= nlen;
  nz /= nlen;
  const cx = carbons.reduce((s, a) => s + a.pos.x, 0) / carbons.length;
  const cy = carbons.reduce((s, a) => s + a.pos.y, 0) / carbons.length;
  const cz = carbons.reduce((s, a) => s + a.pos.z, 0) / carbons.length;
  let maxDev = 0;
  for (const c of carbons) {
    const dx = c.pos.x - cx;
    const dy = c.pos.y - cy;
    const dz = c.pos.z - cz;
    maxDev = Math.max(maxDev, Math.abs(dx * nx + dy * ny + dz * nz));
  }
  check('drawn benzene: ring is planar', maxDev < 0.05, maxDev);
}

// Cyclopentane: sp³ C–H–C and H–C–H angles should be ~109.5° (even without UFF).
{
  const cyclopentane = engine.parseSmiles('C1CCCC1');
  const conf = embed3D(cyclopentane, { includeHydrogens: true, forceField: 'none' });
  const byId = new Map(conf.atoms.map(a => [a.id, a]));
  const bondAngle = (a: { pos: { x: number; y: number; z: number } }, b: typeof a, c: typeof a): number => {
    const ux = a.pos.x - b.pos.x;
    const uy = a.pos.y - b.pos.y;
    const uz = a.pos.z - b.pos.z;
    const vx = c.pos.x - b.pos.x;
    const vy = c.pos.y - b.pos.y;
    const vz = c.pos.z - b.pos.z;
    const ul = Math.hypot(ux, uy, uz) || 1;
    const vl = Math.hypot(vx, vy, vz) || 1;
    const cos = (ux * vx + uy * vy + uz * vz) / (ul * vl);
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  };
  let badChc = 0;
  let badHch = 0;
  for (const c of conf.atoms.filter(a => a.element === 'C')) {
    const hs = conf.bonds
      .filter(b => b.fromAtomId === c.id || b.toAtomId === c.id)
      .map(b => byId.get(b.fromAtomId === c.id ? b.toAtomId : b.fromAtomId))
      .filter(a => a?.element === 'H') as typeof conf.atoms;
    const heavies = conf.bonds
      .filter(b => b.fromAtomId === c.id || b.toAtomId === c.id)
      .map(b => byId.get(b.fromAtomId === c.id ? b.toAtomId : b.fromAtomId))
      .filter(a => a && a.element !== 'H') as typeof conf.atoms;
    for (const h of hs) {
      for (const hv of heavies) {
        if (Math.abs(bondAngle(hv, c, h) - 109.471) > 5) badChc++;
      }
    }
    for (let i = 0; i < hs.length; i++) {
      for (let j = i + 1; j < hs.length; j++) {
        if (Math.abs(bondAngle(hs[i], c, hs[j]) - 109.471) > 5) badHch++;
      }
    }
  }
  check('cyclopentane: sp³ C–H–C ~109.5° (no UFF)', badChc === 0, { badChc });
  check('cyclopentane: sp³ H–C–H ~109.5° (no UFF)', badHch === 0, { badHch });
}

{
  const cyclohexane = engine.parseSmiles('C1CCCCC1');
  const conf = embed3D(cyclohexane, { includeHydrogens: false });
  const zs = conf.atoms.map(a => a.pos.z);
  const zSpread = Math.max(...zs) - Math.min(...zs);
  check('cyclohexane: ring puckers (non-planar)', zSpread > 0.3, zSpread);
}

// molblock output shape.
{
  const mb = generate3DMolblock(engine.parseSmiles('CCO'), { includeHydrogens: true });
  check('generate3D: emits V2000 + M END', mb.includes('V2000') && mb.includes('M  END'));
  check('generate3D: non-degenerate z present', /-?\d+\.\d{4}/.test(mb));
  const noNaN = !mb.includes('NaN');
  check('generate3D: no NaN coordinates', noNaN);
}

// Larger structure smoke test (naphthalene-ish fused) — must finish + no NaN.
{
  const mb = generate3DMolblock(engine.parseSmiles('c1ccc2ccccc2c1'), { includeHydrogens: true });
  check('naphthalene: 3D generated without NaN', !mb.includes('NaN'));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
