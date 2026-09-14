/**
 * VSEPR H placement after progressive: tetrahedral H–C–H / H–C–X angles.
 * Run: npx tsx src/engine/__tests__/progressiveHTetrahedral.ts
 */
import { nativeEngine as engine } from '../nativeEngine';
import { embed3DProgressive } from '@moldraw/engine-3d/progressiveEmbed';

const ETHANE = 'CC';
const METHANE = 'C';
const PACLITAXEL =
  'CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H](O)[C@@H](NC(=O)c6ccccc6)c7ccccc7)O)(C)C';

let failed = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('OK:  ', msg);
  }
};

const parseAtoms = (mb: string) => {
  const lines = mb.split(/\r?\n/);
  const n = parseInt(lines[3]!.slice(0, 3), 10);
  const nb = parseInt(lines[3]!.slice(3, 6), 10);
  const atoms: { e: string; x: number; y: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const L = lines[4 + i]!;
    atoms.push({
      e: L.slice(31, 34).trim(),
      x: +L.slice(0, 10),
      y: +L.slice(10, 20),
      z: +L.slice(20, 30),
    });
  }
  const bonds: { a: number; b: number }[] = [];
  for (let i = 0; i < nb; i++) {
    const L = lines[4 + n + i]!;
    bonds.push({
      a: parseInt(L.slice(0, 3), 10) - 1,
      b: parseInt(L.slice(3, 6), 10) - 1,
    });
  }
  return { atoms, bonds };
};

const angleDeg = (
  c: { x: number; y: number; z: number },
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number => {
  const ax = a.x - c.x;
  const ay = a.y - c.y;
  const az = a.z - c.z;
  const bx = b.x - c.x;
  const by = b.y - c.y;
  const bz = b.z - c.z;
  const al = Math.hypot(ax, ay, az) || 1;
  const bl = Math.hypot(bx, by, bz) || 1;
  const cos = (ax * bx + ay * by + az * bz) / (al * bl);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
};

const meanHCH = (mb: string): { mean: number; count: number } => {
  const { atoms, bonds } = parseAtoms(mb);
  const nbrs = atoms.map(() => [] as number[]);
  for (const b of bonds) {
    nbrs[b.a]!.push(b.b);
    nbrs[b.b]!.push(b.a);
  }
  const angles: number[] = [];
  for (let i = 0; i < atoms.length; i++) {
    if (atoms[i]!.e !== 'C') continue;
    const hs = nbrs[i]!.filter(j => atoms[j]!.e === 'H');
    for (let a = 0; a < hs.length; a++) {
      for (let b = a + 1; b < hs.length; b++) {
        angles.push(angleDeg(atoms[i]!, atoms[hs[a]!]!, atoms[hs[b]!]!));
      }
    }
  }
  if (angles.length === 0) return { mean: NaN, count: 0 };
  return { mean: angles.reduce((s, v) => s + v, 0) / angles.length, count: angles.length };
};

console.log('=== Progressive H tetrahedral geometry ===\n');

{
  const mol = engine.generate2D(engine.parseSmiles(METHANE));
  const r = embed3DProgressive(mol, { includeHydrogens: true, shellIterations: 20, finalIterations: 16 });
  const { mean, count } = meanHCH(r.molblock);
  console.log(`methane H–C–H mean=${mean.toFixed(1)}° (n=${count})`);
  assert(count >= 6, 'methane has H–C–H angles');
  assert(Math.abs(mean - 109.5) < 8, `methane ~109.5° (got ${mean.toFixed(1)})`);
}

{
  const mol = engine.generate2D(engine.parseSmiles(ETHANE));
  // Force progressive path (heavy=2 is small — use embed via progressive small path).
  // Ethane uses one-shot embed (≤18 heavy). Check that path too.
  const r = embed3DProgressive(mol, { includeHydrogens: true });
  const { mean, count } = meanHCH(r.molblock);
  console.log(`ethane H–C–H mean=${mean.toFixed(1)}° (n=${count})`);
  assert(count >= 6, 'ethane has H–C–H angles');
  assert(Math.abs(mean - 109.5) < 12, `ethane ~109.5° (got ${mean.toFixed(1)})`);
}

{
  const mol = engine.generate2D(engine.parseSmiles(PACLITAXEL));
  const r = embed3DProgressive(mol, {
    includeHydrogens: true,
    shellIterations: 22,
    finalIterations: 18,
  });
  const { mean, count } = meanHCH(r.molblock);
  console.log(`paclitaxel H–C–H mean=${mean.toFixed(1)}° (n=${count})`);
  assert(count >= 10, `paclitaxel has H–C–H angles (n=${count})`);
  assert(Math.abs(mean - 109.5) < 15, `paclitaxel H–C–H ~109.5° (got ${mean.toFixed(1)})`);
}

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nProgressive H tetrahedral OK.');
