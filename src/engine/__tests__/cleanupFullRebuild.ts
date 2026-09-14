/**
 * Cleanup must FULLY recalculate coords (bond length + 120°), not freeze crooked drawings.
 * Run: npx tsx src/engine/__tests__/cleanupFullRebuild.ts
 */
import { parseSmilesToMolecule } from '../smiles/parse';
import { cleanupStructure } from '../layout/cleanupStructure';
import { measureLayoutQuality } from '../layout/layoutQuality';
import { buildGraph } from '../graph';
import { perceiveRings } from '../chem/rings';
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

const scramble = (mol: Molecule, seed = 1): Molecule => {
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  return {
    ...mol,
    atoms: mol.atoms.map(a => ({
      ...a,
      x: rnd() * 400,
      y: rnd() * 300,
    })),
  };
};

const bondAngleDeg = (mol: Molecule, cId: string, aId: string, bId: string): number => {
  const c = mol.atoms.find(a => a.id === cId)!;
  const a = mol.atoms.find(x => x.id === aId)!;
  const b = mol.atoms.find(x => x.id === bId)!;
  const da = Math.atan2(a.y - c.y, a.x - c.x);
  const db = Math.atan2(b.y - c.y, b.x - c.x);
  let d = Math.abs(da - db);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return (d * 180) / Math.PI;
};

/** Interior C–C–C angles on acyclic carbons (exclude ring interiors). */
const acyclicCccAngles = (mol: Molecule): number[] => {
  const g = buildGraph(mol);
  const rings = perceiveRings(mol);
  const ringSet = new Set(rings.flatMap(r => r.atomIds));
  const byId = new Map(mol.atoms.map(a => [a.id, a]));
  const angles: number[] = [];
  for (const a of mol.atoms) {
    if (a.element !== 'C') continue;
    const cNbs = (g.nodes.get(a.id)?.neighbors ?? []).filter(
      n => byId.get(n)?.element === 'C',
    );
    if (cNbs.length < 2) continue;
    for (let i = 0; i < cNbs.length; i++) {
      for (let j = i + 1; j < cNbs.length; j++) {
        // Skip pure ring-interior triples.
        if (ringSet.has(a.id) && ringSet.has(cNbs[i]!) && ringSet.has(cNbs[j]!)) continue;
        angles.push(bondAngleDeg(mol, a.id, cNbs[i]!, cNbs[j]!));
      }
    }
  }
  return angles;
};

const ringBondLens = (mol: Molecule): number[] => {
  const rings = perceiveRings(mol);
  const byId = new Map(mol.atoms.map(a => [a.id, a]));
  const lens: number[] = [];
  for (const r of rings) {
    const ids = r.atomIds;
    for (let i = 0; i < ids.length; i++) {
      const a = byId.get(ids[i]!);
      const b = byId.get(ids[(i + 1) % ids.length]!);
      if (!a || !b) continue;
      lens.push(Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return lens;
};

console.log('=== Cleanup full rebuild (bond + angle) ===\n');

// Branched alkyl + cyclopentane — matches the failing screenshot class.
const smiles = 'CCCC(C)CC1CCCC1CCC(C)CCCC';
const messy = scramble(parseSmilesToMolecule(smiles), 42);
const before = measureLayoutQuality(messy);
console.log(
  `before: ratio=${before.bondRatio.toFixed(2)} ov=${before.overlaps} x=${before.crossings} cccBad=${(before.badCccFraction * 100).toFixed(0)}%`,
);

const cleaned = cleanupStructure(messy, { bondLengthPx: BOND });
const after = measureLayoutQuality(cleaned);
console.log(
  `after:  ratio=${after.bondRatio.toFixed(2)} ov=${after.overlaps} x=${after.crossings} cccBad=${(after.badCccFraction * 100).toFixed(0)}%`,
);

assert(after.bondRatio < 1.15, `uniform bonds (ratio ${after.bondRatio.toFixed(2)})`);
assert(after.overlaps === 0, `no overlaps (got ${after.overlaps})`);
assert(Math.abs(after.avgBond - BOND) < 1.5, `avg bond ≈ ${BOND} (got ${after.avgBond.toFixed(1)})`);

const angles = acyclicCccAngles(cleaned);
const bad = angles.filter(a => Math.abs(a - 120) > 15 && Math.abs(a - 90) > 15);
console.log(
  `acyclic C–C–C: n=${angles.length} sample=${angles
    .slice(0, 8)
    .map(a => a.toFixed(0))
    .join(',')} bad=${bad.length}`,
);
assert(
  angles.length > 0 && bad.length / angles.length < 0.2,
  `≥80% acyclic angles ~120°/90° (bad ${bad.length}/${angles.length})`,
);

const rLens = ringBondLens(cleaned);
if (rLens.length) {
  const rMin = Math.min(...rLens);
  const rMax = Math.max(...rLens);
  console.log(`ring bonds: ${rMin.toFixed(1)}–${rMax.toFixed(1)}`);
  assert(rMax / rMin < 1.12, `regular ring bonds (ratio ${(rMax / rMin).toFixed(2)})`);
  assert(
    rLens.every(d => Math.abs(d - BOND) < BOND * 0.12),
    'ring bonds ≈ bondLengthPx',
  );
}

// Scrambled octane must become exact zig-zag even when "reasonable" span exists.
const oct = scramble(parseSmilesToMolecule('CCCCCCCC'), 7);
// Stretch one bond so it looks "drawn" but uneven — old path would soft-correct.
const tip = oct.atoms[0]!;
tip.x += 200;
const octClean = cleanupStructure(oct, { bondLengthPx: BOND });
const oq = measureLayoutQuality(octClean);
assert(oq.bondRatio < 1.05, `octane uniform (ratio ${oq.bondRatio.toFixed(2)})`);
const oAngles = acyclicCccAngles(octClean);
assert(
  oAngles.every(a => Math.abs(a - 120) < 8),
  `octane all 120° (got ${oAngles.map(a => a.toFixed(1)).join(', ')})`,
);

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nCleanup full rebuild OK.');
