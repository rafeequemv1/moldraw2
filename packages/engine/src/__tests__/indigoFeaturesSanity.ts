/**
 * Quick sanity for calculate / automap / druglike wrappers.
 * Run: npx tsx src/engine/__tests__/indigoFeaturesSanity.ts
 */
import {
  loadIndigo,
  indigoCalculate,
  indigoDruglikeProperties,
  indigoAutomap,
  buildRxnFromMolblocks,
  indigoLayoutMolblock,
} from '@moldraw/engine-2d/indigo';

const ETH = `ethanol
  x

  3  2  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.2500    1.2990    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
M  END
`;

const CBR = `cbr
  x

  2  1  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 Br  0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
M  END
`;

const CO = `co
  x

  2  1  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
M  END
`;

const main = async () => {
  const indigo = await loadIndigo();
  if (!indigo) throw new Error('no indigo');

  const calc = indigoCalculate(ETH, indigo);
  console.log('calculate', calc);

  const drug = indigoDruglikeProperties(ETH, indigo);
  console.log('druglike', drug);

  const soft = indigoLayoutMolblock(ETH, indigo, { mode: 'clean2d', selectedAtomIndices: [0, 1] });
  console.log('clean2d ok', !!soft && soft.includes('V2000'));

  const rxn = buildRxnFromMolblocks(CBR, CO);
  const mapped = indigoAutomap(rxn, indigo, 'discard');
  console.log('automap maps', mapped?.maps);
  console.log('automap byComp', mapped?.mapsByComponent);

  const smilesMapped = indigoAutomap('CBr.O>>CO', indigo, 'discard');
  console.log('smiles automap maps', smilesMapped?.maps);
};

main().catch(e => {
  console.error(e);
  process.exit(1);
});
