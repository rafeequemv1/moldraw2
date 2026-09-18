import { expandAliasesFor3D } from '../expand/aliasesFor3D';
import { resolveAliasToSmiles } from '../expand/aliasToSmiles';
import {
  condensedToSmiles,
  normalizeCondensedKey,
  tokenizeCondensedFormula,
} from '../expand/condensedFormulaExpand';
import type { Molecule } from '@moldraw/domain';
import {
  looksLikeExpandableFormulaLabel,
  splitAliasCharge,
  normalizeAliasLabelCharacters,
} from '@moldraw/domain';

const mol = (alias: string, element = 'C'): Molecule => ({
  atoms: [
    { id: 'c0', element: 'C', x: 0, y: 0, charge: 0 },
    { id: 'a1', element, x: 40, y: 0, charge: 0, alias },
  ],
  bonds: [{ id: 'b1', fromAtomId: 'c0', toAtomId: 'a1', order: 1 }],
});

const count = (m: Molecule, el: string) => m.atoms.filter(a => a.element === el).length;
const mustResolve = (alias: string, element = 'C') => {
  const spec = resolveAliasToSmiles(alias, element);
  if (!spec) throw new Error(`should resolve: ${alias}`);
  return spec;
};

// ── Abbrevs that used to be skipped as “elements” ───────────────────────────
mustResolve('Ph');
mustResolve('Me');
mustResolve('Et');
mustResolve('CN');
mustResolve('i-Pr');
mustResolve('n-Bu');
mustResolve('t-Bu');
mustResolve('TIPS', 'O');
mustResolve('TBS', 'O');
mustResolve('SEM', 'O');
if (normalizeCondensedKey('i-Pr') !== 'IPR') throw new Error('i-Pr normalize');

const ph = expandAliasesFor3D(mol('Ph'));
if (count(ph, 'C') !== 7) throw new Error(`Ph → 7 C, got ${count(ph, 'C')}`);
if (ph.atoms.find(a => a.id === 'a1')?.alias) throw new Error('Ph alias clear');

// ── Condensed → SMILES parser (branches / unsaturation) ─────────────────────
const smilesCases: Array<[string, string]> = [
  ['CH(CH2OH)COOH', 'C(CO)C(=O)O'],
  ['C(CH3)2CH2OH', 'C(C)(C)CO'],
  ['CH=CHCOOH', 'C=CC(=O)O'],
  ['C≡CPh', 'C#Cc1ccccc1'],
  ['C#CPh', 'C#Cc1ccccc1'],
  ['(CH2)3OH', 'CCCO'],
  ['CH2CH2COOMe', 'CCC(=O)OC'],
  // Molecular-formula alkyl / aryl / hetero / branched / perfluoro
  ['C6H13', 'CCCCCC'],
  ['C₂H₅', 'CC'],
  ['C6H5', 'c1ccccc1'],
  ['C6H11', 'C1CCCCC1'], // only bare cyclo we accept
  // Large CnH(2n-1) = oleyl-like mid-chain alkenyl (NOT a macrocycle)
  ['C18H35', 'CCCCCCCCC=CCCCCCCCC'],
  ['c-C18H35', 'C1' + 'C'.repeat(17) + '1'],
  ['C8H15', 'CCCCCCC=C'], // bare → alkenyl (need c-C8H15 for ring)
  ['c-C8H15', 'C1CCCCCCC1'],
  ['n-C6H13', 'CCCCCC'],
  ['i-C3H7', 'C(C)C'],
  ['t-C4H9', 'C(C)(C)(C)'],
  ['c-C6H11', 'C1CCCCC1'],
  ['OC6H13', 'OCCCCCC'],
  ['NHC4H9', 'NCCCC'],
  ['C12H25', 'CCCCCCCCCCCC'],
  ['C4F9', 'C(F)(F)C(F)(F)C(F)(F)C(F)(F)F'],
  ['C3H5', 'CC=C'], // allyl
  // Any n — not a preset list
  ['C7H15', 'CCCCCCC'],
  ['C15H31', 'C'.repeat(15)],
  ['C22H45', 'C'.repeat(22)],
  ['OC9H19', 'O' + 'C'.repeat(9)],
];
for (const [raw, expect] of smilesCases) {
  const got = condensedToSmiles(raw);
  if (!got) throw new Error(`condensedToSmiles failed: ${raw}`);
  if (got.smiles !== expect) {
    throw new Error(`${raw}: expected SMILES ${expect}, got ${got.smiles}`);
  }
}

