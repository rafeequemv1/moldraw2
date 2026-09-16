/**
 * Aromatize / dearomatize is 2D depiction only — must not change the 3D rebuild fingerprint.
 *
 * Run: npx tsx packages/engine-3d/src/__tests__/aromatizeDoesNotInvalidate3D.ts
 */
import type { Molecule } from '@moldraw/domain';
import { moleculeToMolblock } from '../../../core/src/io/molblock';
import { mergeBondOrdersFromMolblock } from '../../../core/src/molecule/mutations';
import { aromatizeMolecule } from '../../../engine/src/chem/aromatizeNative';
import { dirtyAtomIdsFromEdit } from '../refineRegion';
import { structureKeyFor3D } from '../structureKey3D';

/** Kekulé benzene (explicit 1-2-1-2-1-2). */
const kekuleBenzene: Molecule = {
  atoms: [
    { id: 'c1', element: 'C', x: 0, y: 0, charge: 0 },
    { id: 'c2', element: 'C', x: 40, y: 0, charge: 0 },
    { id: 'c3', element: 'C', x: 60, y: 35, charge: 0 },
    { id: 'c4', element: 'C', x: 40, y: 70, charge: 0 },
    { id: 'c5', element: 'C', x: 0, y: 70, charge: 0 },
    { id: 'c6', element: 'C', x: -20, y: 35, charge: 0 },
  ],
  bonds: [
    { id: 'b12', fromAtomId: 'c1', toAtomId: 'c2', order: 2 },
    { id: 'b23', fromAtomId: 'c2', toAtomId: 'c3', order: 1 },
    { id: 'b34', fromAtomId: 'c3', toAtomId: 'c4', order: 2 },
    { id: 'b45', fromAtomId: 'c4', toAtomId: 'c5', order: 1 },
    { id: 'b56', fromAtomId: 'c5', toAtomId: 'c6', order: 2 },
    { id: 'b61', fromAtomId: 'c6', toAtomId: 'c1', order: 1 },
  ],
};

/** Same as the editor command: aromatize native mol, merge bond flags onto the live graph. */
const applyAromatize = (mol: Molecule, mode: 'aromatize' | 'dearomatize'): Molecule => {
  const next = aromatizeMolecule(mol, mode);
  return mergeBondOrdersFromMolblock(mol, moleculeToMolblock(next));
};

const ethene: Molecule = {
  atoms: [
    { id: 'a', element: 'C', x: 0, y: 0, charge: 0 },
    { id: 'b', element: 'C', x: 40, y: 0, charge: 0 },
  ],
  bonds: [{ id: 'ab', fromAtomId: 'a', toAtomId: 'b', order: 1 }],
};

const etheneDouble: Molecule = {
  ...ethene,
  bonds: [{ id: 'ab', fromAtomId: 'a', toAtomId: 'b', order: 2 }],
};

const before = structureKeyFor3D(kekuleBenzene);
const arom = applyAromatize(kekuleBenzene, 'aromatize');
const dear = applyAromatize(arom, 'dearomatize');

if (!arom.bonds.every(b => b.aromatic)) {
  throw new Error('aromatize did not set aromatic flags on 2D bonds');
}
if (dear.bonds.some(b => b.aromatic)) {
  throw new Error('dearomatize did not clear aromatic flags');
}
if (structureKeyFor3D(arom) !== before) {
  throw new Error(
    `aromatize changed 3D sync key:\n${before}\n${structureKeyFor3D(arom)}`,
  );
}
if (structureKeyFor3D(dear) !== before) {
  throw new Error(
    `dearomatize changed 3D sync key:\n${before}\n${structureKeyFor3D(dear)}`,
  );
}

const aromEdit = dirtyAtomIdsFromEdit(kekuleBenzene, arom, Number.POSITIVE_INFINITY);
if (aromEdit.topologyChanged) {
  throw new Error('aromatize reported topologyChanged for 3D region refine');
}
const dearEdit = dirtyAtomIdsFromEdit(arom, dear, Number.POSITIVE_INFINITY);
if (dearEdit.topologyChanged) {
  throw new Error('dearomatize reported topologyChanged for 3D region refine');
}

if (structureKeyFor3D(ethene) === structureKeyFor3D(etheneDouble)) {
  throw new Error('real single→double bond edit must still invalidate 3D');
}
const realEdit = dirtyAtomIdsFromEdit(ethene, etheneDouble, Number.POSITIVE_INFINITY);
if (!realEdit.topologyChanged) {
  throw new Error('real bond-order edit must set topologyChanged');
}

console.log('aromatizeDoesNotInvalidate3D: ok');
