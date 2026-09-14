/**
 * 3D update path routing: local edits → region; import → progressive (all sizes).
 * Run: npx tsx src/engine/__tests__/choose3DUpdatePath.ts
 */
import {
  choose3DUpdatePath,
  isOptimized3DSource,
} from '@moldraw/engine-3d/choose3DUpdatePath';

let failed = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('OK:  ', msg);
  }
};

console.log('=== choose3DUpdatePath ===\n');

assert(!isOptimized3DSource('preview-flat-seed'), 'flat seed is not optimized');
assert(!isOptimized3DSource('preview-connectivity'), 'connectivity preview not optimized');
assert(isOptimized3DSource('native-3d-progressive'), 'progressive is optimized');
assert(isOptimized3DSource('native-3d-region'), 'region is optimized');
assert(isOptimized3DSource('native-3d'), 'native-3d is optimized');

const importPath = choose3DUpdatePath({
  heavyCount: 62,
  heavyDelta: 62,
  majorChange: true,
  dirtyAtomIds: Array.from({ length: 62 }, (_, i) => `a${i}`),
  hasOptimized3D: false,
});
assert(importPath.kind === 'progressive', `paclitaxel import → progressive (got ${importPath.kind})`);

const cholesterol = choose3DUpdatePath({
  heavyCount: 28,
  heavyDelta: 28,
  majorChange: true,
  dirtyAtomIds: Array.from({ length: 28 }, (_, i) => `a${i}`),
  hasOptimized3D: false,
});
assert(cholesterol.kind === 'progressive', `cholesterol import → progressive (got ${cholesterol.kind})`);

const tiny = choose3DUpdatePath({
  heavyCount: 8,
  heavyDelta: 8,
  majorChange: true,
  dirtyAtomIds: Array.from({ length: 8 }, (_, i) => `a${i}`),
  hasOptimized3D: false,
});
assert(tiny.kind === 'progressive', `small import → progressive (got ${tiny.kind})`);

const localEdit = choose3DUpdatePath({
  heavyCount: 62,
  heavyDelta: 0,
  majorChange: false,
  dirtyAtomIds: ['a1', 'a2'],
  hasOptimized3D: true,
});
assert(localEdit.kind === 'region', `coordinate-only style edit → region (got ${localEdit.kind})`);
if (localEdit.kind === 'region') {
  assert(localEdit.instant === true, 'tiny edit is instant main-thread');
}

const cleanupMoved = choose3DUpdatePath({
  heavyCount: 62,
  heavyDelta: 0,
  majorChange: true,
  dirtyAtomIds: Array.from({ length: 30 }, (_, i) => `a${i}`),
  hasOptimized3D: true,
});
assert(
  cleanupMoved.kind === 'region',
  `cleanup-moved atoms → region not progressive (got ${cleanupMoved.kind})`,
);

const bondTweak = choose3DUpdatePath({
  heavyCount: 62,
  heavyDelta: 1,
  majorChange: false,
  topologyChanged: true,
  dirtyAtomIds: ['a1', 'a2', 'a3'],
  hasOptimized3D: true,
});
assert(bondTweak.kind === 'progressive', `bond/stereo chemistry edit → progressive (got ${bondTweak.kind})`);

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nchoose3DUpdatePath OK.');
