/**
 * Stage 1 certified minimizer — aspirin stays clean; paclitaxel improves.
 * Run: npx tsx src/engine/__tests__/minimize2D.ts
 */
import { nativeEngine as engine } from '../nativeEngine';
import { layoutComponentSkeleton } from '../layout/skeletonLayout';
import { buildGraph, connectedComponents } from '../graph';
import { perceiveRings } from '../chem/rings';
import { minimize2D } from '../layout/minimize2D';
import { measureLayoutQuality, isAcceptableLayout } from '../layout/layoutQuality';
import { stripTerminalHydrogensForLayout } from '../layout/generate2d';
import { cleanupStructure } from '../layout/cleanupStructure';

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

console.log('=== Stage 1 minimize2D ===\n');

const aspirin = engine.generate2D(engine.parseSmiles('CC(=O)Oc1ccccc1C(=O)O'), BOND);
const aspMin = minimize2D(aspirin, { bondLengthPx: BOND, onlyIfNeeded: false });
assert(isAcceptableLayout(aspMin), 'aspirin acceptable after minimize');
const aspQ = measureLayoutQuality(aspMin);
assert(aspQ.overlaps === 0 && aspQ.crossings === 0, 'aspirin zero overlaps/crossings');
assert(aspQ.bondRatio < 1.35, `aspirin bond ratio tight (${aspQ.bondRatio.toFixed(2)})`);

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
  `seed: ov=${seedQ.overlaps} x=${seedQ.crossings} ratio=${seedQ.bondRatio.toFixed(2)} score=${score(seedQ).toFixed(1)}`,
);

const t0 = Date.now();
const minimized = minimize2D(seed, { bondLengthPx: BOND, onlyIfNeeded: false });
const ms = Date.now() - t0;
const minQ = measureLayoutQuality(minimized);
console.log(
  `minimize: ov=${minQ.overlaps} x=${minQ.crossings} ratio=${minQ.bondRatio.toFixed(2)} score=${score(minQ).toFixed(1)} ${ms}ms`,
);

assert(ms < 12000, `minimize finishes under 12s (got ${ms}ms)`);
assert(
  score(minQ) < score(seedQ) - 3,
  `minimize improves score (${score(seedQ).toFixed(1)} → ${score(minQ).toFixed(1)})`,
);
assert(minQ.bondRatio < 3.5, `bond ratio sane (${minQ.bondRatio.toFixed(2)})`);
assert(minQ.overlaps <= seedQ.overlaps, `overlaps not worse (${seedQ.overlaps} → ${minQ.overlaps})`);

const t1 = Date.now();
const cleaned = cleanupStructure(seed, { bondLengthPx: BOND, preserveOrientation: true });
const cleanMs = Date.now() - t1;
const cleanQ = measureLayoutQuality(cleaned);
console.log(
  `cleanup: ov=${cleanQ.overlaps} x=${cleanQ.crossings} ratio=${cleanQ.bondRatio.toFixed(2)} score=${score(cleanQ).toFixed(1)} ${cleanMs}ms`,
);
assert(score(cleanQ) <= score(seedQ), 'cleanup does not worsen seed');
assert(cleanQ.bondRatio < 3.5, 'cleanup bond ratio sane');

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nStage 1 minimize2D OK.');
