import assert from 'node:assert/strict';
import type { Molecule } from '@moldraw/domain';
import {
  applyMoleculeCoordsTable,
  looksLikeCoordsTableText,
  moleculeCoordsTableText,
  parseMoleculeCoordsTable,
} from '../io/moleculeCoordsTable';

const mol: Molecule = {
  atoms: [
    { id: 'a1', element: 'C', x: 438.004, y: 252.876, charge: 0 },
    { id: 'a2', element: 'O', x: 0, y: -505.76, charge: 0 },
  ],
  bonds: [],
};

const table = moleculeCoordsTableText(mol);
assert.ok(table.startsWith('index\telement\tx_px\ty_px'));
assert.ok(table.includes('1\tC\t438.00\t252.88'));
assert.ok(table.includes('2\tO\t0.00\t-505.76'));

const parsed = parseMoleculeCoordsTable(table);
assert.equal(parsed.ok, true);
if (!parsed.ok) throw new Error('parse failed');

const applied = applyMoleculeCoordsTable(
  { ...mol, atoms: mol.atoms.map(a => ({ ...a, x: a.x + 10, y: a.y + 10 })) },
  parsed.rows,
  ['a1', 'a2'],
);
assert.equal(applied.applied, 2);
assert.ok(Math.abs(applied.molecule.atoms.find(a => a.id === 'a1')!.x - 438.004) < 0.01);

const markdown = `| Atom | Current X | Current Y | Corrected X | Corrected Y |
| ---- | --------: | --------: | ----------: | ----------: |
| O19 | -482.93 | -94.00 | **-477.25** | **-87.26** |`;
const mdParsed = parseMoleculeCoordsTable(markdown);
assert.equal(mdParsed.ok, true);
if (mdParsed.ok) {
  assert.equal(mdParsed.rows[0]?.element, 'O');
  assert.equal(mdParsed.rows[0]?.x, -477.25);
  assert.equal(mdParsed.rows[0]?.y, -87.26);
}

const moldrawExport = `index\telement\tx_px\ty_px\tisotope\tcharge\talias
1\tC\t-484.80\t-171.82\t\t\t
2\tC\t-461.40\t-212.35\t\t\t`;
assert.equal(looksLikeCoordsTableText(moldrawExport), true);
assert.equal(parseMoleculeCoordsTable(moldrawExport).ok, true);

console.log('moleculeCoordsTableTest OK');
