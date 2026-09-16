/**
 * Per-glyph coloring for condensed / alias labels (OH, NH2, CH3, CO2H).
 * Run: npx tsx --tsconfig tsconfig.app.json packages/domain/src/__tests__/formulaLabelColorSmoke.ts
 */
import type { Atom } from '../types';
import {
  DEFAULT_ATOM_INK,
  ELEMENT_COLORS,
  EXPLICIT_HYDROGEN_COLOR,
  formulaLabelCharFills,
  tokenizeFormulaLabelForColor,
} from '../index';

const fail = (msg: string): never => {
  throw new Error(msg);
};
const eq = (got: unknown, want: unknown, msg: string): void => {
  if (got !== want) fail(`${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const oxygen: Atom = { id: 'o', element: 'O', x: 0, y: 0, charge: 0 };
const nitrogen: Atom = { id: 'n', element: 'N', x: 0, y: 0, charge: 0 };
const carbon: Atom = { id: 'c', element: 'C', x: 0, y: 0, charge: 0 };
const colorOn = { useElementColors: true as const };

eq(
  tokenizeFormulaLabelForColor('OH').map(t => `${t.text}:${t.element}`).join('|'),
  'O:O|H:H',
  'OH tokens',
);
eq(
  tokenizeFormulaLabelForColor('NH2').map(t => `${t.text}:${t.element}`).join('|'),
  'N:N|H:H|2:H',
  'NH2 tokens',
);
eq(
  tokenizeFormulaLabelForColor('CH3').map(t => `${t.text}:${t.element}`).join('|'),
  'C:C|H:H|3:H',
  'CH3 tokens',
);
eq(
  tokenizeFormulaLabelForColor('COONa').map(t => `${t.text}:${t.element}`).join('|'),
  'C:C|O:O|O:O|Na:Na',
  'COONa tokens (Na not nitrogen)',
);
eq(
  tokenizeFormulaLabelForColor('COONA').map(t => `${t.text}:${t.element}`).join('|'),
  'C:C|O:O|O:O|NA:Na',
  'COONA tokens still parse Na',
);

const oh = formulaLabelCharFills('OH', oxygen, colorOn);
eq(oh[0], ELEMENT_COLORS.O, 'OH: O is oxygen red');
eq(oh[1], EXPLICIT_HYDROGEN_COLOR, 'OH: H is hydrogen color, not oxygen red');

const nh2 = formulaLabelCharFills('NH2', nitrogen, colorOn);
eq(nh2[0], ELEMENT_COLORS.N, 'NH2: N is nitrogen blue');
eq(nh2[1], EXPLICIT_HYDROGEN_COLOR, 'NH2: H is hydrogen color, not nitrogen');
eq(nh2[2], EXPLICIT_HYDROGEN_COLOR, 'NH2: subscript 2 follows hydrogen');

const ch3 = formulaLabelCharFills('CH3', carbon, colorOn);
eq(ch3[0], DEFAULT_ATOM_INK, 'CH3: C is carbon ink');
eq(ch3[1], EXPLICIT_HYDROGEN_COLOR, 'CH3: H is hydrogen color');

const co2h = formulaLabelCharFills('CO2H', carbon, colorOn);
eq(co2h[0], DEFAULT_ATOM_INK, 'CO2H: C ink');
eq(co2h[1], ELEMENT_COLORS.O, 'CO2H: O red');
eq(co2h[2], ELEMENT_COLORS.O, 'CO2H: 2 follows oxygen');
eq(co2h[3], EXPLICIT_HYDROGEN_COLOR, 'CO2H: H hydrogen');

const ohOff = formulaLabelCharFills('OH', oxygen, { useElementColors: false });
eq(ohOff[0], DEFAULT_ATOM_INK, 'color off: O is default ink');
eq(ohOff[1], DEFAULT_ATOM_INK, 'color off: H is default ink, not red');

console.log('formulaLabelColorSmoke OK');
