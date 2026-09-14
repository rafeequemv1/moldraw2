/**
 * Indigo 2D layout peer — prefer Indigo when loaded; native remains default on engine.
 * Run: npx tsx src/engine/__tests__/indigoCleanup.ts
 */
import { nativeEngine as engine } from '../nativeEngine';
import {
  cleanupPreferIndigo,
  layoutMoleculeIndigo,
  loadIndigo,
  isIndigoReady,
} from '@moldraw/engine-2d/indigo';

let failed = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('OK:  ', msg);
  }
};

const main = async () => {
  console.log('=== Indigo engine-2d peer ===\n');
  const indigo = await loadIndigo();
  assert(!!indigo, 'Indigo WASM loads');
  assert(isIndigoReady(), 'isIndigoReady after load');

  const parsed = engine.parseSmiles('CC(=O)Oc1ccccc1C(=O)O');
  const laid = await layoutMoleculeIndigo(parsed, { bondLengthPx: 45 });
  assert(laid.source === 'indigo', 'layoutMoleculeIndigo source');
  assert(laid.molecule.atoms.length === parsed.atoms.length, 'atom count');

  // NativeEngine.generate2D is native (always); Indigo path is layoutMoleculeIndigo.
  const viaEngine = engine.generate2D(parsed, { bondLengthPx: 45 });
  assert(viaEngine.atoms.length === parsed.atoms.length, 'engine.generate2D native');

  const messy = {
    ...laid.molecule,
    atoms: laid.molecule.atoms.map((a, i) => ({
      ...a,
      x: i * 3,
      y: (i % 2) * 2,
      alias: i === 0 ? 'Ph' : a.alias,
    })),
  };
  const cleaned = await cleanupPreferIndigo(messy, { bondLengthPx: 45 });
  assert(cleaned.source === 'indigo', 'cleanup source indigo');
  assert(cleaned.molecule.atoms[0]?.alias === 'Ph', 'alias preserved');

  const nativeOnly = await cleanupPreferIndigo(messy, {
    bondLengthPx: 45,
    preferIndigo: false,
  });
  assert(nativeOnly.source === 'native', 'preferIndigo false → native');

  if (failed) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
  }
  console.log('\nIndigo engine-2d peer OK.');
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
