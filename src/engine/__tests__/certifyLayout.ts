/**
 * Stage D certify — Tier A hard gate; paclitaxel soft gate (ov=0, x≤3).
 * Run: npx tsx src/engine/__tests__/certifyLayout.ts
 */
import { nativeEngine as engine } from '../nativeEngine';
import { layoutComponentSkeleton } from '../layout/skeletonLayout';
import { buildGraph, connectedComponents } from '../graph';
import { perceiveRings } from '../chem/rings';
import { certifyLayout } from '../layout/certifyLayout';
import { cleanupStructureWithStatus } from '../layout/cleanupStructure';
import {
  measureLayoutQuality,
  passesHardGate,
  passesSoftGate,
  layoutScore,
} from '../layout/layoutQuality';
import { stripTerminalHydrogensForLayout } from '../layout/generate2d';

const BOND = 45;
const PACLITAXEL =
  'CC(=O)OC1C(=O)C2(C)C(O)CC3OCC3(OC(C)=O)C2C(OC(=O)c2ccccc2)C2(O)CC(OC(=O)C(O)C(NC(=O)c3ccccc3)c3ccccc3)C(C)=C1C2(C)C';

const TIER_A = [
  { name: 'benzene', smiles: 'c1ccccc1' },
  { name: 'aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
  { name: 'naphthalene', smiles: 'c1ccc2ccccc2c1' },
  { name: 'cholesterol', smiles: 'CC(C)CCCC(C)C1CCC2C3CC=C4CC(O)CCC4(C)C3CCC12C' },
];

let failed = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('OK:  ', msg);
  }
};

console.log('=== Stage D certifyLayout ===\n');

for (const { name, smiles } of TIER_A) {
  const laid = engine.generate2D(engine.parseSmiles(smiles), BOND);
  const result = certifyLayout(laid, { bondLengthPx: BOND, maxRestarts: 3 });
  const q = result.quality;
  console.log(
    `${name}: ov=${q.overlaps} x=${q.crossings} ratio=${q.bondRatio.toFixed(2)} status=${result.status} attempts=${result.attempts}`,
  );
  assert(passesHardGate(result.molecule), `${name} passes hard gate`);
  assert(result.status === 'certified', `${name} status certified`);
  assert(q.overlaps === 0 && q.crossings === 0, `${name} zero overlaps/crossings`);
}

const parsed = stripTerminalHydrogensForLayout(engine.parseSmiles(PACLITAXEL));
const g = buildGraph(parsed);
const rings = perceiveRings(parsed);
const orig = new Map(parsed.atoms.map(a => [a.id, { x: a.x, y: a.y }]));
const pos = new Map<string, { x: number; y: number }>();
for (const comp of connectedComponents(parsed)) {
  const compPos = layoutComponentSkeleton({
    g,
    comp,
    rings,
    bondLen: BOND,
    origin: { x: 0, y: 0 },
    orig,
    mode: 'full',
  });
  for (const [id, p] of compPos) pos.set(id, p);
}
const seed = {
  ...parsed,
  atoms: parsed.atoms.map(a => {
    const p = pos.get(a.id);
    return p ? { ...a, x: p.x, y: p.y } : a;
  }),
};
const seedQ = measureLayoutQuality(seed);
console.log(
  `\nseed: ov=${seedQ.overlaps} x=${seedQ.crossings} score=${layoutScore(seed).toFixed(1)}`,
);

const t0 = Date.now();
const certified = certifyLayout(seed, { bondLengthPx: BOND, maxRestarts: 4, repairRounds: 5 });
const ms = Date.now() - t0;
const cq = certified.quality;
console.log(
  `certify: ov=${cq.overlaps} x=${cq.crossings} ratio=${cq.bondRatio.toFixed(2)} score=${layoutScore(certified.molecule).toFixed(1)} status=${certified.status} attempts=${certified.attempts} ${ms}ms`,
);

assert(ms < 90000, `certify under 90s (got ${ms}ms)`);
assert(passesSoftGate(certified.molecule), 'paclitaxel passes soft gate (ov=0, x≤3)');
assert(cq.overlaps === 0, `paclitaxel overlaps = 0 (got ${cq.overlaps})`);
assert(cq.crossings <= 3, `paclitaxel crossings ≤3 (got ${cq.crossings})`);
assert(
  certified.status === 'certified' || certified.status === 'degraded',
  'status is honest certified|degraded',
);
// Hard gate may fail on taxane — that is OK if status is degraded.
if (!passesHardGate(certified.molecule)) {
  assert(certified.status === 'degraded', 'hard-gate miss reports degraded');
}

const t1 = Date.now();
const cleaned = cleanupStructureWithStatus(seed, {
  bondLengthPx: BOND,
  preserveOrientation: true,
  maxRestarts: 3,
});
const cleanMs = Date.now() - t1;
const cleanQ = measureLayoutQuality(cleaned.molecule);
console.log(
  `cleanup: ov=${cleanQ.overlaps} x=${cleanQ.crossings} ratio=${cleanQ.bondRatio.toFixed(2)} status=${cleaned.status} ${cleanMs}ms`,
);
assert(passesSoftGate(cleaned.molecule), 'cleanup paclitaxel soft gate');
assert(cleanQ.overlaps === 0, 'cleanup overlaps = 0');
assert(cleanQ.crossings <= 3, 'cleanup crossings ≤3');

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nStage D certifyLayout OK.');
