/**
 * Mimic ApplyCleanupResult merge after worker CLEANUP_SUCCESS (coords-only).
 * Uses Indigo like the real 2D worker.
 * Run: npx tsx scripts/backtest-2d-cleanup-path.ts
 */
import { nativeEngine as engine } from '../src/engine/nativeEngine.ts';
import { cleanupPreferIndigo, loadIndigo } from '../src/engine-2d/indigo/index.ts';
import { mergeGlobalCleanup } from '../src/core/io/localCleanup.ts';
import { createMoleculeStore } from '../src/core/editor/createMoleculeStore.ts';
import { CMD } from '../src/core/commands/registry.ts';

let failed = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  if (ok) console.log('OK:  ', name);
  else {
    failed += 1;
    console.error('FAIL:', name, detail ?? '');
  }
};

const indigo = await loadIndigo();
check('Indigo loads', !!indigo);

const parsed = engine.parseSmiles('c1ccccc1O');
const laid = await cleanupPreferIndigo(parsed, { bondLengthPx: 45 });
check('cleanupPreferIndigo', laid.source === 'indigo' && laid.molecule.atoms.length > 0);

const messy = {
  ...laid.molecule,
  atoms: laid.molecule.atoms.map((a, i) => ({
    ...a,
    x: (i % 3) * 7,
    y: Math.floor(i / 3) * 11,
  })),
};

const store = createMoleculeStore({ initialMolecule: messy });
const cleaned = await cleanupPreferIndigo(messy, { bondLengthPx: 45 });
const mb = engine.toMolblock(cleaned.molecule);

const result = store.applyCommand(CMD.ApplyCleanupResult, {
  mode: 'global',
  molBlock: mb,
});
check('ApplyCleanupResult ok', result.ok, !result.ok ? result.error?.message : undefined);

const after = store.getMolecule();
check('ids stable', after.atoms.every((a, i) => a.id === messy.atoms[i].id));
const moved = after.atoms.some(
  (a, i) => Math.hypot(a.x - messy.atoms[i].x, a.y - messy.atoms[i].y) > 0.5,
);
check('coords changed', moved);

const merged = mergeGlobalCleanup(messy, mb);
check('merge !== prev ref', merged !== messy);

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\n2D cleanup apply path OK.');
