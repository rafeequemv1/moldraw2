/**
 * Drop-to-attach: a dragged atom or group that lands on a stationary atom
 * joins (merge) instead of stacking.
 * Run: npx tsx --tsconfig tsconfig.app.json packages/canvas/src/geometry/__tests__/dragAttachSmoke.ts
 */
import type { Molecule } from '@moldraw/domain';
import { mergeDraggedAtomInto } from '../../../../core/src/molecule/mutations';
import { dragAttachRadius, dragDeltaToLandOnAtom, findDragAttachPair } from '../dragAttach';

const fail = (msg: string): never => {
  throw new Error(msg);
};
const ok = (cond: unknown, msg: string): void => {
  if (!cond) fail(msg);
};

const mol: Molecule = {
  atoms: [
    { id: 'a', element: 'C', x: 0, y: 0, charge: 0 },
    { id: 'b', element: 'C', x: 40, y: 0, charge: 0 },
    { id: 'c', element: 'O', x: 200, y: 0, charge: 0 },
    { id: 'd', element: 'C', x: 240, y: 0, charge: 0 },
  ],
  bonds: [
    { id: 'ab', fromAtomId: 'a', toAtomId: 'b', order: 1 },
    { id: 'cd', fromAtomId: 'c', toAtomId: 'd', order: 1 },
  ],
};

const radius = dragAttachRadius(40);
ok(radius >= 12 && radius <= 20, `radius ${radius}`);

ok(
  findDragAttachPair(mol, ['c', 'd'], -10, 0, radius) === null,
  'a short drag must not attach',
);

const pair = findDragAttachPair(mol, ['c', 'd'], -200, 0, radius);
ok(pair?.sourceId === 'c' && pair.targetId === 'a', `pair ${JSON.stringify(pair)}`);

const land = dragDeltaToLandOnAtom(mol, 'c', 'a');
ok(land?.dx === -200 && land.dy === 0, 'land delta');

const moved: Molecule = {
  ...mol,
  atoms: mol.atoms.map(atom =>
    atom.id === 'c' || atom.id === 'd' ? { ...atom, x: atom.x + (land?.dx ?? 0), y: atom.y } : atom,
  ),
};
const joined = mergeDraggedAtomInto(moved, 'c', 'a');
ok(joined.atoms.length === 3 && !joined.atoms.some(atom => atom.id === 'c'), 'source atom removed');
ok(
  joined.bonds.some(
    b =>
      (b.fromAtomId === 'a' && b.toAtomId === 'd') ||
      (b.fromAtomId === 'd' && b.toAtomId === 'a'),
  ),
  'group bond retargets onto the stationary atom',
);
ok(
  joined.bonds.some(
    b =>
      (b.fromAtomId === 'a' && b.toAtomId === 'b') ||
      (b.fromAtomId === 'b' && b.toAtomId === 'a'),
  ),
  'existing bond on the target is kept',
);
ok(joined.bonds.length === 2, `expected 2 bonds, got ${joined.bonds.length}`);

const stacked = mergeDraggedAtomInto(
  {
    atoms: [
      { id: 'a', element: 'C', x: 0, y: 0, charge: 0 },
      { id: 'c', element: 'C', x: 0, y: 0, charge: 0 },
    ],
    bonds: [{ id: 'ac', fromAtomId: 'a', toAtomId: 'c', order: 1 }],
  },
  'c',
  'a',
);
ok(stacked.atoms.length === 1 && stacked.bonds.length === 0, 'self-bond from the join is dropped');

console.log('dragAttachSmoke: ok');