// ── Topology audit: every n must expand to open chain or intentional ring ──
const ringCount = (smi: string) => {
  const digits = smi.match(/[1-9]/g);
  if (!digits) return 0;
  // Each ring closure digit appears twice in SMILES
  const freq = new Map<string, number>();
  for (const d of digits) freq.set(d, (freq.get(d) ?? 0) + 1);
  let rings = 0;
  for (const c of freq.values()) rings += Math.floor(c / 2);
  return rings;
};
const carbonCount = (smi: string) => (smi.match(/C/gi) ?? []).length;

for (let n = 1; n <= 30; n++) {
  const sat = condensedToSmiles(`C${n}H${2 * n + 1}`);
  if (!sat) throw new Error(`saturated C${n}H${2 * n + 1} failed`);
  if (ringCount(sat.smiles) !== 0) {
    throw new Error(`saturated C${n} must be acyclic, got ${sat.smiles}`);
  }
  if (carbonCount(sat.smiles) !== n) {
    throw new Error(`saturated C${n}: expected ${n} C, got ${carbonCount(sat.smiles)} in ${sat.smiles}`);
  }

  if (n >= 4) {
    const unsat = condensedToSmiles(`C${n}H${2 * n - 1}`);
    if (!unsat) throw new Error(`unsat C${n}H${2 * n - 1} failed`);
    const expectRings = n === 6 ? 1 : 0; // only bare C6H11 → cyclo
    if (ringCount(unsat.smiles) !== expectRings) {
      throw new Error(
        `bare C${n}H${2 * n - 1}: expected ${expectRings} rings, got ${ringCount(unsat.smiles)} (${unsat.smiles})`,
      );
    }
    if (carbonCount(unsat.smiles) !== n) {
      throw new Error(`unsat C${n}: expected ${n} C, got ${carbonCount(unsat.smiles)} in ${unsat.smiles}`);
    }

    const cyc = condensedToSmiles(`c-C${n}H${2 * n - 1}`);
    if (!cyc) throw new Error(`c-C${n}H${2 * n - 1} failed`);
    if (ringCount(cyc.smiles) !== 1) {
      throw new Error(`c-C${n} must be one ring, got ${cyc.smiles}`);
    }
  }
}

// ── Condensed chains (atom counts after graft) ──────────────────────────────
const cases: Array<[string, number, number]> = [
  // alias, expected C count (incl scaffold c0), expected O count
  ['CH2OH', 2, 1],
  ['CH2COOH', 3, 2],
  ['CH2CH2COOMe', 5, 2],
  ['CH2CH2COOH', 4, 2],
  ['(CH2)3OH', 4, 1],
  ['HOOCCH2', 3, 2],
  ['CH2Ph', 8, 0],
  ['CH2CN', 3, 0],
  ['CH2OMe', 3, 1],
  ['COOH', 2, 2],
  ['CF3', 2, 0],
  // Nested / unsaturated (were fragile)
  ['CH(CH2OH)COOH', 4, 3], // c0 + C(CO)C(=O)O → 3C+3O + scaffold C
  ['C(CH3)2CH2OH', 5, 1], // c0 + C(C)(C)CO
  ['CH=CHCOOH', 4, 2], // c0 + C=CC(=O)O
  ['C≡CPh', 9, 0], // c0 + C#Cc1ccccc1 (8C merge → 8 new? merge first: 1+7=8 +c0=9)
  // Hexyl on carbon: c0–a1, a1 merges with first of CCCCCC → c0 + 6C = 7
  ['C6H13', 7, 0],
  ['C2H5', 3, 0],
  ['n-C12H25', 13, 0],
  ['i-C3H7', 4, 0],
  ['t-C4H9', 5, 0],
];

for (const [alias, expC, expO] of cases) {
  const ex = expandAliasesFor3D(mol(alias));
  const c = count(ex, 'C');
  const o = count(ex, 'O');
  if (c !== expC) throw new Error(`${alias}: expected ${expC} C, got ${c}`);
  if (o !== expO) throw new Error(`${alias}: expected ${expO} O, got ${o}`);
  if (ex.atoms.find(a => a.id === 'a1')?.alias) {
    throw new Error(`${alias}: alias not cleared`);
  }
}

