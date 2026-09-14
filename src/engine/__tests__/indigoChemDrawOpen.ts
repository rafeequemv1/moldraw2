/**
 * ChemDraw CDXML/CDX open via Indigo.
 * Run: npx tsx src/engine/__tests__/indigoChemDrawOpen.ts
 */
import { loadIndigo, indigoChemDrawToMolblock } from '@moldraw/engine-2d/indigo';
import { looksLikeCdxBinary } from '@moldraw/core/io/resolveMoleculeFile';

let failed = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('OK:  ', msg);
  }
};

const main = async () => {
  const indigo = await loadIndigo();
  assert(!!indigo, 'Indigo loads');
  if (!indigo) process.exit(1);

  const opts = new indigo.MapStringString();
  const mol = indigo.convert('c1ccccc1O', 'molfile', opts);
  const cdxml = indigo.convert(mol, 'cdxml', opts);
  const fromXml = indigoChemDrawToMolblock(cdxml, 'cdxml', indigo);
  assert(!!fromXml && fromXml.includes('V2000'), 'CDXML→molblock');

  const cdxB64 = indigo.convert(mol, 'cdx', opts);
  const fromCdx = indigoChemDrawToMolblock(cdxB64, 'cdx', indigo);
  assert(!!fromCdx && fromCdx.includes('V2000'), 'CDX base64→molblock');

  const bin = Buffer.from(cdxB64, 'base64');
  assert(looksLikeCdxBinary(bin), 'VjCD magic detected');
  const again = indigoChemDrawToMolblock(bin.toString('base64'), 'cdx', indigo);
  assert(!!again && again.includes('V2000'), 'file bytes→b64→molblock');

  if (failed) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
  }
  console.log('\nChemDraw open OK.');
};

main().catch(e => {
  console.error(e);
  process.exit(1);
});
