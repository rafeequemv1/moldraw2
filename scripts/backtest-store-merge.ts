/**
 * Store/merge path without loading Indigo (avoids command registry).
 * Run: npx tsx scripts/backtest-store-merge.ts
 */
import { createMoleculeStore } from '../src/core/editor/createMoleculeStore.ts';
import { mergeGlobalCleanup } from '../src/core/io/localCleanup.ts';
import { moleculeToMolblock } from '../src/core/io/molblock.ts';

let failed = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  if (ok) console.log('OK:  ', name);
  else {
    failed += 1;
    console.error('FAIL:', name, detail ?? '');
  }
};

const store = createMoleculeStore();
store.updateMolecule({
  atoms: [
    { id: 'a1', element: 'C', x: 0, y: 0, charge: 0 },
    { id: 'a2', element: 'C', x: 12, y: 55, charge: 0 },
    { id: 'a3', element: 'O', x: 80, y: 10, charge: 0 },
  ],
  bonds: [
    { id: 'b1', fromAtomId: 'a1', toAtomId: 'a2', order: 1 },
    { id: 'b2', fromAtomId: 'a2', toAtomId: 'a3', order: 1 },
  ],
});
check('store.updateMolecule atoms', store.getMolecule().atoms.length === 3);

const messy = store.getMolecule();
const laidMb = moleculeToMolblock({
  atoms: [
    { id: 'a1', element: 'C', x: 0, y: 0, charge: 0 },
    { id: 'a2', element: 'C', x: 40, y: 0, charge: 0 },
    { id: 'a3', element: 'O', x: 80, y: 0, charge: 0 },
  ],
  bonds: messy.bonds,
});
const merged = mergeGlobalCleanup(messy, laidMb);
check('merge keeps ids', merged.atoms.map(a => a.id).join(',') === 'a1,a2,a3');
check(
  'merge adopts linear layout spacing',
  Math.abs(merged.atoms[1].x - merged.atoms[0].x - 40) < 0.01,
  `dx=${merged.atoms[1].x - merged.atoms[0].x}`,
);

store.updateMolecule(merged);
check('store accepts merged molecule', store.getMolecule().atoms[1].id === 'a2');
check('undo after updateMolecule', store.canUndo());
store.undo();
check('undo restores messy y', Math.abs(store.getMolecule().atoms[1].y - 55) < 0.01);

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nStore + mergeGlobalCleanup OK.');
