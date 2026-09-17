/**
 * Molfile stereo survives parse + hydrogen stripping (Mathpix / ChemDraw imports).
 * Run: npx tsx packages/core/src/__tests__/molblockStereoImport.ts
 */
import { parseMolblock } from '../io/molblock';
import { stripExplicitHydrogens } from '../molecule/importPlacement';
import { prepareImportFromMolblock } from '../molecule/importPrepare';

let failed = 0;
const check = (name: string, cond: boolean, detail?: unknown): void => {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`, detail !== undefined ? detail : '');
  }
};

const chiralMol = `MolDraw
  Moldraw

  5  4  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  1  0  0  0  0  0  0  0  0  0
    1.2000    0.0000    0.0000 Br  0  0  0  0  0  0  0  0  0  0  0  0
   -0.6000    1.0392    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0
   -0.6000   -1.0392    0.0000 F   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    0.8000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
  1  5  1  1  0  0  0
M  END
`;

const chargedIso = `MolDraw
  Moldraw

  2  1  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
M  CHG  1   2  -1
M  ISO  1   1  13
M  END
`;

console.log('molblock stereo import\n');

{
  const parsed = parseMolblock(chiralMol);
  const wedge = parsed.bonds.find(b => b.stereo === 'wedge');
  check('parse: wedge bond present', Boolean(wedge), parsed.bonds.map(b => b.stereo));
  const h = parsed.atoms.find(a => a.element === 'H');
  check('parse: explicit H present', Boolean(h));
  check('parse: carbon stereo care', parsed.atoms.some(a => a.element === 'C' && a.mdlStereoCare === 1));

  const stripped = stripExplicitHydrogens(parsed);
  check(
    'strip H: stereo H kept',
    stripped.atoms.some(a => a.element === 'H'),
    stripped.atoms.map(a => a.element),
  );
  check(
    'strip H: wedge survives',
    stripped.bonds.some(b => b.stereo === 'wedge'),
    stripped.bonds.map(b => b.stereo),
  );

  const prepared = prepareImportFromMolblock({ molblock: chiralMol, bondLengthPx: 40 });
  check('prepareImport: ok', prepared.ok);
  if (prepared.ok) {
    check(
      'prepareImport: wedge kept',
      prepared.bonds.some(b => b.stereo === 'wedge'),
      prepared.bonds.map(b => b.stereo),
    );
  }
}

{
  const parsed = parseMolblock(chargedIso);
  const c = parsed.atoms.find(a => a.element === 'C');
  const o = parsed.atoms.find(a => a.element === 'O');
  check('charge: O is -1', o?.charge === -1, o?.charge);
  check('isotope: C is 13', c?.isotope === 13, c?.isotope);
}

if (failed) {
  console.error(`\nFAIL: ${failed} check(s)`);
  process.exit(1);
}
console.log('\nPASS');
