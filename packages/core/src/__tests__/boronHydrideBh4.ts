/**
 * BH4− / NaBH4 drawing invariants.
 * Run: npx tsx --tsconfig tsconfig.app.json packages/core/src/__tests__/boronHydrideBh4.ts
 */
import type { Molecule } from '@moldraw/domain';
import {
  canApplyFormalChargeDelta,
  getEffectiveValencyForImplicitHydrogen,
  getMaxValencyForElement,
} from '@moldraw/domain';
import { implicitHForAtom } from '@moldraw/engine';
import { addExplicitHydrogensToAtoms } from '../molecule/addExplicitHydrogen';
import { addAtom, addBondSafe, canAddBond, setAtomCharge } from '../molecule/mutations';
import { getMolecularData } from '../molecule/properties';

const empty: Molecule = { atoms: [], bonds: [] };

const fail = (msg: string): never => {
  throw new Error(msg);
};

const assert = (cond: unknown, msg: string): void => {
  if (!cond) fail(msg);
};

assert(getMaxValencyForElement('B', 0) === 4, 'neutral B drawing max should be 4');
assert(getMaxValencyForElement('B', -1) === 4, 'B− drawing max should be 4 (BH4−)');
assert(getMaxValencyForElement('B', 1) === 2, 'B+ drawing max should be 2');
assert(getEffectiveValencyForImplicitHydrogen('B', 0) === 3, 'neutral B implicit should be BH3');
assert(getEffectiveValencyForImplicitHydrogen('B', -1) === 4, 'B− implicit should be BH4');
assert(getEffectiveValencyForImplicitHydrogen('B', 1) === 2, 'B+ implicit should be 2');
assert(implicitHForAtom('B', -1, 0) === 4, 'engine implicit H for isolated B− should be 4');
assert(implicitHForAtom('B', 0, 0) === 3, 'engine implicit H for isolated B should be 3');

let mol = addAtom(empty, { id: 'b', element: 'B', x: 0, y: 0, charge: 0 });
assert(getMolecularData(mol).empirical.counts.H === 3, 'isolated B formula should be BH3');

mol = setAtomCharge(mol, 'b', -1);
assert(mol.atoms[0]?.charge === -1, 'B should accept charge −1');
assert(getMolecularData(mol).empirical.counts.H === 4, 'isolated B− formula should be BH4');
assert(
  canApplyFormalChargeDelta('B', 0, -1, 0),
  'setting B → B− with no bonds should be allowed',
);

mol = addExplicitHydrogensToAtoms(mol, { atomIds: ['b'], bondLengthPx: 40, maxPerAtom: 4 });
const hAtoms = mol.atoms.filter(a => a.element === 'H');
assert(hAtoms.length === 4, `expected 4 explicit H on B−, got ${hAtoms.length}`);
assert(mol.bonds.length === 4, `expected 4 B–H bonds, got ${mol.bonds.length}`);
assert(
  getMolecularData(mol).empirical.counts.H === 4,
  'explicit BH4− formula should still be BH4',
);

const fifth = addExplicitHydrogensToAtoms(mol, {
  atomIds: ['b'],
  bondLengthPx: 40,
  maxPerAtom: 1,
});
assert(fifth === mol, '5th explicit H on BH4− should be a no-op (no valency flash needed)');

let drawn: Molecule = addAtom(empty, { id: 'b2', element: 'B', x: 0, y: 0, charge: 0 });
for (let i = 0; i < 4; i++) {
  const hid = `h${i}`;
  drawn = addAtom(drawn, { id: hid, element: 'H', x: 40, y: i * 20, charge: 0 });
  assert(
    canAddBond(drawn, { fromAtomId: 'b2', toAtomId: hid, order: 1 }),
    `bond ${i + 1} from B to H should be allowed before charge is set`,
  );
  const next = addBondSafe(drawn, {
    id: `bh${i}`,
    fromAtomId: 'b2',
    toAtomId: hid,
    order: 1,
  });
  assert(next !== drawn, `B–H bond ${i + 1} should apply`);
  drawn = next;
}
assert(drawn.bonds.length === 4, 'neutral B should accept 4 explicit B–H bonds');
const charged = setAtomCharge(drawn, 'b2', -1);
assert(charged.atoms.find(a => a.id === 'b2')?.charge === -1, 'BH4 then B− should apply');
assert(
  canApplyFormalChargeDelta('B', 0, -1, 4),
  'charge −1 on tetrahedral B should be allowed',
);

const extraH = addAtom(drawn, { id: 'h4', element: 'H', x: -40, y: 0, charge: 0 });
assert(
  !canAddBond(extraH, { fromAtomId: 'b2', toAtomId: 'h4', order: 1 }),
  '5th B–H bond should be refused',
);

let clickPath: Molecule = addAtom(empty, { id: 'b3', element: 'B', x: 0, y: 0, charge: 0 });
for (let i = 0; i < 4; i++) {
  const before = clickPath;
  clickPath = addExplicitHydrogensToAtoms(clickPath, {
    atomIds: ['b3'],
    bondLengthPx: 40,
    maxPerAtom: 1,
  });
  assert(clickPath !== before, `click-add H #${i + 1} on B should add an atom`);
}
assert(clickPath.atoms.filter(a => a.element === 'H').length === 4, 'four click-adds should yield BH4');

let salt = addAtom(charged, { id: 'na', element: 'Na', x: 80, y: 0, charge: 0 });
salt = setAtomCharge(salt, 'na', 1);
assert(salt.atoms.find(a => a.id === 'na')?.charge === 1, 'Na+ counterion should apply');
const data = getMolecularData(salt);
assert(data.empirical.counts.Na === 1, 'formula should include Na');
assert(data.empirical.counts.B === 1, 'formula should include B');
assert(data.empirical.counts.H === 4, `NaBH4 formula H count should be 4, got ${data.empirical.counts.H}`);
const netCharge = salt.atoms.reduce((s, a) => s + (a.charge || 0), 0);
assert(netCharge === 0, `NaBH4 net charge should be 0, got ${netCharge}`);

console.log('boronHydrideBh4 OK');
