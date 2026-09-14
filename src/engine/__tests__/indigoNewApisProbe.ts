/**
 * Probe Indigo automap / calculate / logp / pka / clean2d.
 * Run: npx tsx src/engine/__tests__/indigoNewApisProbe.ts
 */
import { loadIndigo } from '@moldraw/engine-2d/indigo';

const ETHANOL = `ethanol
  Moldraw

  3  2  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.2500    1.2990    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
M  END
`;

const RXN = `$RXN

  Moldraw

  2  1
$MOL

  Moldraw

  2  1  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 Br  0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
M  END
$MOL

  Moldraw

  3  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    2.2500    1.2990    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
M  END
$MOL

  Moldraw

  2  1  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
M  END
`;

const main = async () => {
  const indigo = await loadIndigo();
  if (!indigo) throw new Error('no indigo');
  const opts = new indigo.MapStringString();
  opts.set('ignore-stereochemistry-errors', 'true');

  const tryCall = (label: string, fn: () => unknown) => {
    try {
      const out = fn();
      const s = typeof out === 'string' ? out : JSON.stringify(out);
      console.log(`\n=== ${label} ===\n`, String(s).slice(0, 500));
    } catch (e) {
      console.log(`\n=== ${label} ERR ===\n`, e);
    }
  };

  // calculate properties
  const props = new indigo.MapStringString();
  props.set('molecular-weight', '');
  props.set('most-abundant-mass', '');
  props.set('monoisotopic-mass', '');
  props.set('mass-composition', '');
  props.set('gross-formula', '');
  tryCall('calculate', () => (indigo as { calculate: Function }).calculate(ETHANOL, props, opts));

  tryCall('logp', () => (indigo as { logp: Function }).logp(ETHANOL, opts));
  tryCall('molarRefractivity', () => (indigo as { molarRefractivity: Function }).molarRefractivity(ETHANOL, opts));
  tryCall('pka', () => (indigo as { pka: Function }).pka(ETHANOL, opts));
  tryCall('pkaValues', () => (indigo as { pkaValues: Function }).pkaValues(ETHANOL, opts));

  // clean2d with empty selection
  tryCall('clean2d', () => {
    const sel = new indigo.VectorInt();
    return indigo.clean2d(ETHANOL, 'molfile', opts, sel);
  });

  // automap modes
  for (const mode of ['discard', 'keep', 'alter', 'clear', 'clearkeep']) {
    tryCall(`automap ${mode}`, () =>
      (indigo as { automap: Function }).automap(RXN, mode, 'rxnfile', opts),
    );
  }

  // also try smiles reaction
  tryCall('automap from smiles rxn', () =>
    (indigo as { automap: Function }).automap('CBr.O>>CO', 'discard', 'rxnfile', opts),
  );
};

main().catch(e => {
  console.error(e);
  process.exit(1);
});
