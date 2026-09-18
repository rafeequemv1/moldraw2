/**
 * Select tool must pick the atom disk (and implicit H / CH₃ label), not the
 * bond shaft, so Delete / drag can target a whole atom without the erase tool.
 * Run: npx tsx --tsconfig tsconfig.app.json packages/canvas/src/geometry/__tests__/selectAtomHitSmoke.ts
 */
import type { Atom, Molecule } from '@moldraw/domain';
import { getSelectionAabb, isInsideSelectionTransformBox } from '../index';
import {
  pickAtomOrBondForBondTool,
  pickAtomOrBondForSelectTool,
} from '../../interaction/hitTest';

const fail = (msg: string): never => {
  throw new Error(msg);
};
const ok = (cond: unknown, msg: string): void => {
  if (!cond) fail(msg);
};

const c1: Atom = { id: 'c1', element: 'C', x: 0, y: 0, charge: 0 };
const c2: Atom = { id: 'c2', element: 'C', x: 45, y: 0, charge: 0 };
const c3: Atom = { id: 'c3', element: 'C', x: 90, y: 0, charge: 0 };
const propane: Molecule = {
  atoms: [c1, c2, c3],
  bonds: [
    { id: 'b1', fromAtomId: 'c1', toAtomId: 'c2', order: 1 },
    { id: 'b2', fromAtomId: 'c2', toAtomId: 'c3', order: 1 },
  ],
};

const atCenter = pickAtomOrBondForSelectTool(propane, { x: 45, y: 0 });
ok(atCenter.atom?.id === 'c2' && !atCenter.bond, 'click on carbon vertex selects the atom');

const nearVertex = pickAtomOrBondForSelectTool(propane, { x: 56, y: 0 });
ok(
  nearVertex.atom?.id === 'c2' && !nearVertex.bond,
  'click 11px along the bond still selects the atom (select radius is 15)',
);

const midBond = pickAtomOrBondForSelectTool(propane, { x: 67.5, y: 0 });
ok(!midBond.atom && midBond.bond?.id === 'b2', 'click mid-shaft still selects the bond');

const bondToolMid = pickAtomOrBondForBondTool(propane, { x: 67.5, y: 0 }, 10, 12);
ok(
  !bondToolMid.atom && bondToolMid.bond?.id === 'b2',
  'bond-order cycling still hits the same interior mid-shaft',
);

const methylBox = getSelectionAabb(propane, ['c1']);
if (!methylBox) fail('terminal methyl must have an AABB');
ok(
  methylBox.maxX - methylBox.minX > 28 || methylBox.maxY - methylBox.minY > 28,
  'CH₃ AABB includes the condensed label / implicit-H extent, not just the point',
);

ok(
  isInsideSelectionTransformBox(45, 0, propane, ['c2'], { atomIds: ['c2'] }, null),
  'atom center is inside the transform box',
);

const midAabb = getSelectionAabb(propane, ['c2']);
if (!midAabb) fail('interior carbon AABB');
ok(
  midAabb.maxY - midAabb.minY >= 40,
  'interior CH₂ implicit-H stubs enlarge the grab box past the atom disk',
);

console.log('selectAtomHitSmoke: ok');
