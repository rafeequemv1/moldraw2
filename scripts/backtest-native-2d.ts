/**
 * Native-only 2D path (no Indigo WASM).
 * Run: npx tsx scripts/backtest-native-2d.ts
 */
import { nativeEngine as engine } from '../src/engine/nativeEngine.ts';
import { cleanupStructure } from '../src/engine/layout/cleanupStructure.ts';
import { nativeSmilesTo2DMolblock } from '../src/core/io/smilesToMolblock.ts';
import { cleanupPreferIndigo } from '../src/engine-2d/indigo/cleanupPreferIndigo.ts';

let failed = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  if (ok) console.log('OK:  ', name);
  else {
    failed += 1;
    console.error('FAIL:', name, detail ?? '');
  }
};

const parsed = engine.parseSmiles('CCO');
check('parse ethanol', parsed.atoms.length >= 3);

const laid = engine.generate2D(parsed, { bondLengthPx: 45 });
check('native generate2D', laid.atoms.length === parsed.atoms.length);
const spread = Math.max(...laid.atoms.map(a => a.x)) - Math.min(...laid.atoms.map(a => a.x));
check('native layout has spread', spread > 10, `spread=${spread}`);

const cleaned = cleanupStructure(laid, { bondLengthPx: 45, preserveOrientation: true });
check('cleanupStructure', cleaned.atoms.length === laid.atoms.length);

const mb = nativeSmilesTo2DMolblock('c1ccccc1O', 45);
check('nativeSmilesTo2DMolblock', !!mb && mb.includes('V2000'));

const prefer = await cleanupPreferIndigo(laid, { bondLengthPx: 45, preferIndigo: false });
check('cleanupPreferIndigo native-only', prefer.source === 'native');
check('prefer native keeps atoms', prefer.molecule.atoms.length === laid.atoms.length);

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nNative 2D path OK (no Indigo required).');
