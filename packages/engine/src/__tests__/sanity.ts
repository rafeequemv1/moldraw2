/**
 * Standalone sanity checks for the native engine. Run with:
 *   npx tsx src/engine/__tests__/sanity.ts
 *
 * This is a lightweight self-test (no test framework dependency) so it runs in
 * plain Node. Replace with Vitest once a test harness is added (see fable report/02).
 */
import { engine } from '../index';

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

console.log('NativeEngine sanity checks\n');

// ── SMILES parse + properties ────────────────────────────────────────────────
console.log('SMILES parse + properties');
{
  const benzene = engine.parseSmiles('c1ccccc1');
  check('benzene: 6 carbons', benzene.atoms.filter(a => a.element === 'C').length === 6);
  check('benzene: 6 ring bonds', benzene.bonds.length === 6);
  check('benzene: 3 double bonds after kekulize', benzene.bonds.filter(b => b.order === 2).length === 3);
  const p = engine.properties(benzene);
  check('benzene: formula C6H6', p.formula === 'C6H6', p.formula);
  check('benzene: MW ~78.11', Math.abs(p.mw - 78.11) < 0.1, p.mw);

  const ethanol = engine.parseSmiles('CCO');
  const pe = engine.properties(ethanol);
  check('ethanol: formula C2H6O', pe.formula === 'C2H6O', pe.formula);

  const pyridine = engine.parseSmiles('c1ccncc1');
  const pp = engine.properties(pyridine);
  check('pyridine: formula C5H5N', pp.formula === 'C5H5N', pp.formula);

  const acetic = engine.parseSmiles('CC(=O)O');
  const pa = engine.properties(acetic);
  check('acetic acid: formula C2H4O2', pa.formula === 'C2H4O2', pa.formula);

  const ammonium = engine.parseSmiles('[NH4+]');
  const pn = engine.properties(ammonium);
  check('ammonium: net charge +1', pn.charge === 1, pn.charge);
  check('ammonium: formula H4N', pn.formula === 'H4N', pn.formula);
}

// ── Rings (SSSR) ─────────────────────────────────────────────────────────────
console.log('\nRing perception (SSSR)');
{
  const naphthalene = engine.parseSmiles('c1ccc2ccccc2c1');
  const rings = engine.perceiveRings(naphthalene);
  check('naphthalene: 2 rings', rings.length === 2, rings.map(r => r.size));
  check('naphthalene: both size 6', rings.every(r => r.size === 6));

  const cyclohexane = engine.parseSmiles('C1CCCCC1');
  check('cyclohexane: 1 ring of 6', (() => {
    const r = engine.perceiveRings(cyclohexane);
    return r.length === 1 && r[0].size === 6;
  })());
}

// ── molblock round-trip ──────────────────────────────────────────────────────
console.log('\nMolblock round-trip');
{
  const mol = engine.parseSmiles('CCO');
  const laid = engine.generate2D(mol);
  const mb = engine.toMolblock(laid);
  const reparsed = engine.parseMolblock(mb);
  check('CCO molblock: atom count preserved', reparsed.atoms.length === laid.atoms.length);
  check('CCO molblock: bond count preserved', reparsed.bonds.length === laid.bonds.length);
  check('molblock: has V2000 + M END', mb.includes('V2000') && mb.includes('M  END'));
}

// ── SMILES write ─────────────────────────────────────────────────────────────
console.log('\nSMILES write');
{
  const mol = engine.parseSmiles('CCO');
  const smi = engine.toSmiles(mol);
  check('CCO writes non-empty SMILES', smi.length > 0, smi);
  // round-trip formula stability
  const reparsed = engine.parseSmiles(smi);
  check(
    'CCO round-trip preserves formula',
    engine.properties(reparsed).formula === engine.properties(mol).formula,
    { in: engine.properties(mol).formula, out: engine.properties(reparsed).formula, smi },
  );

  const benzene = engine.parseSmiles('c1ccccc1');
  const bsmi = engine.toSmiles(benzene);
  const bre = engine.parseSmiles(bsmi);
  check(
    'benzene round-trip preserves formula',
    engine.properties(bre).formula === 'C6H6',
    { smi: bsmi, formula: engine.properties(bre).formula },
  );
}

// ── 2D layout ────────────────────────────────────────────────────────────────
console.log('\n2D layout');
{
  const mol = engine.parseSmiles('c1ccccc1');
  const laid = engine.generate2D(mol, { bondLengthPx: 40 });
  const bondLens = laid.bonds.map(b => {
    const a1 = laid.atoms.find(a => a.id === b.fromAtomId)!;
    const a2 = laid.atoms.find(a => a.id === b.toAtomId)!;
    return Math.hypot(a1.x - a2.x, a1.y - a2.y);
  });
  const avg = bondLens.reduce((s, l) => s + l, 0) / bondLens.length;
  check('benzene layout: avg bond length ~40px', Math.abs(avg - 40) < 12, avg);
  check('benzene layout: no NaN coords', laid.atoms.every(a => Number.isFinite(a.x) && Number.isFinite(a.y)));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
