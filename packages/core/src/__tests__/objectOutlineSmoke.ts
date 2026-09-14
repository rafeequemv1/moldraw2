import { createMoleculeStore, CMD, resolveOutlineRows } from '../index';
import { engine } from '@moldraw/engine';

const store = createMoleculeStore();
const bz = engine.generate2D(engine.parseSmiles('c1ccccc1'));
store.applyCommand(CMD.MergeImportedStructure, { atoms: bz.atoms, bonds: bz.bonds });
const et = engine.generate2D(engine.parseSmiles('CCO'));
store.applyCommand(CMD.MergeImportedStructure, {
  atoms: et.atoms.map(a => ({ ...a, x: a.x + 200 })),
  bonds: et.bonds,
});

const created = store.applyCommand(CMD.CreateObjectCollection, { name: 'Group A' });
if (!created.ok) throw new Error('create failed');

let rows = resolveOutlineRows(store.getMolecule());
const molKey = rows.find(x => x.objectKind === 'Mol')?.key;
const colKey = rows.find(x => x.isCollection)?.key;
if (!molKey || !colKey) throw new Error('missing mol/collection');

store.applyCommand(CMD.PlaceObjectOutlineItem, { key: molKey, targetKey: colKey });
store.applyCommand(CMD.RenameObjectOutline, { key: colKey, name: 'My folder' });
store.applyCommand(CMD.MoveObjectOutline, { key: molKey, direction: 'down' });

rows = resolveOutlineRows(store.getMolecule());
const nested = rows.filter(r => r.depth === 1);
if (nested.length < 1) throw new Error('expected nested item');
if (rows.find(r => r.isCollection)?.label !== 'My folder') throw new Error('rename failed');

console.log('objectOutlineSmoke OK', rows.map(r => `${r.depth}:${r.kind}:${r.label}`).join(' | '));
