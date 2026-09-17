/**
 * Atom-label keyboard casing + valency after relabel.
 * Run: npx tsx --tsconfig tsconfig.app.json packages/domain/src/__tests__/atomAliasKeyboardSmoke.ts
 */
import type { Molecule } from '../types';
import {
  autocapitalizeAtomAliasDraft,
  canonicalElementSymbol,
  matchLeadingElement,
  validateAtomAliasForMolecule,
} from '../aliases';
import {
  getEffectiveValencyForImplicitHydrogen,
  getMaxValencyForElement,
} from '../valency';

const fail = (msg: string): never => {
  throw new Error(msg);
};
const assert = (cond: unknown, msg: string): void => {
  if (!cond) fail(msg);
};
const eq = (got: unknown, want: unknown, msg: string): void => {
  if (got !== want) fail(`${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

eq(autocapitalizeAtomAliasDraft('na'), 'Na', 'na → Na');
eq(autocapitalizeAtomAliasDraft('Na'), 'Na', 'Na stays Na');
eq(autocapitalizeAtomAliasDraft('NA'), 'Na', 'NA → Na');
eq(autocapitalizeAtomAliasDraft('he'), 'He', 'he → He');
eq(autocapitalizeAtomAliasDraft('He'), 'He', 'He stays He');
eq(autocapitalizeAtomAliasDraft('cl'), 'Cl', 'cl → Cl');
eq(autocapitalizeAtomAliasDraft('fe'), 'Fe', 'fe → Fe');
eq(autocapitalizeAtomAliasDraft('si'), 'Si', 'si → Si');
eq(autocapitalizeAtomAliasDraft('al'), 'Al', 'al → Al');
eq(autocapitalizeAtomAliasDraft('ch3oh'), 'CH3OH', 'organic formula still uppercases');
eq(autocapitalizeAtomAliasDraft('me'), 'Me', 'me → Me');
eq(autocapitalizeAtomAliasDraft('tbu'), 'tBu', 'tbu → tBu');
eq(autocapitalizeAtomAliasDraft('CO'), 'CO', 'CO stays carbonyl, not Co');
eq(autocapitalizeAtomAliasDraft('Co'), 'Co', 'Co is cobalt');
eq(autocapitalizeAtomAliasDraft('NH2'), 'NH2', 'NH2 stays amine');
eq(autocapitalizeAtomAliasDraft('BH4'), 'BH4', 'BH4 stays boron hydride');
eq(autocapitalizeAtomAliasDraft('bh4'), 'BH4', 'bh4 → BH4');
eq(autocapitalizeAtomAliasDraft('BH4-'), 'BH4-', 'BH4- keeps charge');
eq(autocapitalizeAtomAliasDraft('nabh4'), 'NaBH4', 'nabh4 → NaBH4');
eq(autocapitalizeAtomAliasDraft('NaBH4'), 'NaBH4', 'NaBH4 stays salt formula');
eq(autocapitalizeAtomAliasDraft('naBH4'), 'NaBH4', 'naBH4 → NaBH4');
eq(autocapitalizeAtomAliasDraft('n'), 'N', 'single n → N');
eq(autocapitalizeAtomAliasDraft('Na+'), 'Na+', 'Na+ keeps charge');
eq(autocapitalizeAtomAliasDraft('coona'), 'COONa', 'coona → COONa');
eq(autocapitalizeAtomAliasDraft('COONa'), 'COONa', 'COONa stays mixed Na');
eq(autocapitalizeAtomAliasDraft('COONA'), 'COONa', 'COONA → COONa');
eq(autocapitalizeAtomAliasDraft('cooNa'), 'COONa', 'cooNa → COONa');
eq(autocapitalizeAtomAliasDraft('CO2Na'), 'CO2Na', 'CO2Na stays');
eq(autocapitalizeAtomAliasDraft('CO2NA'), 'CO2Na', 'CO2NA → CO2Na');
eq(autocapitalizeAtomAliasDraft('co2na'), 'CO2Na', 'co2na → CO2Na');

eq(canonicalElementSymbol('na'), 'Na', 'canonical na');
eq(canonicalElementSymbol('HE'), 'He', 'canonical HE');
eq(matchLeadingElement('Na')?.element, 'Na', 'match Na');
eq(matchLeadingElement('HE')?.element, 'He', 'match HE');
eq(matchLeadingElement('BH4')?.element, 'B', 'BH4 is boron, not bohrium');
eq(matchLeadingElement('NH2')?.element, 'N', 'NH2 is nitrogen, not nihonium');

assert(getEffectiveValencyForImplicitHydrogen('Na', 0) === 0, 'Na implicit H is 0 (not carbon 4)');
assert(getEffectiveValencyForImplicitHydrogen('He', 0) === 0, 'He implicit H is 0');
assert(getMaxValencyForElement('He', 0) === 0, 'He cannot take bonds');
assert(getMaxValencyForElement('Na', 0) === 12, 'Na may keep a ligand bond');
assert(getMaxValencyForElement('B', -1) === 4, 'B− drawing max 4');
assert(getEffectiveValencyForImplicitHydrogen('B', -1) === 4, 'B− implicit BH4');

const isolated: Molecule = {
  atoms: [{ id: 'a', element: 'C', x: 0, y: 0, charge: 0 }],
  bonds: [],
};
for (const [typed, el] of [
  ['Na', 'Na'],
  ['na', 'Na'],
  ['He', 'He'],
  ['he', 'He'],
  ['Cl', 'Cl'],
  ['cl', 'Cl'],
  ['Fe', 'Fe'],
] as const) {
  const v = validateAtomAliasForMolecule(isolated, 'a', typed);
  if (!v.ok) fail(`${typed} should validate: ${v.reason}`);
  eq(v.element, el, `${typed} element`);
}

const bonded: Molecule = {
  atoms: [
    { id: 'c0', element: 'C', x: 0, y: 0, charge: 0 },
    { id: 'a', element: 'C', x: 40, y: 0, charge: 0 },
  ],
  bonds: [{ id: 'b', fromAtomId: 'c0', toAtomId: 'a', order: 1 }],
};
const naBonded = validateAtomAliasForMolecule(bonded, 'a', 'Na');
if (!naBonded.ok) fail(`bonded C → Na should be allowed: ${naBonded.reason}`);
eq(naBonded.element, 'Na', 'bonded relabel Na');

const heBonded = validateAtomAliasForMolecule(bonded, 'a', 'He');
if (!heBonded.ok) fail(`bonded C → He should apply as a label: ${heBonded.reason}`);
eq(heBonded.element, 'C', 'bonded He stays on carbon');
eq(heBonded.body, 'He', 'bonded He is a display alias');

const bMinus: Molecule = {
  atoms: [{ id: 'b', element: 'B', x: 0, y: 0, charge: -1 }],
  bonds: [],
};
const bh4 = validateAtomAliasForMolecule(bMinus, 'b', 'BH4');
if (!bh4.ok) fail(`BH4- should validate: ${bh4.reason}`);
eq(bh4.element, 'B', 'BH4 element is B');
eq(bh4.charge, -1, 'BH4 applies charge −1');
eq(bh4.body, 'B', 'BH4 does not keep an alias string');

for (const typed of ['BH4', 'bh4', 'BH4-'] as const) {
  const v = validateAtomAliasForMolecule(isolated, 'a', typed);
  if (!v.ok) fail(`${typed} on C should validate: ${v.reason}`);
  eq(v.element, 'B', `${typed} element is B`);
  eq(v.charge, -1, `${typed} charge is −1`);
  eq(v.body, 'B', `${typed} does not leave a carbon alias`);
  assert(!v.nearbyIon, `${typed} is a single ion`);
}

for (const typed of ['NaBH4', 'nabh4', 'naBH4'] as const) {
  const v = validateAtomAliasForMolecule(isolated, 'a', typed);
  if (!v.ok) fail(`${typed} should validate: ${v.reason}`);
  eq(v.element, 'C', `${typed} stays on carbon`);
  eq(v.body.toUpperCase(), 'NABH4', `${typed} keeps condensed alias`);
  assert(!v.nearbyIon, `${typed} does not place a free Na⁺`);
}

for (const typed of ['COONa', 'cooNa', 'coona', 'CO2Na', 'CO2NA'] as const) {
  const v = validateAtomAliasForMolecule(isolated, 'a', typed);
  if (!v.ok) fail(`${typed} should validate: ${v.reason}`);
  eq(v.element, 'C', `${typed} stays on carbon`);
  eq(v.body.toUpperCase(), typed.toUpperCase(), `${typed} keeps condensed alias`);
  assert(!v.nearbyIon, `${typed} does not place a free Na⁺`);
}

const cooNaBonded = validateAtomAliasForMolecule(bonded, 'a', 'COONa');
if (!cooNaBonded.ok) fail(`bonded C → COONa should be allowed: ${cooNaBonded.reason}`);
eq(cooNaBonded.body, 'COONa', 'bonded COONa is an alias');
assert(!cooNaBonded.nearbyIon, 'bonded COONa does not expand');

const ch3oh = validateAtomAliasForMolecule(isolated, 'a', 'ch3oh');
if (!ch3oh.ok) fail(`ch3oh should still validate: ${ch3oh.reason}`);
eq(ch3oh.element, 'C', 'ch3oh stays on carbon');
eq(ch3oh.body.toUpperCase(), 'CH3OH', 'ch3oh body is the organic formula');

const me = validateAtomAliasForMolecule(isolated, 'a', 'me');
if (!me.ok) fail(`me should still validate: ${me.reason}`);
eq(me.body.toUpperCase(), 'ME', 'me stays Me abbreviation');

const junk = validateAtomAliasForMolecule(isolated, 'a', 'xyz');
if (!junk.ok) fail(`unknown alias should be kept, got ${junk.reason}`);
eq(junk.element, 'C', 'unknown alias stays on C');

const cPlus: Molecule = {
  atoms: [{ id: 'a', element: 'C', x: 0, y: 0, charge: 1 }],
  bonds: [],
};
for (const typed of ['CH3OH', 'H2SO4', 'COOH', '*', 'Δ', 'C+', 'NaBH4'] as const) {
  const v = validateAtomAliasForMolecule(cPlus, 'a', typed);
  if (!v.ok) fail(`${typed} on C+ should apply as a label: ${v.reason}`);
}

const chargedEl: Molecule = {
  atoms: [{ id: 'a', element: 'C+', x: 0, y: 0, charge: 1 }],
  bonds: [],
};
const chargedElLabel = validateAtomAliasForMolecule(chargedEl, 'a', 'CH3OH');
if (!chargedElLabel.ok) fail(`CH3OH on element C+ should apply: ${chargedElLabel.reason}`);
eq(chargedElLabel.body.toUpperCase(), 'CH3OH', 'CH3OH body kept on C+');

console.log('atomAliasKeyboardSmoke OK');
