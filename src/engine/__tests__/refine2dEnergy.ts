/**
 * Stage 2+3 spring refine / scaffold / untangle — paclitaxel-like must improve.
 * Run: npx tsx src/engine/__tests__/refine2dEnergy.ts
 */
import { nativeEngine as engine } from '../nativeEngine';
import { layoutComponentSkeleton } from '../layout/skeletonLayout';
import { buildGraph, connectedComponents } from '../graph';
import { perceiveRings } from '../chem/rings';
import { refine2DEnergy } from '../layout/refine2dEnergy';
import { measureLayoutQuality, isAcceptableLayout } from '../layout/layoutQuality';
import { stripTerminalHydrogensForLayout } from '../layout/generate2d';
import { cleanupStructure } from '../layout/cleanupStructure';
import { fusedRingFingerprint, preferredCoreRingSize } from '../layout/scaffoldTemplates';
import { untangleByReflection } from '../layout/untangleByReflection';

const BOND = 45;
const PACLITAXEL =
  'CC(=O)OC1C(=O)C2(C)C(O)CC3OCC3(OC(C)=O)C2C(OC(=O)c2ccccc2)C2(O)CC(OC(=O)C(O)C(NC(=O)c3ccccc3)c3ccccc3)C(C)=C1C2(C)C';

let failed = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('OK:  ', msg);
  }
};

const score = (q: ReturnType<typeof measureLayoutQuality>) =>
  q.overlaps * 10 + q.crossings * 8 + q.bondRatio * 2;

console.log('=== Stage 2+3 refine / scaffold / untangle ===\n');

const parsed = stripTerminalHydrogensForLayout(engine.parseSmiles(PACLITAXEL));
const g = buildGraph(parsed);
const rings = perceiveRings(parsed);

const scaffoldInfo = fusedRingFingerprint(
  g,
  rings,
  new Set(rings.flatMap(r => r.atomIds)),
);
console.log(
  'scaffold',
  scaffoldInfo?.fingerprint,
  'prefer',
  preferredCoreRingSize(scaffoldInfo?.fingerprint ?? ''),
);
assert(scaffoldInfo?.fingerprint === '4-6-6-8', 'taxane fingerprint 4-6-6-8');
assert(preferredCoreRingSize('4-6-6-8') === 8, 'taxane prefers 8-ring first');

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
  `seed: ov=${seedQ.overlaps} x=${seedQ.crossings} ratio=${seedQ.bondRatio.toFixed(2)} score=${score(seedQ).toFixed(1)}`,
);

const t0 = Date.now();
const refined = refine2DEnergy(seed, { bondLengthPx: BOND, onlyIfNeeded: false });
const ms = Date.now() - t0;
const refQ = measureLayoutQuality(refined);
console.log(
  `refine: ov=${refQ.overlaps} x=${refQ.crossings} ratio=${refQ.bondRatio.toFixed(2)} score=${score(refQ).toFixed(1)} ${ms}ms`,
);

assert(ms < 8000, `refine finishes under 8s (got ${ms}ms)`);
assert(
  score(refQ) < score(seedQ) - 5,
  `refine improves score (${score(seedQ).toFixed(1)} → ${score(refQ).toFixed(1)})`,
);
assert(refQ.bondRatio < 3.5, `bond ratio sane after refine (${refQ.bondRatio.toFixed(2)})`);
assert(refQ.overlaps <= 3, `overlaps low after refine (got ${refQ.overlaps})`);
assert(
  refQ.crossings < seedQ.crossings * 0.75,
  `crossings cut ≥25% (${seedQ.crossings} → ${refQ.crossings})`,
);

const flipped = untangleByReflection(refined);
const flipQ = measureLayoutQuality(flipped);
console.log(
  `untangle: ov=${flipQ.overlaps} x=${flipQ.crossings} ratio=${flipQ.bondRatio.toFixed(2)} score=${score(flipQ).toFixed(1)}`,
);
assert(score(flipQ) <= score(refQ) + 0.1, 'untangle does not worsen refine');

const t1 = Date.now();
const full = engine.generate2D(engine.parseSmiles(PACLITAXEL), BOND);
const fullMs = Date.now() - t1;
const fullQ = measureLayoutQuality(full);
console.log(
  `generate2D: ov=${fullQ.overlaps} x=${fullQ.crossings} ratio=${fullQ.bondRatio.toFixed(2)} ${fullMs}ms acceptable=${isAcceptableLayout(full)}`,
);
assert(fullMs < 10000, `generate2D under 10s (got ${fullMs}ms)`);
assert(score(fullQ) <= score(seedQ), 'generate2D not worse than Stage-1 seed');
assert(fullQ.crossings <= 15, `generate2D crossings ≤15 (got ${fullQ.crossings})`);

const aspirin = engine.generate2D(engine.parseSmiles('CC(=O)Oc1ccccc1C(=O)O'), BOND);
assert(isAcceptableLayout(aspirin), 'aspirin still acceptable');
const aspQ = measureLayoutQuality(aspirin);
assert(aspQ.overlaps === 0 && aspQ.crossings === 0, 'aspirin zero overlaps/crossings');

const chol = engine.generate2D(
  engine.parseSmiles('CC(C)CCCC(C)C1CCC2C3CC=C4CC(O)CCC4(C)C3CCC12C'),
  BOND,
);
const cholQ = measureLayoutQuality(chol);
console.log(`cholesterol: ov=${cholQ.overlaps} x=${cholQ.crossings} ratio=${cholQ.bondRatio.toFixed(2)}`);
assert(isAcceptableLayout(chol), 'cholesterol acceptable after Stage 2+3');

const cleaned = cleanupStructure(seed, { bondLengthPx: BOND, preserveOrientation: true });
const cleanQ = measureLayoutQuality(cleaned);
console.log(
  `cleanup←seed: ov=${cleanQ.overlaps} x=${cleanQ.crossings} ratio=${cleanQ.bondRatio.toFixed(2)}`,
);
assert(score(cleanQ) <= score(seedQ), 'cleanup does not worsen seed');

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nStage 2+3 OK.');
