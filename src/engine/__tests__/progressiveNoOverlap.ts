/**
 * Progressive 3D should not leave severe non-bonded heavy-atom overlaps.
 * Run: npx tsx src/engine/__tests__/progressiveNoOverlap.ts
 */
import { nativeEngine as engine } from '../nativeEngine';
import { embed3DProgressive } from '@moldraw/engine-3d/progressiveEmbed';
import { covalentRadius } from '@moldraw/core/chemistry/atomicData';

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

const parseHeavy = (mb: string) => {
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
  const bonded = new Set<string>();
  const key = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (let i = 0; i < nb; i++) {
    const L = lines[4 + n + i]!;
    const a = parseInt(L.slice(0, 3), 10) - 1;
    const b = parseInt(L.slice(3, 6), 10) - 1;
    bonded.add(key(a, b));
  }
  // 1–3 pairs via adjacency
  const nbrs = atoms.map(() => [] as number[]);
  for (const k of bonded) {
    const [a, b] = k.split('|').map(Number) as [number, number];
    nbrs[a]!.push(b);
    nbrs[b]!.push(a);
  }
  for (let i = 0; i < atoms.length; i++) {
    for (const j of nbrs[i]!) {
      for (const k of nbrs[j]!) {
        if (k !== i) bonded.add(key(i, k));
      }
    }
  }
  return { atoms, bonded, key };
};

const countClashes = (mb: string, factor = 1.4) => {
  const { atoms, bonded, key } = parseHeavy(mb);
  let clashes = 0;
  let worst = Infinity;
  for (let i = 0; i < atoms.length; i++) {
    if (atoms[i]!.e === 'H') continue;
    for (let j = i + 1; j < atoms.length; j++) {
      if (atoms[j]!.e === 'H') continue;
      if (bonded.has(key(i, j))) continue;
      const dx = atoms[j]!.x - atoms[i]!.x;
      const dy = atoms[j]!.y - atoms[i]!.y;
      const dz = atoms[j]!.z - atoms[i]!.z;
      const d = Math.hypot(dx, dy, dz);
      const min = (covalentRadius(atoms[i]!.e) + covalentRadius(atoms[j]!.e)) * factor;
      if (d < min) {
        clashes += 1;
        worst = Math.min(worst, d);
      }
    }
  }
  return { clashes, worst: Number.isFinite(worst) ? worst : null };
};

console.log('=== Progressive no severe heavy overlaps ===\n');

const mol = engine.generate2D(engine.parseSmiles(PACLITAXEL));
const t0 = Date.now();
const result = embed3DProgressive(mol, {
  includeHydrogens: true,
  shellIterations: 28,
  finalIterations: 72,
  shellBuffer: 2,
});
const ms = Date.now() - t0;
console.log(`progressive ${ms}ms shells=${result.shellCount}`);

const soft = countClashes(result.molblock, 1.4);
const hard = countClashes(result.molblock, 1.15);
console.log(`soft clashes (<1.4×cov): ${soft.clashes} worst=${soft.worst?.toFixed(2) ?? '-'}`);
console.log(`hard clashes (<1.15×cov): ${hard.clashes} worst=${hard.worst?.toFixed(2) ?? '-'}`);

assert(hard.clashes === 0, `no hard heavy overlaps (got ${hard.clashes})`);
assert(soft.clashes <= 4, `few soft clashes (got ${soft.clashes})`);
assert(ms < 5000, `still interactive (${ms}ms)`);

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nProgressive no-overlap OK.');
