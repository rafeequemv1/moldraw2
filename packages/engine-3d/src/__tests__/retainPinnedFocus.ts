/**
 * Canvas click / new disconnected molecule must not steal the 3D focus pin.
 */
import type { Molecule } from '@moldraw/domain';
import { perspectiveZFingerprint } from '@moldraw/core';
import { pickFocusFragment, retainPinnedFocus } from '../focusFragment';

const ethanol: Molecule = {
  atoms: [
    { id: 'c1', element: 'C', x: 0, y: 0, charge: 0 },
    { id: 'c2', element: 'C', x: 40, y: 0, charge: 0 },
    { id: 'o1', element: 'O', x: 80, y: 0, charge: 0 },
  ],
  bonds: [
    { id: 'b1', fromAtomId: 'c1', toAtomId: 'c2', order: 1 },
    { id: 'b2', fromAtomId: 'c2', toAtomId: 'o1', order: 1 },
  ],
};

const water: Molecule = {
  atoms: [
    { id: 'ow', element: 'O', x: 200, y: 40, charge: 0 },
    { id: 'hw1', element: 'H', x: 220, y: 20, charge: 0 },
    { id: 'hw2', element: 'H', x: 220, y: 60, charge: 0 },
  ],
  bonds: [
    { id: 'bw1', fromAtomId: 'ow', toAtomId: 'hw1', order: 1 },
    { id: 'bw2', fromAtomId: 'ow', toAtomId: 'hw2', order: 1 },
  ],
};

const both: Molecule = {
  atoms: [...ethanol.atoms, ...water.atoms],
  bonds: [...ethanol.bonds, ...water.bonds],
};

const ids = (mol: Molecule) => new Set(mol.atoms.map(a => a.id));

const pinEthanol = retainPinnedFocus(
  ethanol,
  pickFocusFragment(ethanol, ['c1']),
  null,
).pin;

if (!pinEthanol || pinEthanol.length !== 3) {
  throw new Error('first molecule should pin all atoms');
}

const afterDeselect = retainPinnedFocus(
  both,
  pickFocusFragment(both, []),
  pinEthanol,
  ids(ethanol),
);
if (afterDeselect.focus.reason !== 'pinned') {
  throw new Error(`empty click stole 3D focus: ${afterDeselect.focus.reason}`);
}
if (!afterDeselect.focus.atomIds.includes('c1') || afterDeselect.focus.atomIds.includes('ow')) {
  throw new Error('empty click should keep the ethanol pin');
}

const afterDrawWater = retainPinnedFocus(
  both,
  pickFocusFragment(both, ['ow', 'hw1', 'hw2']),
  pinEthanol,
  ids(ethanol),
);
if (afterDrawWater.focus.atomIds.includes('ow')) {
  throw new Error('drawing a new molecule stole the 3D pin');
}
if (!afterDrawWater.focus.atomIds.includes('c1')) {
  throw new Error('drawing a new molecule should keep the ethanol pin');
}

const afterClickWater = retainPinnedFocus(
  both,
  pickFocusFragment(both, ['ow']),
  pinEthanol,
  ids(both),
);
if (!afterClickWater.focus.atomIds.includes('ow')) {
  throw new Error('clicking an existing fragment should switch 3D focus');
}

const ethanolWithForeignPose: Molecule = {
  ...ethanol,
  perspective3D: {
    positions: {
      c1: { x: 0, y: 0, z: 0.4 },
      ow: { x: 200, y: 40, z: 1.2 },
    },
  },
};
const ethanolLocalPose: Molecule = {
  ...ethanol,
  perspective3D: {
    positions: {
      c1: { x: 0, y: 0, z: 0.4 },
    },
  },
};
if (
  perspectiveZFingerprint(ethanolWithForeignPose) !==
  perspectiveZFingerprint(ethanolLocalPose)
) {
  throw new Error('z fingerprint must ignore pose of other fragments');
}

console.log('retainPinnedFocus: ok');