// OPh on oxygen
const oph = expandAliasesFor3D(mol('OPh', 'O'));
if (count(oph, 'C') < 6) throw new Error('OPh should add phenyl carbons');
if (oph.atoms.find(a => a.id === 'a1')?.alias) throw new Error('OPh clear');

// Boc on N
const boc = expandAliasesFor3D(mol('Boc', 'N'));
if (count(boc, 'O') < 2) throw new Error('Boc should add oxygens');

// TIPS on O (silyl)
const tips = expandAliasesFor3D(mol('TIPS', 'O'));
if (count(tips, 'Si') < 1) throw new Error('TIPS should add Si');
if (tips.atoms.find(a => a.id === 'a1')?.alias) throw new Error('TIPS clear');

const coona = expandAliasesFor3D(mol('COONa'));
if (coona.atoms.find(a => a.id === 'a1')?.alias) throw new Error('COONa alias not cleared');
if (count(coona, 'O') !== 2) throw new Error(`COONa should add two O, got ${count(coona, 'O')}`);
if (count(coona, 'Na') !== 1) throw new Error(`COONa should place Na⁺, got ${count(coona, 'Na')}`);
if (!coona.atoms.some(a => a.element === 'O' && (a.charge ?? 0) === -1)) {
  throw new Error('COONa should have O⁻');
}
if (!coona.atoms.some(a => a.element === 'Na' && (a.charge ?? 0) === 1)) {
  throw new Error('COONa Na should be +1');
}
if (coona.bonds.some(b => {
  const ends = [b.fromAtomId, b.toAtomId];
  const na = coona.atoms.find(a => a.element === 'Na');
  return na ? ends.includes(na.id) : false;
})) {
  throw new Error('COONa Na⁺ must not be covalently bonded');
}

const nabh4 = expandAliasesFor3D(mol('NaBH4'));
if (nabh4.atoms.find(a => a.id === 'a1')?.alias) throw new Error('NaBH4 alias not cleared');
if (nabh4.atoms.find(a => a.id === 'a1')?.element !== 'B') throw new Error('NaBH4 labeled atom should become B');
if ((nabh4.atoms.find(a => a.id === 'a1')?.charge ?? 0) !== -1) throw new Error('NaBH4 B should be −1');
if (count(nabh4, 'Na') !== 1) throw new Error(`NaBH4 should place Na⁺, got ${count(nabh4, 'Na')}`);
if (!nabh4.atoms.some(a => a.element === 'Na' && (a.charge ?? 0) === 1)) {
  throw new Error('NaBH4 Na should be +1');
}
if (nabh4.bonds.some(b => {
  const ends = [b.fromAtomId, b.toAtomId];
  const na = nabh4.atoms.find(a => a.element === 'Na');
  return na ? ends.includes(na.id) : false;
})) {
  throw new Error('NaBH4 Na⁺ must not be covalently bonded');
}

// Tokenizer must consume common linear strings fully
for (const s of [
  'CH2CH2COOME',
  'CH2PH',
  'OCH2CH3',
  'CH2CH2CH2OH',
  'CHCH2',
  'NHAC',
]) {
  const key = normalizeCondensedKey(s);
  const tok = tokenizeCondensedFormula(key);
  if (!tok) throw new Error(`tokenize failed: ${s} → ${key}`);
}

// OCH2CH3 on O
const oet = expandAliasesFor3D({
  atoms: [
    { id: 'c0', element: 'C', x: 0, y: 0, charge: 0 },
    { id: 'o1', element: 'O', x: 40, y: 0, charge: 0, alias: 'OCH2CH3' },
  ],
  bonds: [{ id: 'b1', fromAtomId: 'c0', toAtomId: 'o1', order: 1 }],
});
if (count(oet, 'C') !== 3) throw new Error(`OCH2CH3 on O → 3 C, got ${count(oet, 'C')}`);

// OC6H13 on oxygen (hexyloxy)
const oc6 = expandAliasesFor3D({
  atoms: [
    { id: 'c0', element: 'C', x: 0, y: 0, charge: 0 },
    { id: 'o1', element: 'O', x: 40, y: 0, charge: 0, alias: 'OC6H13' },
  ],
  bonds: [{ id: 'b1', fromAtomId: 'c0', toAtomId: 'o1', order: 1 }],
});
if (count(oc6, 'C') !== 7) throw new Error(`OC6H13 on O → 7 C, got ${count(oc6, 'C')}`);
if (oc6.atoms.find(a => a.id === 'o1')?.alias) throw new Error('OC6H13 alias not cleared');

