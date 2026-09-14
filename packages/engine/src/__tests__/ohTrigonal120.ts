/**
 * Alcohol / exo hetero OH must sit in free 120° slots (H ignored).
 * Run: npx tsx src/engine/__tests__/ohTrigonal120.ts
 */
import { parseSmilesToMolecule } from '../smiles/parse';
import { cleanupStructure } from '../layout/cleanupStructure';
import { generate2D } from '../layout/generate2d';
import { buildGraph } from '../graph';
import { measureLayoutQuality } from '../layout/layoutQuality';
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

const angleDeg = (c: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const da = Math.atan2(a.y - c.y, a.x - c.x);
  const db = Math.atan2(b.y - c.y, b.x - c.x);
  let d = Math.abs(da - db);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return (d * 180) / Math.PI;
};

/** For each C–OH, measure angles between O and every other heavy neighbor of C. */
const ohAngles = (mol: Molecule): { id: string; angles: number[] }[] => {
  const g = buildGraph(mol);
  const byId = new Map(mol.atoms.map(a => [a.id, a]));
  const out: { id: string; angles: number[] }[] = [];
  for (const a of mol.atoms) {
    if (a.element !== 'O') continue;
    const heavyNbs = (g.nodes.get(a.id)?.neighbors ?? []).filter(n => {
      const el = byId.get(n)?.element ?? '';
      return el !== 'H' && el !== 'D';
    });
    if (heavyNbs.length !== 1) continue;
    const cId = heavyNbs[0]!;
    if (byId.get(cId)?.element !== 'C') continue;
    const c = byId.get(cId)!;
    const o = a;
    const otherHeavy = (g.nodes.get(cId)?.neighbors ?? []).filter(n => {
      if (n === a.id) return false;
      const el = byId.get(n)?.element ?? '';
      return el !== 'H' && el !== 'D';
    });
    const angles = otherHeavy.map(n => angleDeg(c, o, byId.get(n)!));
    out.push({ id: a.id, angles });
  }
  return out;
};

const scramble = (mol: Molecule, seed = 3): Molecule => {
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

console.log('=== OH trigonal 120° (ignore H) ===\n');

// Simple secondary alcohol
{
  const mol = scramble(parseSmilesToMolecule('CCC(O)CC'));
  const clean = cleanupStructure(mol, { bondLengthPx: BOND });
  const q = measureLayoutQuality(clean);
  console.log(`pentan-3-ol: ratio=${q.bondRatio.toFixed(2)} ov=${q.overlaps}`);
  const ohs = ohAngles(clean);
  assert(ohs.length === 1, `one OH (got ${ohs.length})`);
  for (const oh of ohs) {
    console.log(`  OH angles: ${oh.angles.map(a => a.toFixed(1)).join(', ')}`);
    assert(
      oh.angles.every(a => Math.abs(a - 120) < 12),
      `OH–C–X ≈ 120° (got ${oh.angles.map(a => a.toFixed(1)).join(', ')})`,
    );
  }
}

// Ring alcohol
{
  const mol = scramble(parseSmilesToMolecule('OC1CCCC1'));
  const clean = cleanupStructure(mol, { bondLengthPx: BOND });
  const ohs = ohAngles(clean);
  assert(ohs.length === 1, 'cyclopentanol one OH');
  for (const oh of ohs) {
    console.log(`  ring-OH angles: ${oh.angles.map(a => a.toFixed(1)).join(', ')}`);
    assert(
      oh.angles.every(a => Math.abs(a - 120) < 18),
      `ring OH ~120° to ring bonds (got ${oh.angles.map(a => a.toFixed(1)).join(', ')})`,
    );
  }
}

// Multi-OH branched (screenshot class)
{
  const smiles = 'CC(O)CC1CC(O)C(O)C1CCC(O)CCCC';
  const mol = scramble(parseSmilesToMolecule(smiles), 11);
  const clean = cleanupStructure(mol, { bondLengthPx: BOND });
  const q = measureLayoutQuality(clean);
  console.log(
    `poly-OH: ratio=${q.bondRatio.toFixed(2)} ov=${q.overlaps} x=${q.crossings} cccBad=${(q.badCccFraction * 100).toFixed(0)}%`,
  );
  const ohs = ohAngles(clean);
  assert(ohs.length >= 3, `several OH (got ${ohs.length})`);
  let bad = 0;
  let total = 0;
  for (const oh of ohs) {
    console.log(`  OH ${oh.id}: ${oh.angles.map(a => a.toFixed(1)).join(', ')}`);
    for (const a of oh.angles) {
      total += 1;
      if (Math.abs(a - 120) > 18) bad += 1;
    }
  }
  assert(bad === 0, `all OH–C–X ≈ 120° (bad ${bad}/${total})`);
  assert(q.bondRatio < 1.2, `uniform bonds (${q.bondRatio.toFixed(2)})`);
}

// generate2D path too
{
  const laid = generate2D(parseSmilesToMolecule('CCCC(O)CCCC'), { bondLengthPx: BOND });
  const ohs = ohAngles(laid);
  assert(ohs.length === 1, 'generate2D has OH');
  assert(
    ohs[0]!.angles.every(a => Math.abs(a - 120) < 12),
    `generate2D OH 120° (got ${ohs[0]!.angles.map(a => a.toFixed(1)).join(', ')})`,
  );
}

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nOH trigonal 120° OK.');
