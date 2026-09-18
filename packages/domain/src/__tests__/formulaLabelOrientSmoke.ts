/**
 * ACS condensed-label orientation (H3C vs CH3, HO vs OH, …).
 * Run: npx tsx --tsconfig tsconfig.app.json packages/domain/src/__tests__/formulaLabelOrientSmoke.ts
 */
import { orientFormulaLabel, tokenizeFormulaUnits } from '../formulaLabelOrient';

const fail = (msg: string): never => {
  throw new Error(msg);
};
const eq = (got: unknown, want: unknown, msg: string): void => {
  if (got !== want) fail(`${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

eq(tokenizeFormulaUnits('CH3').join('|'), 'C|H3', 'CH3 units');
eq(tokenizeFormulaUnits('H3C').join('|'), 'H3|C', 'H3C units');
eq(tokenizeFormulaUnits('OH').join('|'), 'O|H', 'OH units');
eq(tokenizeFormulaUnits('HO').join('|'), 'H|O', 'HO is hydroxy, not holmium');
eq(tokenizeFormulaUnits('COOH').join('|'), 'C|O|O|H', 'COOH units');
eq(tokenizeFormulaUnits('COONa').join('|'), 'C|O|O|Na', 'COONa units');
eq(tokenizeFormulaUnits('OAc').join('|'), 'O|Ac', 'OAc units');
eq(tokenizeFormulaUnits('CO2H').join('|'), 'C|O2|H', 'CO2H units');
eq(tokenizeFormulaUnits('CF3').join('|'), 'C|F3', 'CF3 is carbon-fluorine, not californium');
eq(tokenizeFormulaUnits('NH2').join('|'), 'N|H2', 'NH2 units');
eq(tokenizeFormulaUnits('OMe').join('|'), 'O|Me', 'OMe units');
eq(tokenizeFormulaUnits('MeO').join('|'), 'Me|O', 'MeO units');

const left = (raw: string, el: string) => orientFormulaLabel(raw, el, true);
const right = (raw: string, el: string) => orientFormulaLabel(raw, el, false);

eq(right('CH3', 'C').text, 'CH3', 'right methyl is CH3');
eq(right('CH3', 'C').headIndex, 0, 'right methyl head at C');
eq(left('CH3', 'C').text, 'H3C', 'left methyl is H3C');
eq(left('CH3', 'C').head, 'C', 'left methyl head is C');
eq(left('CH3', 'C').text[left('CH3', 'C').headIndex], 'C', 'left methyl C toward bond');

eq(left('H3C', 'C').text, 'H3C', 'already-left H3C stays H3C');
eq(right('H3C', 'C').text, 'CH3', 'right-side H3C flips to CH3');

eq(right('OH', 'O').text, 'OH', 'right hydroxy is OH');
eq(left('OH', 'O').text, 'HO', 'left hydroxy is HO (O bonds, H outward left)');
eq(left('HO', 'O').text, 'HO', 'already-left HO stays HO');
eq(right('HO', 'O').text, 'OH', 'right-side HO flips to OH');

eq(left('NH2', 'N').text, 'H2N', 'left amine is H2N');
eq(right('NH2', 'N').text, 'NH2', 'right amine is NH2');
eq(left('NH2', 'C').text, 'H2N', 'NH2 written on carbon still flips to H2N');
eq(right('NH2', 'C').text, 'NH2', 'NH2 on carbon stays NH2 when the bond is on the left');
eq(left('NO2', 'C').text, 'O2N', 'NO2 on carbon flips to O2N');
eq(right('NO2', 'C').text, 'NO2', 'NO2 on carbon stays NO2 on the right');
eq(left('CHO', 'C').text, 'OHC', 'left aldehyde is OHC');
eq(right('CHO', 'C').text, 'CHO', 'right aldehyde stays CHO');

eq(left('COOH', 'C').text, 'HOOC', 'left acid is HOOC');
eq(right('COOH', 'C').text, 'COOH', 'right acid stays COOH');
eq(left('HOOC', 'C').text, 'HOOC', 'already-left HOOC stays');
eq(right('HOOC', 'C').text, 'COOH', 'right-side HOOC flips to COOH');

eq(left('COONa', 'C').text, 'NaOOC', 'left salt is NaOOC');
eq(right('COONa', 'C').text, 'COONa', 'right salt is COONa');
eq(left('NaOOC', 'C').text, 'NaOOC', 'already-left NaOOC stays');
eq(right('NaOOC', 'C').text, 'COONa', 'right-side NaOOC flips to COONa');

eq(left('OAc', 'O').text, 'AcO', 'left acetate is AcO (O bonds)');
eq(right('OAc', 'O').text, 'OAc', 'right acetate is OAc');
eq(left('CO2H', 'C').text, 'HO2C', 'left CO2H is HO2C');
eq(right('CO2H', 'C').text, 'CO2H', 'right CO2H stays CO2H');

eq(left('CH2', 'C').text, 'H2C', 'left methylene is H2C');
eq(left('NO2', 'N').text, 'O2N', 'left nitro is O2N');
eq(left('CN', 'C').text, 'NC', 'left nitrile is NC');
eq(left('CF3', 'C').text, 'F3C', 'left CF3 is F3C');
eq(left('OMe', 'O').text, 'MeO', 'left methoxy is MeO');

eq(left('Me', 'C').mode, 'block', 'Me has no C glyph — block shift');
eq(left('Me', 'C').text, 'Me', 'Me reading order stays LTR');
eq(left('Ph', 'C').mode, 'block', 'Ph is block');
eq(left('Boc', 'N').mode, 'block', 'Boc is block');

eq(left('CH3', 'C').mode, 'formula', 'CH3 is formula');
eq(left('OH', 'O').tailGoesLeft, true, 'left flag is preserved');

console.log('formulaLabelOrientSmoke OK');