// Unknown junk stays display-only (no throw)
const unk = resolveAliasToSmiles('R1', 'C');
if (unk != null && unk.attach !== 'clear') {
  // R1 may fail strict — null is OK
}

// ── Label normalization + charge split ──────────────────────────────────────
const assertCharge = (raw: string, body: string, charge: number | null) => {
  const got = splitAliasCharge(raw);
  if (got.body !== body || got.charge !== charge) {
    throw new Error(`splitAliasCharge(${raw}): expected {${body}, ${charge}}, got {${got.body}, ${got.charge}}`);
  }
};
assertCharge('NH2+', 'NH2', 1);
assertCharge('C6H13+', 'C6H13', 1);
assertCharge('C6H132+', 'C6H13', 2);
assertCharge('(CH2)3NH2+', '(CH2)3NH2', 1);
assertCharge('(CH2)3NH22+', '(CH2)3NH2', 2);
if (normalizeAliasLabelCharacters('(CH₂)₃CH₃') !== '(CH2)3CH3') {
  throw new Error('unicode subscript normalize');
}
if (normalizeCondensedKey('NH₂') !== 'NH2') throw new Error('NH₂ key should be NH2');

// Carbon with alias NH2 (and NH₂) plus two carbon bonds and one explicit H
// still gains a bonded nitrogen. A real terminal N is left in place.
const aminoCarbon = (alias: string): Molecule => ({
  atoms: [
    { id: 'c1', element: 'C', x: 0, y: 0, charge: 0 },
    { id: 'c2', element: 'C', x: 40, y: 0, charge: 0, alias },
    { id: 'c3', element: 'C', x: 80, y: 0, charge: 0 },
    { id: 'h1', element: 'H', x: 40, y: 30, charge: 0 },
  ],
  bonds: [
    { id: 'b1', fromAtomId: 'c1', toAtomId: 'c2', order: 1 },
    { id: 'b2', fromAtomId: 'c2', toAtomId: 'c3', order: 1 },
    { id: 'b3', fromAtomId: 'c2', toAtomId: 'h1', order: 1 },
  ],
});
const bondedTo = (m: Molecule, id: string, el: string) =>
  m.bonds.some(b => {
    const other = b.fromAtomId === id ? b.toAtomId : b.toAtomId === id ? b.fromAtomId : '';
    return other && m.atoms.find(a => a.id === other)?.element === el;
  });
for (const alias of ['NH2', 'NH₂']) {
  const ex = expandAliasesFor3D(aminoCarbon(alias));
  if (ex.atoms.find(a => a.id === 'c2')?.alias) throw new Error(`${alias}: alias not cleared`);
  if (!bondedTo(ex, 'c2', 'N')) throw new Error(`${alias}: carbon should be bonded to N`);
  if (count(ex, 'N') !== 1) throw new Error(`${alias}: expected 1 N, got ${count(ex, 'N')}`);
}
const terminalN = expandAliasesFor3D({
  atoms: [
    { id: 'c0', element: 'C', x: 0, y: 0, charge: 0 },
    { id: 'n1', element: 'N', x: 40, y: 0, charge: 0 },
  ],
  bonds: [{ id: 'b1', fromAtomId: 'c0', toAtomId: 'n1', order: 1 }],
});
if (!terminalN.atoms.some(a => a.id === 'n1' && a.element === 'N')) {
  throw new Error('real terminal N should be preserved');
}
if (count(terminalN, 'N') !== 1) throw new Error('terminal N must not be duplicated');

const carboxyl = expandAliasesFor3D(mol('COOH'));
if (carboxyl.atoms.find(a => a.id === 'a1')?.alias) throw new Error('COOH alias not cleared');
if (count(carboxyl, 'O') < 2) throw new Error(`COOH should add two O, got ${count(carboxyl, 'O')}`);
if (!bondedTo(carboxyl, 'a1', 'O')) throw new Error('COOH carbon should be bonded to O');

if (!looksLikeExpandableFormulaLabel('C18H37')) throw new Error('C18H37 expandable');
if (!looksLikeExpandableFormulaLabel('(CH2)3CH3')) throw new Error('paren expandable');
const c18 = condensedToSmiles('C18H37');
if (!c18?.smiles) throw new Error('C18H37 condensedToSmiles');

console.log('alias3dExpandSmoke OK');
