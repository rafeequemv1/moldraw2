/**
 * 2D translate / rotate must not change the 3D rebuild fingerprint.
 */
import type { Molecule } from '@moldraw/domain';
import { perspectiveZFingerprint } from '@moldraw/core';
import { moveAtoms, rotateAtoms } from '../../../core/src/molecule/mutations';
import { structureKeyFor3D } from '../structureKey3D';

const mol: Molecule = {
  atoms: [
    { id: 'a', element: 'C', x: 0, y: 0, charge: 0 },
    { id: 'b', element: 'C', x: 40, y: 0, charge: 0 },
    { id: 'c', element: 'O', x: 80, y: 20, charge: 0 },
  ],
  bonds: [
    { id: 'ab', fromAtomId: 'a', toAtomId: 'b', order: 1 },
    { id: 'bc', fromAtomId: 'b', toAtomId: 'c', order: 2 },
  ],
  perspective3D: {
    positions: {
      a: { x: 0, y: 0, z: 0.4 },
      b: { x: 40, y: 0, z: -0.2 },
      c: { x: 80, y: 20, z: 1.1 },
    },
  },
};

const chemKey = (m: Molecule) =>
  `${structureKeyFor3D(m)}::${perspectiveZFingerprint(m)}`;

const moved = moveAtoms(mol, ['a', 'b', 'c'], 25, -18);
const rotated = rotateAtoms(mol, ['a', 'b', 'c'], 40, 0, 0.35);

const before = chemKey(mol);
if (chemKey(moved) !== before) {
  throw new Error(`moveAtoms changed 3D sync key:\n${before}\n${chemKey(moved)}`);
}
if (chemKey(rotated) !== before) {
  throw new Error(`rotateAtoms changed 3D sync key:\n${before}\n${chemKey(rotated)}`);
}
if (moved.atoms[0]!.x === mol.atoms[0]!.x) {
  throw new Error('moveAtoms did not translate 2D coords');
}

console.log('layoutDoesNotInvalidate3D: ok');
