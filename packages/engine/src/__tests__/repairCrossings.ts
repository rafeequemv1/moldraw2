/**
 * Stage C crossing repair — paclitaxel crossings must fall; aspirin stays clean.
 * Run: npx tsx src/engine/__tests__/repairCrossings.ts
 */
import { nativeEngine as engine } from '../nativeEngine';
import { layoutComponentSkeleton } from '../layout/skeletonLayout';
import { buildGraph, connectedComponents } from '../graph';
import { perceiveRings } from '../chem/rings';
import { minimize2D } from '../layout/minimize2D';
import { repairCrossings } from '../layout/repairCrossings';
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

console.log('=== Stage C repairCrossings ===\n');

const aspirin = engine.generate2D(engine.parseSmiles('CC(=O)Oc1ccccc1C(=O)O'), BOND);
const aspRep = repairCrossings(aspirin, { bondLengthPx: BOND });
assert(isAcceptableLayout(aspRep), 'aspirin acceptable after repair');
const aspQ = measureLayoutQuality(aspRep);
assert(aspQ.overlaps === 0 && aspQ.crossings === 0, 'aspirin zero overlaps/crossings');

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

const t0 = Date.now();
const minimized = minimize2D(seed, { bondLengthPx: BOND, onlyIfNeeded: false });
const minQ = measureLayoutQuality(minimized);
console.log(
  `minimize: ov=${minQ.overlaps} x=${minQ.crossings} ratio=${minQ.bondRatio.toFixed(2)} score=${score(minQ).toFixed(1)}`,
);

const t1 = Date.now();
const repaired = repairCrossings(minimized, { bondLengthPx: BOND });
const repairMs = Date.now() - t1;
const repQ = measureLayoutQuality(repaired);
console.log(
  `repair: ov=${repQ.overlaps} x=${repQ.crossings} ratio=${repQ.bondRatio.toFixed(2)} score=${score(repQ).toFixed(1)} ${repairMs}ms`,
);

assert(repairMs < 30000, `repair finishes under 30s (got ${repairMs}ms)`);
assert(
  repQ.crossings < minQ.crossings || score(repQ) < score(minQ) - 2,
  `repair improves crossings or score (x ${minQ.crossings}→${repQ.crossings}, score ${score(minQ).toFixed(1)}→${score(repQ).toFixed(1)})`,
);
assert(repQ.overlaps <= Math.max(minQ.overlaps, 2), `overlaps stay low (got ${repQ.overlaps})`);
assert(repQ.crossings <= 3, `paclitaxel crossings ≤3 after repair (got ${repQ.crossings})`);
assert(repQ.overlaps === 0, `paclitaxel overlaps = 0 after repair (got ${repQ.overlaps})`);

const t2 = Date.now();
const cleaned = cleanupStructure(seed, { bondLengthPx: BOND, preserveOrientation: true });
const cleanMs = Date.now() - t2;
const cleanQ = measureLayoutQuality(cleaned);
console.log(
  `cleanup: ov=${cleanQ.overlaps} x=${cleanQ.crossings} ratio=${cleanQ.bondRatio.toFixed(2)} score=${score(cleanQ).toFixed(1)} ${cleanMs}ms`,
);
assert(cleanQ.crossings <= 3, `cleanup crossings ≤3 (got ${cleanQ.crossings})`);
assert(cleanQ.overlaps === 0, `cleanup overlaps = 0 (got ${cleanQ.overlaps})`);
assert(Date.now() - t0 < 60000, 'full Stage C path under 60s');

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nStage C repairCrossings OK.');
