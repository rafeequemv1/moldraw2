/**
 * Mimic molecule3dWorker GENERATE_3D progressive path (no Indigo).
 * Run: npx tsx scripts/backtest-3d-worker-path.ts
 */
import { nativeEngine as engine } from '../src/engine/nativeEngine.ts';
import { embed3DProgressive } from '../src/engine-3d/progressiveEmbed.ts';

let failed = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  if (ok) console.log('OK:  ', name);
  else {
    failed += 1;
    console.error('FAIL:', name, detail ?? '');
  }
};

const mol = engine.parseSmiles('CCO');
check('parse ethanol', mol.atoms.length >= 3);

const mb2d = (() => {
  // Flat seed like the app sends (coords may be 0) — worker parses molblock.
  return engine.toMolblock(mol);
})();
const source = engine.parseMolblock(mb2d);
check('roundtrip molblock', source.atoms.length === mol.atoms.length);

let progressCount = 0;
const result = embed3DProgressive(source, {
  includeHydrogens: true,
  shellIterations: 28,
  finalIterations: 40,
  shellBuffer: 2,
  onProgress: () => {
    progressCount += 1;
  },
});
check('progressive returns molblock', !!result.molblock && result.molblock.includes('V2000'));
check('progressive has z coords', /-?\d+\.\d{4}/.test(result.molblock));
check('progressive emitted progress', progressCount > 0, `n=${progressCount}`);
check('no NaN', !/NaN/.test(result.molblock));

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\n3D worker path OK.');
