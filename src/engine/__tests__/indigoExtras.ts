/**
 * Indigo CIP / convert / aromatize smoke test.
 * Run: npx tsx src/engine/__tests__/indigoExtras.ts
 */
import { loadIndigo, indigoCalculateCip, indigoConvert, indigoAromatizeMolblock } from '@moldraw/engine-2d/indigo';
import { parseCipKetJson } from '@moldraw/engine-2d/indigo/cip';

let failed = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('OK:  ', msg);
  }
};

const CHIRAL = `alanine
  Moldraw

  6  5  0  0  1  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.8000    1.0392    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    1.8000   -1.0392    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    1.2000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  2  0  0  0  0
  2  4  1  0  0  0  0
  1  5  1  1  0  0  0
  1  6  1  0  0  0  0
M  END
`;

const BENZ = `benzene
  Moldraw

  6  6  0  0  0  0            999 V2000
    1.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.5000    0.8660    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.5000    0.8660    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.5000   -0.8660    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.5000   -0.8660    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  2  0  0  0  0
  3  4  1  0  0  0  0
  4  5  2  0  0  0  0
  5  6  1  0  0  0  0
  6  1  2  0  0  0  0
M  END
`;

const main = async () => {
  console.log('=== Indigo CIP / convert / aromatize ===\n');
  const indigo = await loadIndigo();
  assert(!!indigo, 'Indigo loads');
  if (!indigo) process.exit(1);

  const tags = indigoCalculateCip(CHIRAL, indigo);
  assert(!!tags && tags.atomStereoTags.length >= 1, 'CIP has atom tags');
  assert(tags!.atomStereoTags.some(t => t.cip === 'R' || t.cip === 'S'), 'CIP R or S');

  const ket = indigo.calculateCip(CHIRAL, 'ket', new indigo.MapStringString());
  const parsed = parseCipKetJson(ket);
  assert(!!parsed && parsed.atomStereoTags.length >= 1, 'parseCipKetJson');

  const inchi = indigoConvert(CHIRAL, 'inchi', indigo);
  assert(!!inchi && inchi.startsWith('InChI='), 'convert→inchi');
  const back = indigoConvert(inchi!, 'molfile', indigo);
  assert(!!back && back.includes('V2000'), 'inchi→molfile');

  const bondOrders = (mb: string) => {
    const lines = mb.replace(/\r/g, '').split('\n');
    const counts = lines.find(l => l.includes('V2000'));
    if (!counts) return [] as number[];
    const nb = Number(counts.substring(3, 6).trim());
    const atomLineIdx = lines.indexOf(counts);
    const bondLines = lines.slice(atomLineIdx + 1 + Number(counts.substring(0, 3).trim()), atomLineIdx + 1 + Number(counts.substring(0, 3).trim()) + nb);
    return bondLines.map(l => Number(l.substring(6, 9).trim()));
  };
  const arom = indigoAromatizeMolblock(BENZ, indigo, 'aromatize');
  assert(!!arom && bondOrders(arom!).every(o => o === 4), `aromatize bond type 4 (got ${bondOrders(arom ?? '').join(',')})`);
  const dear = indigoAromatizeMolblock(arom!, indigo, 'dearomatize');
  assert(
    !!dear && bondOrders(dear!).every(o => o === 1 || o === 2),
    `dearomatize clears aromatic (got ${bondOrders(dear ?? '').join(',')})`,
  );

  if (failed) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
  }
  console.log('\nIndigo extras OK.');
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
