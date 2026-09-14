/**
 * Cholesterol (and other mid-size molecules) must use progressive 3D.
 * Run: npx tsx src/engine/__tests__/cholesterolProgressive.ts
 */
import { nativeEngine as engine } from '../nativeEngine';
import { embed3DProgressive } from '@moldraw/engine-3d/progressiveEmbed';
import { choose3DUpdatePath } from '@moldraw/engine-3d/choose3DUpdatePath';

const CHOLESTEROL =
  'C[C@H](CCCC(C)C)[C@H]1CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C';

let failed = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('OK:  ', msg);
  }
};

const mol = engine.generate2D(engine.parseSmiles(CHOLESTEROL));
const heavy = mol.atoms.filter(a => a.element !== 'H').length;
console.log(`cholesterol heavy=${heavy}`);

const path = choose3DUpdatePath({
  heavyCount: heavy,
  heavyDelta: heavy,
  majorChange: true,
  dirtyAtomIds: mol.atoms.map(a => a.id),
  hasOptimized3D: false,
});
assert(path.kind === 'progressive', `import path is progressive (got ${path.kind})`);

const t0 = Date.now();
const result = embed3DProgressive(mol, {
  includeHydrogens: true,
  shellIterations: 32,
  finalIterations: 80,
  shellBuffer: 2,
});
const ms = Date.now() - t0;
const lines = result.molblock.split(/\r?\n/);
const n = parseInt(lines[3]!.slice(0, 3), 10);
let minZ = Infinity;
let maxZ = -Infinity;
for (let i = 0; i < n; i++) {
  const z = parseFloat(lines[4 + i]!.slice(20, 30));
  minZ = Math.min(minZ, z);
  maxZ = Math.max(maxZ, z);
}
console.log(`progressive ${ms}ms zRange=${(maxZ - minZ).toFixed(2)} shells=${result.shellCount}`);
assert(result.source === 'native-3d-progressive', 'source progressive');
assert(maxZ - minZ > 2, `non-flat 3D (zRange=${(maxZ - minZ).toFixed(2)})`);
assert(ms < 5000, `interactive (${ms}ms)`);

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nCholesterol progressive OK.');
