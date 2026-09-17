/**
 * Atom Label → BH4 expands to B−; NaBH4 stays a condensed alias until show-explicit.
 * Run: npx tsx --tsconfig tsconfig.app.json packages/core/src/__tests__/atomLabelBh4NaBh4Smoke.ts
 */
import type { Molecule } from '@moldraw/domain';
import { implicitHForAtom } from '@moldraw/engine';
import { CMD, runCommand } from '../commands';
import { getMolecularData } from '../molecule/properties';

const fail = (msg: string): never => {
  throw new Error(msg);
};
const assert = (cond: unknown, msg: string): void => {
  if (!cond) fail(msg);
};
const eq = (got: unknown, want: unknown, msg: string): void => {
  if (got !== want) fail(`${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const isolatedC = (): Molecule => ({
  atoms: [{ id: 'a', element: 'C', x: 0, y: 0, charge: 0 }],
  bonds: [],
});

const commit = (prev: Molecule, alias: string): Molecule => {
  const r = runCommand(prev, CMD.CommitAtomAlias, { atomId: 'a', alias });
  if (!r.ok) fail(`commit ${alias} failed: ${r.error.message}`);
  return r.next;
};

for (const typed of ['BH4', 'bh4', 'BH4-'] as const) {
  const mol = commit(isolatedC(), typed);
  eq(mol.atoms.length, 1, `${typed}: one atom`);
  eq(mol.bonds.length, 0, `${typed}: no bonds`);
  const b = mol.atoms[0]!;
  eq(b.element, 'B', `${typed}: element B`);
  eq(b.charge, -1, `${typed}: charge −1`);
  assert(!b.alias?.trim(), `${typed}: no alias string (got ${JSON.stringify(b.alias)})`);
  eq(implicitHForAtom('B', -1, 0), 4, `${typed}: implicit H helper is 4`);
  eq(getMolecularData(mol).empirical.counts.H, 4, `${typed}: formula has 4 H`);
  eq(getMolecularData(mol).empirical.counts.B, 1, `${typed}: formula has B`);
}

for (const typed of ['NaBH4', 'nabh4', 'naBH4'] as const) {
  const mol = commit(isolatedC(), typed);
  eq(mol.atoms.length, 1, `${typed}: stays one atom`);
  eq(mol.bonds.length, 0, `${typed}: no ionic split`);
  const carbon = mol.atoms[0]!;
  eq(carbon.element, 'C', `${typed}: carbon`);
  eq(carbon.alias, 'NaBH4', `${typed}: condensed alias NaBH4`);
  assert(!mol.atoms.some(a => a.element === 'Na'), `${typed}: no Na atom`);
  assert(!mol.atoms.some(a => a.element === 'B'), `${typed}: no B atom`);
}

const organic = commit(isolatedC(), 'ch3oh');
eq(organic.atoms[0]?.element, 'C', 'ch3oh stays carbon');
eq(organic.atoms[0]?.alias?.toUpperCase(), 'CH3OH', 'ch3oh keeps organic alias');

const me = commit(isolatedC(), 'me');
eq(me.atoms[0]?.element, 'C', 'me stays carbon');
eq(me.atoms[0]?.alias?.toUpperCase(), 'ME', 'me stays Me abbreviation');

for (const typed of ['COONa', 'cooNa', 'coona', 'CO2Na', 'CO2NA'] as const) {
  const mol = commit(isolatedC(), typed);
  eq(mol.atoms.length, 1, `${typed}: stays one atom`);
  eq(mol.bonds.length, 0, `${typed}: no explicit carboxylate bonds`);
  const carbon = mol.atoms[0]!;
  eq(carbon.element, 'C', `${typed}: carbon`);
  const want = typed.toUpperCase() === 'CO2NA' ? 'CO2Na' : 'COONa';
  eq(carbon.alias, want, `${typed}: condensed alias ${want}`);
  assert(!mol.atoms.some(a => a.element === 'Na'), `${typed}: no Na atom`);
}

const chain: Molecule = {
  atoms: [
    { id: 'r', element: 'C', x: 0, y: 0, charge: 0 },
    { id: 'a', element: 'C', x: 40, y: 0, charge: 0 },
  ],
  bonds: [{ id: 'b', fromAtomId: 'r', toAtomId: 'a', order: 1 }],
};
const chainSalt = runCommand(chain, CMD.CommitAtomAlias, { atomId: 'a', alias: 'coona' });
if (!chainSalt.ok) fail(`chain COONa failed: ${chainSalt.error.message}`);
eq(chainSalt.next.atoms.length, 2, 'chain COONa does not add atoms');
eq(chainSalt.next.bonds.length, 1, 'chain COONa keeps the existing bond');
eq(chainSalt.next.atoms.find(a => a.id === 'a')?.alias, 'COONa', 'chain COONa alias');

const expanded = runCommand(chainSalt.next, CMD.ExpandAlias, { atomIds: ['a'] });
if (!expanded.ok) fail(`expand COONa failed: ${expanded.error.message}`);
eq(expanded.next.atoms.filter(a => a.element === 'O').length, 2, 'expand COONa adds two O');
eq(expanded.next.atoms.filter(a => a.element === 'Na').length, 1, 'expand COONa places Na⁺');
assert(!expanded.next.atoms.find(a => a.id === 'a')?.alias?.trim(), 'expand COONa clears alias');

const nabh4 = commit(isolatedC(), 'NaBH4');
const expandedSalt = runCommand(nabh4, CMD.ExpandAlias, { atomIds: ['a'] });
if (!expandedSalt.ok) fail(`expand NaBH4 failed: ${expandedSalt.error.message}`);
eq(expandedSalt.next.atoms.find(a => a.id === 'a')?.element, 'B', 'expand NaBH4 turns labeled atom into B');
eq(expandedSalt.next.atoms.find(a => a.id === 'a')?.charge, -1, 'expand NaBH4 B is −1');
eq(expandedSalt.next.atoms.filter(a => a.element === 'Na').length, 1, 'expand NaBH4 places Na⁺');
assert(!expandedSalt.next.atoms.find(a => a.id === 'a')?.alias?.trim(), 'expand NaBH4 clears alias');
const na = expandedSalt.next.atoms.find(a => a.element === 'Na');
assert(na, 'expand NaBH4 has Na');
eq(na!.charge, 1, 'expand NaBH4 Na is +1');
const naBonded = expandedSalt.next.bonds.some(
  b =>
    (b.fromAtomId === 'a' && b.toAtomId === na!.id) ||
    (b.fromAtomId === na!.id && b.toAtomId === 'a'),
);
assert(!naBonded, 'expand NaBH4 Na⁺ is not covalently bonded');

const odd = commit(isolatedC(), '*');
eq(odd.atoms[0]?.alias, '*', 'symbol label applies');
const cPlusMol: Molecule = {
  atoms: [{ id: 'a', element: 'C', x: 0, y: 0, charge: 1 }],
  bonds: [],
};
const cPlusLabel = runCommand(cPlusMol, CMD.CommitAtomAlias, { atomId: 'a', alias: 'CH3OH' });
if (!cPlusLabel.ok) fail(`C+ CH3OH failed: ${cPlusLabel.error.message}`);
eq(cPlusLabel.next.atoms[0]?.alias?.toUpperCase(), 'CH3OH', 'CH3OH on C+ is an alias');

console.log('atomLabelBh4NaBh4Smoke OK');
