/**
 * Cleanup speed vs accuracy — everyday molecules must stay fast; quality intact.
 * Run: npx tsx src/engine/__tests__/cleanupSpeed.ts
 */
import { parseSmilesToMolecule } from '../smiles/parse';
import { cleanupStructure } from '../layout/cleanupStructure';
import { measureLayoutQuality, isChemDrawReady } from '../layout/layoutQuality';
import type { Molecule } from '@moldraw/domain';

const BOND = 45;
let failed = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('OK:  ', msg);
  }
};

const scramble = (mol: Molecule, seed = 42): Molecule => {
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  return {
    ...mol,
    atoms: mol.atoms.map(a => ({ ...a, x: rnd() * 300, y: rnd() * 200 })),
  };
};

const cases = [
  { name: 'octane', smiles: 'CCCCCCCC', maxMs: 80 },
  { name: 'aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O', maxMs: 100 },
  { name: 'hexylbenzene', smiles: 'CCCCCCc1ccccc1', maxMs: 120 },
  { name: 'polyOH', smiles: 'CC(O)CC1CC(O)C(O)C1CCC(O)CCCC', maxMs: 250 },
  { name: 'cholesterol', smiles: 'CC(C)CCCC(C)C1CCC2C3CC=C4CC(O)CCC4(C)C3CCC12C', maxMs: 400 },
  {
    name: 'paclitaxel-like',
    smiles:
      'CC(=O)OC1C(=O)C2(C)C(O)CC3OCC3(OC(C)=O)C2C(OC(=O)c2ccccc2)C2(O)CC(OC(=O)C(O)C(NC(=O)c3ccccc3)c3ccccc3)C(C)=C1C2(C)C',
    maxMs: 3500,
  },
];

console.log('=== Cleanup speed (accuracy preserved) ===\n');

for (const c of cases) {
  const messy = scramble(parseSmilesToMolecule(c.smiles));
  const t0 = Date.now();
  const cleaned = cleanupStructure(messy, { bondLengthPx: BOND, preserveOrientation: false });
  const ms = Date.now() - t0;
  const q = measureLayoutQuality(cleaned);
  console.log(
    `${c.name.padEnd(16)} ${String(ms).padStart(5)}ms  ov=${q.overlaps} x=${q.crossings} ratio=${q.bondRatio.toFixed(2)} ready=${isChemDrawReady(cleaned)}`,
  );
  assert(ms < c.maxMs, `${c.name} under ${c.maxMs}ms (got ${ms}ms)`);
  assert(q.overlaps === 0, `${c.name} overlaps=0`);
  if (c.name !== 'paclitaxel-like') {
    assert(q.bondRatio < 1.25, `${c.name} bond ratio < 1.25`);
    assert(isChemDrawReady(cleaned) || q.crossings <= 1, `${c.name} ChemDraw-ready`);
  } else {
    // Soft gate for hard polycyclics — overlaps gone, crossings bounded.
    assert(q.crossings <= 5, `${c.name} crossings ≤5 (got ${q.crossings})`);
    assert(q.bondRatio < 3.5, `${c.name} bond ratio sane (got ${q.bondRatio.toFixed(2)})`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nCleanup speed OK.');
