/**
 * Selected-arrow AABB must include reagent text and empty “+” chips so the
 * transform box grows when labels are added (and the remaining plus stays inside).
 * Run: npx tsx --tsconfig tsconfig.app.json packages/canvas/src/geometry/__tests__/reactionArrowSelectionAabbSmoke.ts
 */
import type { Molecule, ReactionArrow } from '@moldraw/domain';
import {
  getMarqueeSelectionAabb,
  getMarqueeSelectionTransformLayout,
  isInsideSelectionTransformBox,
  reactionArrowReagentSlotPositions,
} from '../index';

const fail = (msg: string): never => {
  throw new Error(msg);
};
const ok = (cond: unknown, msg: string): void => {
  if (!cond) fail(msg);
};

const shaftArrow = (patch: Partial<ReactionArrow> = {}): ReactionArrow => ({
  id: 'arr1',
  x1: 0,
  y1: 0,
  x2: 120,
  y2: 0,
  kind: 'straight',
  ...patch,
});

const molWith = (arrow: ReactionArrow): Molecule => ({
  atoms: [],
  bonds: [],
  reactionArrows: [arrow],
});

const sel = { atomIds: [] as string[], reactionArrowIds: ['arr1'] };

const empty = shaftArrow();
const emptyBox = getMarqueeSelectionAabb(molWith(empty), sel);
if (!emptyBox) fail('empty arrow should have an AABB');

const withBelow = shaftArrow({ reagentBelow: 'NaOH\nreflux' });
const belowBox = getMarqueeSelectionAabb(molWith(withBelow), sel);
if (!belowBox) fail('arrow with below text should have an AABB');

const belowH = belowBox.maxY - belowBox.minY;
const emptyH = emptyBox.maxY - emptyBox.minY;
ok(belowH > emptyH + 8, 'AABB height must grow when multi-line below text is added');

const abovePlus = reactionArrowReagentSlotPositions(withBelow).above;
ok(
  isInsideSelectionTransformBox(abovePlus.x, abovePlus.y, molWith(withBelow), [], sel, null),
  'remaining plus must stay inside the transform box after adding the other slot',
);

const L = getMarqueeSelectionTransformLayout(molWith(withBelow), sel, null);
if (!L) fail('transform layout');
ok(abovePlus.y >= L.boxMinY && abovePlus.y <= L.boxMinY + L.boxH, 'plus Y is inside box');
ok(abovePlus.x >= L.boxMinX && abovePlus.x <= L.boxMinX + L.boxW, 'plus X is inside box');

const withAbove = shaftArrow({ reagentAbove: 'H2SO4' });
const belowPlus = reactionArrowReagentSlotPositions(withAbove).below;
ok(
  isInsideSelectionTransformBox(belowPlus.x, belowPlus.y, molWith(withAbove), [], sel, null),
  'opposite plus stays inside the box after adding above text',
);

console.log('reactionArrowSelectionAabbSmoke: ok');
