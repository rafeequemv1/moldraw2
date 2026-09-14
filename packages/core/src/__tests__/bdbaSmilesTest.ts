import { engine } from '@moldraw/engine';
import { parseMolblock } from '../index';

const smiles = [
  'Bc1ccc(B)cc1',
  'OB(O)c1ccc(B(O)O)cc1',
  'B(O)(O)c1ccc(B(O)O)cc1',
  'B(C1=CC=C(C=C1)B(O)O)(O)O',
];
for (const s of smiles) {
  try {
    const p = engine.parseSmiles(s);
    console.log(s, 'atoms', p.atoms.length, p.atoms.map(a => a.element).join(''));
  } catch (e) {
    console.log(s, 'ERR', (e as Error).message);
  }
}
