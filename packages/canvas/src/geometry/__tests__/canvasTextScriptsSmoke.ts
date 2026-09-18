/**
 * Per-character super/sub ranges: toggle selected span only; empty is a no-op;
 * typing remaps indices.
 * Run: npx tsx --tsconfig tsconfig.app.json packages/canvas/src/geometry/__tests__/canvasTextScriptsSmoke.ts
 */
import {
  inferTextEdit,
  remapTextScriptRanges,
  scriptAtIndex,
  selectionHasUniformScript,
  toggleTextScriptRange,
} from '../canvasTextScripts';

const fail = (msg: string): never => {
  throw new Error(msg);
};
const ok = (cond: unknown, msg: string): void => {
  if (!cond) fail(msg);
};
const eq = (got: unknown, want: unknown, msg: string): void => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail(`${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
};

// Empty caret — do not style the whole box.
eq(toggleTextScriptRange([], 3, 3, 'sub', 6), [], 'empty selection is a no-op');
eq(toggleTextScriptRange([], 2, 2, 'super', 6), [], 'collapsed caret is a no-op');
eq(
  toggleTextScriptRange([], 4, 2, 'super', 6),
  [{ start: 2, end: 4, script: 'super' }],
  'reversed drag still applies [min, max)',
);

const h2o = 'H2O';
const sub2 = toggleTextScriptRange([], 1, 2, 'sub', h2o.length);
eq(sub2, [{ start: 1, end: 2, script: 'sub' }], 'H2O: only the 2 is subscript');
ok(scriptAtIndex(sub2, 0) === 'normal', 'H stays normal');
ok(scriptAtIndex(sub2, 1) === 'sub', '2 is sub');
ok(scriptAtIndex(sub2, 2) === 'normal', 'O stays normal');
ok(selectionHasUniformScript(sub2, 1, 2, 'sub'), 'selection reports sub');
ok(!selectionHasUniformScript(sub2, 0, 2, 'sub'), 'H2 is not uniform sub');

const toggledOff = toggleTextScriptRange(sub2, 1, 2, 'sub', h2o.length);
eq(toggledOff, [], 'second click clears the same span');

const flipped = toggleTextScriptRange(sub2, 1, 2, 'super', h2o.length);
eq(flipped, [{ start: 1, end: 2, script: 'super' }], 'super replaces sub on the same span');

const so42 = toggleTextScriptRange([], 2, 4, 'super', 'SO42-'.length);
const so42sub = toggleTextScriptRange(so42, 2, 3, 'sub', 'SO42-'.length);
eq(
  so42sub,
  [
    { start: 2, end: 3, script: 'sub' },
    { start: 3, end: 4, script: 'super' },
  ],
  'overlapping toggle punches then applies',
);

// Typing after a scripted span remaps later indices (H₂O → H₂O2).
const afterInsert = remapTextScriptRanges(sub2, 3, 3, 1, 4);
eq(afterInsert, [{ start: 1, end: 2, script: 'sub' }], 'insert after span keeps range');

const afterPrefix = remapTextScriptRanges(sub2, 0, 0, 1, 4);
eq(afterPrefix, [{ start: 2, end: 3, script: 'sub' }], 'insert before span shifts range');

const expandEnd = remapTextScriptRanges(sub2, 2, 2, 1, 4);
eq(expandEnd, [{ start: 1, end: 3, script: 'sub' }], 'insert at range end expands (left affinity)');

const inferred = inferTextEdit('H2O', 'H2O2', { start: 3, end: 3 });
eq(inferred, { start: 3, end: 3, insertLen: 1 }, 'infer insert at caret');
eq(
  remapTextScriptRanges(sub2, inferred.start, inferred.end, inferred.insertLen, 4),
  [{ start: 1, end: 2, script: 'sub' }],
  'remap via inferred edit',
);

console.log('canvasTextScriptsSmoke: ok');
